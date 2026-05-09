/**
 * memoryConflict.property.test.ts
 * Property-based tests for memory conflict management (Phase 4-K).
 * Uses fast-check with 100 runs per property.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { mkdir, rm } from "fs/promises";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import { applyMemoryInjectionPolicy, getTrustPriority } from "../core/memoryInjectionPolicy.js";
import { groupByConflictGroup, supersedeMemory, setMemoryConflictGroup } from "../core/memoryConflict.js";
import { readMemoryEntries, rewriteMemoryEntries } from "../core/memoryStore.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const kindArb = fc.constantFrom(
  "test_fix", "type_fix", "lint_fix", "build_fix",
  "schema_fix", "behavior_change", "design_decision", "gotcha",
) as fc.Arbitrary<DevMemoryEntry["kind"]>;

const severityArb = fc.constantFrom("low", "medium", "high") as fc.Arbitrary<DevMemoryEntry["severity"]>;
const confidenceArb = fc.constantFrom("medium", "high") as fc.Arbitrary<DevMemoryEntry["confidence"]>;
const trustLevelArb = fc.constantFrom("probation", "trusted", "verified") as fc.Arbitrary<DevMemoryEntry["trustLevel"]>;

const conflictEntryArb: fc.Arbitrary<DevMemoryEntry> = fc.record({
  id: fc.uuid(),
  createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2025-01-01") }).map(d => d.toISOString()),
  kind: kindArb,
  summary: fc.string({ minLength: 1, maxLength: 50 }),
  trigger: fc.string({ minLength: 1, maxLength: 50 }),
  fix: fc.string({ minLength: 1, maxLength: 50 }),
  futurePromptHint: fc.string({ minLength: 1, maxLength: 50 }),
  relatedFiles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 2 }),
  relatedSymbols: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 2 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 2 }),
  severity: severityArb,
  confidence: confidenceArb,
  enabled: fc.constant(true),
  trustLevel: trustLevelArb,
  conflictKey: fc.option(fc.constantFrom("group-a", "group-b", "group-c"), { nil: undefined }),
  supersededBy: fc.option(fc.uuid(), { nil: undefined }),
});

const entriesArb = fc.array(conflictEntryArb, { minLength: 0, maxLength: 12 });

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("memoryConflict property tests", () => {
  /**
   * Property 1: Entries with supersededBy set are never in policy output
   */
  it("Property 1: superseded entries are never in policy output", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const result = applyMemoryInjectionPolicy(entries, {
          maxTotalEntries: 20,
          maxProbationEntries: 20,
          suppressHighRejection: false,
        });
        for (const entry of result.selectedEntries) {
          expect(entry.supersededBy === undefined || entry.supersededBy === "").toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2: At most 1 entry per conflictKey in policy output
   */
  it("Property 2: at most 1 entry per conflictKey in policy output", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const result = applyMemoryInjectionPolicy(entries, {
          maxTotalEntries: 20,
          maxProbationEntries: 20,
          suppressHighRejection: false,
        });
        const groups = groupByConflictGroup(result.selectedEntries);
        for (const [, group] of groups) {
          expect(group.length).toBeLessThanOrEqual(1);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3: Conflict winner has highest trust priority in its group
   */
  it("Property 3: conflict winner has highest trust priority", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const result = applyMemoryInjectionPolicy(entries, {
          maxTotalEntries: 20,
          maxProbationEntries: 20,
          suppressHighRejection: false,
        });

        // For each selected entry with a conflictKey, verify it has the highest
        // trust priority among all eligible entries in the same group
        for (const selected of result.selectedEntries) {
          if (!selected.conflictKey) continue;
          // Find all eligible entries in the same group (not deleted/disabled/discarded/superseded)
          const sameGroup = entries.filter(e =>
            e.conflictKey === selected.conflictKey &&
            e.enabled !== false &&
            e.deleted !== true &&
            e.captureStatus !== "discarded" &&
            (!e.supersededBy || e.supersededBy === ""),
          );
          const selectedPriority = getTrustPriority(selected);
          for (const other of sameGroup) {
            expect(getTrustPriority(other)).toBeLessThanOrEqual(selectedPriority);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4: applyMemoryInjectionPolicy does not physically delete entries
   * (input array length is preserved)
   */
  it("Property 4: policy does not mutate input entries", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const copy = JSON.parse(JSON.stringify(entries)) as DevMemoryEntry[];
        applyMemoryInjectionPolicy(entries, {
          maxTotalEntries: 20,
          maxProbationEntries: 20,
        });
        expect(entries).toEqual(copy);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 5: stats supersededExcludedCount + conflictExcludedCount are non-negative
   * and consistent with decisions
   */
  it("Property 5: conflict stats are consistent with decisions", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const result = applyMemoryInjectionPolicy(entries, {
          maxTotalEntries: 20,
          maxProbationEntries: 20,
          suppressHighRejection: false,
        });
        expect(result.stats.supersededExcludedCount).toBeGreaterThanOrEqual(0);
        expect(result.stats.conflictExcludedCount).toBeGreaterThanOrEqual(0);

        // Verify counts match decisions
        const supersededDecisions = result.decisions.filter(d => d.reason.startsWith("Superseded by"));
        const conflictDecisions = result.decisions.filter(d => d.reason.startsWith("Conflict group"));
        expect(supersededDecisions.length).toBe(result.stats.supersededExcludedCount);
        expect(conflictDecisions.length).toBe(result.stats.conflictExcludedCount);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Persistence Property-Based Tests
// ---------------------------------------------------------------------------

const PERSIST_TEST_DIR = ".test-tmp/memoryConflict-property-" + process.pid + "-" + Date.now();
let persistTestCounter = 0;

function getPersistStorePath(): string {
  persistTestCounter++;
  return `${PERSIST_TEST_DIR}/store-${persistTestCounter}.jsonl`;
}

/** Generate a valid entry for persistence tests */
const persistEntryArb: fc.Arbitrary<DevMemoryEntry> = fc.record({
  id: fc.uuid(),
  createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2025-01-01") }).map(d => d.toISOString()),
  kind: kindArb,
  summary: fc.string({ minLength: 1, maxLength: 50 }),
  trigger: fc.string({ minLength: 1, maxLength: 50 }),
  fix: fc.string({ minLength: 1, maxLength: 50 }),
  futurePromptHint: fc.string({ minLength: 1, maxLength: 50 }),
  relatedFiles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 2 }),
  relatedSymbols: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 2 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 2 }),
  severity: severityArb,
  confidence: confidenceArb,
  enabled: fc.constant(true),
  trustLevel: trustLevelArb,
});

describe("memoryConflict persistence property tests", () => {
  beforeEach(async () => {
    await mkdir(PERSIST_TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    try { await rm(PERSIST_TEST_DIR, { recursive: true, force: true, maxRetries: 3 }); } catch { /* ignore */ }
  });

  /**
   * Property 6: supersedeMemory preserves total entry count and sets correct fields
   */
  it("Property 6: supersedeMemory preserves entry count and sets correct fields", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(persistEntryArb, { minLength: 2, maxLength: 8 }),
        async (entries) => {
          const storePath = getPersistStorePath();
          await rewriteMemoryEntries(entries, storePath);

          const beforeCount = entries.length;
          const oldId = entries[0].id;
          const newerId = entries[1].id;

          await supersedeMemory(oldId, newerId, storePath);

          const afterEntries = await readMemoryEntries(storePath);

          // Entry count preserved (no physical deletion)
          expect(afterEntries.length).toBe(beforeCount);

          // Old entry fields
          const oldEntry = afterEntries.find(e => e.id === oldId);
          expect(oldEntry).toBeDefined();
          expect(oldEntry?.enabled).toBe(false);
          expect(oldEntry?.disabledReason).toBe("superseded");
          expect(oldEntry?.supersededBy).toBe(newerId);

          // Newer entry fields
          const newEntry = afterEntries.find(e => e.id === newerId);
          expect(newEntry).toBeDefined();
          expect(newEntry?.supersedes).toContain(oldId);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 7: setMemoryConflictGroup updates exactly the requested IDs and no others
   */
  it("Property 7: setMemoryConflictGroup updates exactly requested IDs", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(persistEntryArb, { minLength: 3, maxLength: 8 }),
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        async (entries, conflictKey) => {
          const storePath = getPersistStorePath();
          await rewriteMemoryEntries(entries, storePath);

          // Pick first 2 entries as target IDs
          const targetIds = [entries[0].id, entries[1].id];
          const nonTargetIds = entries.slice(2).map(e => e.id);

          await setMemoryConflictGroup(conflictKey, targetIds, storePath);

          const afterEntries = await readMemoryEntries(storePath);

          // Entry count preserved
          expect(afterEntries.length).toBe(entries.length);

          // Target entries have conflictKey set
          for (const id of targetIds) {
            const entry = afterEntries.find(e => e.id === id);
            expect(entry).toBeDefined();
            expect(entry?.conflictKey).toBe(conflictKey);
          }

          // Non-target entries are unchanged
          for (const id of nonTargetIds) {
            const afterEntry = afterEntries.find(e => e.id === id);
            const beforeEntry = entries.find(e => e.id === id);
            expect(afterEntry?.conflictKey).toBe(beforeEntry?.conflictKey);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
