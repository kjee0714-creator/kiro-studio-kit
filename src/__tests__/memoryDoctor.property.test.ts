/**
 * memoryDoctor.property.test.ts
 * Property-based tests for memory repair / doctor (Phase 4-O).
 * Uses fast-check with 100 runs per property.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { mkdir, rm } from "fs/promises";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import { detectMemoryIssues, applyMemoryRepairs, repairMemoryStore } from "../core/memoryDoctor.js";
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

const entryArb: fc.Arbitrary<DevMemoryEntry> = fc.record({
  id: fc.uuid(),
  createdAt: fc.constant("2024-01-01T00:00:00.000Z"),
  kind: kindArb,
  summary: fc.string({ minLength: 1, maxLength: 50 }),
  trigger: fc.string({ minLength: 1, maxLength: 50 }),
  fix: fc.string({ minLength: 1, maxLength: 50 }),
  futurePromptHint: fc.string({ minLength: 1, maxLength: 50 }),
  relatedFiles: fc.constant([] as string[]),
  relatedSymbols: fc.constant([] as string[]),
  tags: fc.constant([] as string[]),
  severity: severityArb,
  confidence: confidenceArb,
  enabled: fc.boolean(),
  supersededBy: fc.option(fc.uuid(), { nil: undefined }),
  duplicateOf: fc.option(fc.uuid(), { nil: undefined }),
  disabledReason: fc.option(fc.constantFrom("superseded", "duplicate", "manual", "expired"), { nil: undefined }),
});

const entriesArb = fc.array(entryArb, { minLength: 1, maxLength: 8 });

// ---------------------------------------------------------------------------
// Pure Function Properties
// ---------------------------------------------------------------------------

describe("memoryDoctor property tests", () => {
  /**
   * Property 1: repair never deletes entries
   */
  it("Property 1: repair never deletes entries", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const report = detectMemoryIssues(entries, new Date("2024-02-01T00:00:00.000Z"));
        const { repairedEntries } = applyMemoryRepairs(entries, report);
        expect(repairedEntries.length).toBe(entries.length);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2: repairable issues are normalized (missing refs cleared)
   */
  it("Property 2: repairable issues are normalized after repair", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const now = new Date("2024-02-01T00:00:00.000Z");
        const report = detectMemoryIssues(entries, now);
        if (report.repairableCount === 0) return;

        const { repairedEntries } = applyMemoryRepairs(entries, report);
        const idSet = new Set(repairedEntries.map(e => e.id));

        // After repair, missing_supersede_target should be cleared
        for (const entry of repairedEntries) {
          if (entry.supersededBy && !idSet.has(entry.supersededBy)) {
            // This means repair didn't clear it — only if it was circular (non-repairable)
            const issue = report.issues.find(i => i.id === entry.id && i.type === "missing_supersede_target");
            if (issue?.repairable) {
              expect(entry.supersededBy).toBeUndefined();
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3: circular references are never auto-repaired
   */
  it("Property 3: circular references never auto-repaired", () => {
    // Create entries with circular supersede
    const circularEntriesArb = fc.tuple(fc.uuid(), fc.uuid()).map(([idA, idB]) => [
      { ...makeBaseEntry(), id: idA, supersededBy: idB },
      { ...makeBaseEntry(), id: idB, supersededBy: idA },
    ]);

    fc.assert(
      fc.property(circularEntriesArb, (entries) => {
        const report = detectMemoryIssues(entries as DevMemoryEntry[]);
        const circularIssues = report.issues.filter(i => i.type === "circular_supersede");
        for (const issue of circularIssues) {
          expect(issue.repairable).toBe(false);
        }

        const { repairedEntries } = applyMemoryRepairs(entries as DevMemoryEntry[], report);
        // Circular refs should remain unchanged
        expect(repairedEntries[0].supersededBy).toBe(entries[1].id);
        expect(repairedEntries[1].supersededBy).toBe(entries[0].id);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4: unrelated entries are unchanged
   */
  it("Property 4: unrelated entries unchanged after repair", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const now = new Date("2024-02-01T00:00:00.000Z");
        const report = detectMemoryIssues(entries, now);
        const { repairedEntries, result } = applyMemoryRepairs(entries, report);

        const updatedSet = new Set(result.updatedIds);
        for (let i = 0; i < entries.length; i++) {
          if (!updatedSet.has(entries[i].id)) {
            // Unrelated entry should be deep-equal to original
            expect(repairedEntries[i].id).toBe(entries[i].id);
            expect(repairedEntries[i].enabled).toBe(entries[i].enabled);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

function makeBaseEntry(): DevMemoryEntry {
  return {
    id: "placeholder",
    createdAt: "2024-01-01T00:00:00.000Z",
    kind: "test_fix",
    summary: "s",
    trigger: "t",
    fix: "f",
    futurePromptHint: "h",
    relatedFiles: [],
    relatedSymbols: [],
    tags: [],
    severity: "medium",
    confidence: "high",
    enabled: true,
  };
}

// ---------------------------------------------------------------------------
// Persistence Properties
// ---------------------------------------------------------------------------

const PERSIST_TEST_DIR = ".test-tmp/memoryDoctor-property-" + process.pid + "-" + Date.now();
let persistTestCounter = 0;

function getStorePath(): string {
  persistTestCounter++;
  return `${PERSIST_TEST_DIR}/store-${persistTestCounter}.jsonl`;
}

describe("memoryDoctor persistence property tests", () => {
  beforeEach(async () => {
    await mkdir(PERSIST_TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    try { await rm(PERSIST_TEST_DIR, { recursive: true, force: true, maxRetries: 3 }); } catch { /* ignore */ }
  });

  /**
   * Property 5: dry-run never mutates store
   */
  it("Property 5: dry-run never mutates store", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(entryArb, { minLength: 1, maxLength: 5 }),
        async (entries) => {
          const storePath = getStorePath();
          await rewriteMemoryEntries(entries as DevMemoryEntry[], storePath);

          await repairMemoryStore({ storePath, dryRun: true });

          const afterEntries = await readMemoryEntries(storePath);
          expect(afterEntries.length).toBe(entries.length);
          for (let i = 0; i < entries.length; i++) {
            expect(afterEntries[i].enabled).toBe(entries[i].enabled);
            expect(afterEntries[i].supersededBy).toBe(entries[i].supersededBy);
            expect(afterEntries[i].duplicateOf).toBe(entries[i].duplicateOf);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
