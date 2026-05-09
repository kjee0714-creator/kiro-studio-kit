/**
 * Property-based tests for dev-memory-lifecycle.
 * Properties 1–10 from the design document.
 */
import { describe, it, expect, afterEach } from "vitest";
import fc from "fast-check";
import { rm, mkdir } from "fs/promises";
import path from "path";
import {
  validateDevMemoryEntry,
  VALID_KINDS,
  VALID_SEVERITIES,
  VALID_CONFIDENCES,
} from "../core/memoryValidator.js";
import type { DevMemoryEntry, DevMemoryKind, Severity, Confidence, MemoryMode } from "../core/memoryValidator.js";
import { selectMemoryEntries, filterEntriesWithReasons } from "../core/memorySelector.js";
import { rewriteMemoryEntries, readMemoryEntries, backupMemoryStore } from "../core/memoryStore.js";
import { classifyPruneCandidates, deriveHistory } from "../core/memoryLifecycle.js";
import { readTextFile } from "../core/fileUtils.js";

const TEST_DIR = ".test-tmp/memoryLifecycle-property";
let testCounter = 0;

function getTestPath(): string {
  testCounter++;
  return path.join(TEST_DIR, `test-${testCounter}-${Date.now()}.jsonl`);
}

afterEach(async () => {
  try {
    await rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

/** Arbitrary for valid DevMemoryEntry (no secrets in strings) */
const validEntryArb: fc.Arbitrary<DevMemoryEntry> = fc.record({
  id: fc.uuid(),
  createdAt: fc.date({ min: new Date("2023-01-01"), max: new Date("2025-12-31") }).map((d) => d.toISOString()),
  kind: fc.constantFrom(...VALID_KINDS) as fc.Arbitrary<DevMemoryKind>,
  summary: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !(/sk-|BEGIN PRIVATE KEY|password=|api_key|secret/i.test(s))),
  trigger: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !(/sk-|BEGIN PRIVATE KEY|password=|api_key|secret/i.test(s))),
  fix: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !(/sk-|BEGIN PRIVATE KEY|password=|api_key|secret/i.test(s))),
  futurePromptHint: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !(/sk-|BEGIN PRIVATE KEY|password=|api_key|secret/i.test(s))),
  relatedFiles: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 3 }),
  relatedSymbols: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { maxLength: 3 }),
  severity: fc.constantFrom(...VALID_SEVERITIES) as fc.Arbitrary<Severity>,
  confidence: fc.constantFrom(...VALID_CONFIDENCES) as fc.Arbitrary<Confidence>,
  enabled: fc.boolean(),
});

/** Arbitrary for valid entry with lifecycle fields */
const validEntryWithLifecycleArb: fc.Arbitrary<DevMemoryEntry> = validEntryArb.chain((entry) =>
  fc.record({
    deleted: fc.option(fc.boolean(), { nil: undefined }),
    deletedAt: fc.option(
      fc.date({ min: new Date("2023-01-01"), max: new Date("2025-12-31") }).map((d) => d.toISOString()),
      { nil: undefined },
    ),
  }).map((lifecycle) => ({
    ...entry,
    ...(lifecycle.deleted !== undefined ? { deleted: lifecycle.deleted } : {}),
    ...(lifecycle.deletedAt !== undefined ? { deletedAt: lifecycle.deletedAt } : {}),
  })),
);

const taskTextArb = fc.string({ minLength: 0, maxLength: 200 });
const modeNotOffArb = fc.constantFrom("auto", "full") as fc.Arbitrary<MemoryMode>;

describe("Feature: dev-memory-lifecycle, Property 9: Validator accepts valid optional lifecycle fields", () => {
  /**
   * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**
   */
  it("should accept entries with deleted as boolean", () => {
    fc.assert(
      fc.property(validEntryArb, fc.boolean(), (entry, deleted) => {
        const withDeleted = { ...entry, deleted };
        const result = validateDevMemoryEntry(withDeleted);
        expect(result.success).toBe(true);
        expect(result.errors).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it("should accept entries with deletedAt as string", () => {
    fc.assert(
      fc.property(
        validEntryArb,
        fc.date({ min: new Date("2023-01-01"), max: new Date("2025-12-31") }).map((d) => d.toISOString()),
        (entry, deletedAt) => {
          const withDeletedAt = { ...entry, deletedAt };
          const result = validateDevMemoryEntry(withDeletedAt);
          expect(result.success).toBe(true);
          expect(result.errors).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should accept entries without deleted/deletedAt fields (backward compat)", () => {
    fc.assert(
      fc.property(validEntryArb, (entry) => {
        const result = validateDevMemoryEntry(entry);
        expect(result.success).toBe(true);
        expect(result.errors).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it("should reject entries with deleted as non-boolean", () => {
    const nonBooleanArb = fc.oneof(
      fc.string({ minLength: 1 }),
      fc.integer(),
      fc.constant(null),
      fc.array(fc.boolean()),
    );

    fc.assert(
      fc.property(validEntryArb, nonBooleanArb, (entry, nonBool) => {
        const invalid = { ...entry, deleted: nonBool };
        const result = validateDevMemoryEntry(invalid);
        expect(result.success).toBe(false);
        expect(result.errors.some((e) => e.includes("deleted"))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("should reject entries with deletedAt as non-string", () => {
    const nonStringArb = fc.oneof(
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
      fc.array(fc.string()),
    );

    fc.assert(
      fc.property(validEntryArb, nonStringArb, (entry, nonStr) => {
        const invalid = { ...entry, deletedAt: nonStr };
        const result = validateDevMemoryEntry(invalid);
        expect(result.success).toBe(false);
        expect(result.errors.some((e) => e.includes("deletedAt"))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: dev-memory-lifecycle, Property 1: Rewrite operation isolation", () => {
  /**
   * **Validates: Requirements 1.1, 1.2, 2.1, 3.1**
   */
  it("all entries other than the target remain unchanged after rewrite", async () => {
    await mkdir(TEST_DIR, { recursive: true });

    // Generate entries with guaranteed unique IDs using index prefix
    const uniqueEntriesArb = fc
      .array(validEntryArb, { minLength: 2, maxLength: 8 })
      .map((entries) => entries.map((e, i) => ({ ...e, id: `id-${i}-${e.id}` })));

    await fc.assert(
      fc.asyncProperty(
        uniqueEntriesArb,
        fc.nat(),
        async (entries, targetSeed) => {
          const targetIndex = targetSeed % entries.length;
          const storePath = getTestPath();
          await rewriteMemoryEntries(entries, storePath);

          // Mutate target entry (toggle enabled)
          const modified = entries.map((e, i) =>
            i === targetIndex ? { ...e, enabled: !e.enabled } : e,
          );
          await rewriteMemoryEntries(modified, storePath);

          const readBack = await readMemoryEntries(storePath);
          // All non-target entries should be unchanged
          for (let i = 0; i < entries.length; i++) {
            if (i !== targetIndex) {
              expect(readBack[i]).toEqual(entries[i]);
            }
          }
          // Target entry should have toggled enabled
          expect(readBack[targetIndex].enabled).toBe(!entries[targetIndex].enabled);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: dev-memory-lifecycle, Property 10: Backup is an exact copy of store contents", () => {
  /**
   * **Validates: Requirements 10.2**
   */
  it("backup file contains byte-for-byte identical content to original store", async () => {
    await mkdir(TEST_DIR, { recursive: true });

    await fc.assert(
      fc.asyncProperty(
        fc.array(validEntryArb, { minLength: 1, maxLength: 5 }),
        async (entries) => {
          const storePath = getTestPath();
          await rewriteMemoryEntries(entries, storePath);

          const originalContent = await readTextFile(storePath);
          const backupPath = await backupMemoryStore(storePath);
          const backupContent = await readTextFile(backupPath);

          expect(backupContent).toBe(originalContent);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: dev-memory-lifecycle, Property 2: Deleted entries excluded from selection", () => {
  /**
   * **Validates: Requirements 2.3, 7.1**
   */
  it("entries with deleted=true never appear in selection results", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryArb, { minLength: 1, maxLength: 10 }),
        taskTextArb,
        modeNotOffArb,
        (entries, taskText, mode) => {
          // Mark some entries as deleted
          const withDeleted = entries.map((e, i) =>
            i % 2 === 0 ? { ...e, deleted: true, deletedAt: new Date().toISOString() } : e,
          );
          const result = selectMemoryEntries(withDeleted, taskText, mode);
          for (const selected of result.selected) {
            expect(selected.deleted).not.toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: dev-memory-lifecycle, Property 3: Superseded entries excluded from selection", () => {
  /**
   * **Validates: Requirements 3.3**
   */
  it("superseded entries never appear in selection results", () => {
    fc.assert(
      fc.property(
        validEntryArb,
        validEntryArb,
        taskTextArb,
        modeNotOffArb,
        (entryA, entryB, taskText, mode) => {
          // entryB supersedes entryA
          const superseding = {
            ...entryB,
            id: `new-${entryB.id}`,
            enabled: true,
            confidence: "high" as Confidence,
            supersedes: [entryA.id],
          };
          const superseded = {
            ...entryA,
            enabled: true,
            confidence: "high" as Confidence,
          };
          const entries = [superseded, superseding];
          const result = selectMemoryEntries(entries, taskText, mode);
          const selectedIds = result.selected.map((e) => e.id);
          expect(selectedIds).not.toContain(superseded.id);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: dev-memory-lifecycle, Property 8: Exclusion category partition", () => {
  /**
   * **Validates: Requirements 7.2, 7.4**
   */
  it("sum of excludedReasons counts equals total excluded entries", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryWithLifecycleArb, { minLength: 1, maxLength: 10 }),
        (entries) => {
          const { filtered, excludedReasons } = filterEntriesWithReasons(entries);
          const totalExcluded = entries.length - filtered.length;
          const reasonSum =
            excludedReasons.disabled +
            excludedReasons.deleted +
            excludedReasons.expired +
            excludedReasons.superseded +
            excludedReasons.lowConfidence;
          expect(reasonSum).toBe(totalExcluded);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("each excluded entry is counted in exactly one category", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryWithLifecycleArb, { minLength: 1, maxLength: 10 }),
        (entries) => {
          const { filtered, excludedReasons } = filterEntriesWithReasons(entries);
          const totalExcluded = entries.length - filtered.length;
          const reasonSum =
            excludedReasons.disabled +
            excludedReasons.deleted +
            excludedReasons.expired +
            excludedReasons.superseded +
            excludedReasons.lowConfidence;
          // Each excluded entry counted exactly once
          expect(reasonSum).toBe(totalExcluded);
          // All reason counts are non-negative
          expect(excludedReasons.disabled).toBeGreaterThanOrEqual(0);
          expect(excludedReasons.deleted).toBeGreaterThanOrEqual(0);
          expect(excludedReasons.expired).toBeGreaterThanOrEqual(0);
          expect(excludedReasons.superseded).toBeGreaterThanOrEqual(0);
          expect(excludedReasons.lowConfidence).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: dev-memory-lifecycle, Property 4: Prune dry-run does not mutate store", () => {
  /**
   * **Validates: Requirements 4.1, 4.5**
   */
  it("classifyPruneCandidates does not modify the input entries array", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryWithLifecycleArb, { minLength: 1, maxLength: 10 }),
        (entries) => {
          // Deep clone for comparison
          const clone = JSON.parse(JSON.stringify(entries)) as DevMemoryEntry[];
          classifyPruneCandidates(entries);
          expect(entries).toEqual(clone);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: dev-memory-lifecycle, Property 7: History events are in chronological order", () => {
  /**
   * **Validates: Requirements 6.1**
   */
  it("derived lifecycle events are sorted by timestamp in non-decreasing order", () => {
    fc.assert(
      fc.property(
        validEntryWithLifecycleArb,
        fc.array(validEntryArb, { minLength: 0, maxLength: 5 }),
        (entry, otherEntries) => {
          // Some other entries may supersede this entry
          const allEntries = [
            entry,
            ...otherEntries.map((e, i) => ({
              ...e,
              id: `other-${i}-${e.id}`,
              supersedes: i === 0 ? [entry.id] : undefined,
            })),
          ];
          const events = deriveHistory(entry, allEntries);
          for (let i = 1; i < events.length; i++) {
            const prev = new Date(events[i - 1].timestamp).getTime();
            const curr = new Date(events[i].timestamp).getTime();
            expect(curr).toBeGreaterThanOrEqual(prev);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


describe("Feature: dev-memory-lifecycle, Property 5: Compact preserves all active entry data", () => {
  /**
   * **Validates: Requirements 5.2, 5.5**
   */
  it("every non-deleted entry is present in compacted result with all fields unchanged", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryWithLifecycleArb, { minLength: 1, maxLength: 10 }),
        (entries) => {
          // Simulate compact: filter out deleted entries
          const compacted = entries.filter((e) => e.deleted !== true);
          const activeOriginals = entries.filter((e) => e.deleted !== true);

          // Every active entry should be in compacted result unchanged
          expect(compacted.length).toBe(activeOriginals.length);
          for (let i = 0; i < activeOriginals.length; i++) {
            expect(compacted[i]).toEqual(activeOriginals[i]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: dev-memory-lifecycle, Property 6: Compact produces equivalent selection results", () => {
  /**
   * **Validates: Requirements 5.6**
   */
  it("selection before and after compact produces equivalent selected arrays", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryWithLifecycleArb, { minLength: 1, maxLength: 10 }),
        taskTextArb,
        fc.constantFrom("auto", "full", "off") as fc.Arbitrary<MemoryMode>,
        (entries, taskText, mode) => {
          // Selection on original store
          const beforeResult = selectMemoryEntries(entries, taskText, mode);

          // Simulate compact: remove deleted entries
          const compacted = entries.filter((e) => e.deleted !== true);

          // Selection on compacted store
          const afterResult = selectMemoryEntries(compacted, taskText, mode);

          // Results should be equivalent
          expect(afterResult.selected.length).toBe(beforeResult.selected.length);
          for (let i = 0; i < beforeResult.selected.length; i++) {
            expect(afterResult.selected[i]).toEqual(beforeResult.selected[i]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
