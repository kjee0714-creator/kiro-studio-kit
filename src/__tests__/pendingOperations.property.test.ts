/**
 * pendingOperations.property.test.ts
 * Property-based tests for pending memory operations.
 * Uses fast-check with 100 runs per property.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import {
  isPendingEntry,
  promoteAllPendingEntries,
  discardPendingEntry,
  classifyPrunePendingCandidates,
} from "../core/pendingOperations.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const kindArb = fc.constantFrom(
  "test_fix", "type_fix", "lint_fix", "build_fix",
  "schema_fix", "behavior_change", "design_decision", "gotcha",
) as fc.Arbitrary<DevMemoryEntry["kind"]>;

const severityArb = fc.constantFrom("low", "medium", "high") as fc.Arbitrary<DevMemoryEntry["severity"]>;
const confidenceArb = fc.constantFrom("low", "medium", "high") as fc.Arbitrary<DevMemoryEntry["confidence"]>;

/** Generate a valid pending entry (not deleted, not discarded) */
const pendingEntryArb: fc.Arbitrary<DevMemoryEntry> = fc.record({
  id: fc.uuid(),
  createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2025-01-01") }).map(d => d.toISOString()),
  kind: kindArb,
  summary: fc.string({ minLength: 1, maxLength: 50 }),
  trigger: fc.string({ minLength: 1, maxLength: 50 }),
  fix: fc.string({ minLength: 1, maxLength: 50 }),
  futurePromptHint: fc.string({ minLength: 1, maxLength: 50 }),
  relatedFiles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }),
  relatedSymbols: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 3 }),
  severity: severityArb,
  confidence: confidenceArb,
  enabled: fc.constant(false),
  captureStatus: fc.constantFrom("active", "quarantined") as fc.Arbitrary<DevMemoryEntry["captureStatus"]>,
  trustLevel: fc.constantFrom("probation", "trusted", "verified") as fc.Arbitrary<DevMemoryEntry["trustLevel"]>,
  authority: fc.constantFrom("hint", "rule", "constraint") as fc.Arbitrary<DevMemoryEntry["authority"]>,
});

/** Generate a deleted pending entry */
const deletedPendingEntryArb: fc.Arbitrary<DevMemoryEntry> = pendingEntryArb.map(e => ({
  ...e,
  deleted: true,
  deletedAt: new Date().toISOString(),
}));

/** Generate a discarded pending entry */
const discardedPendingEntryArb: fc.Arbitrary<DevMemoryEntry> = pendingEntryArb.map(e => ({
  ...e,
  captureStatus: "discarded" as const,
}));

/** Mixed array with pending, deleted, and discarded entries */
const mixedPendingArrayArb: fc.Arbitrary<DevMemoryEntry[]> = fc.array(
  fc.oneof(
    { weight: 3, arbitrary: pendingEntryArb },
    { weight: 1, arbitrary: deletedPendingEntryArb },
    { weight: 1, arbitrary: discardedPendingEntryArb },
  ),
  { minLength: 1, maxLength: 15 },
);

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("pendingOperations property tests", () => {
  /**
   * Property 1: promoteAllPendingEntries only modifies entries where
   * deleted !== true AND captureStatus !== "discarded".
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  it("Property 1: promoteAll only modifies non-deleted non-discarded entries", () => {
    fc.assert(
      fc.property(mixedPendingArrayArb, (entries) => {
        const now = new Date("2024-06-01T00:00:00.000Z");
        const { promoted, remaining } = promoteAllPendingEntries(entries, now);

        // All promoted entries must have been isPendingEntry(true) in input
        for (const p of promoted) {
          const original = entries.find(e => e.id === p.id);
          expect(original).toBeDefined();
          if (original) {
            expect(isPendingEntry(original)).toBe(true);
          }
        }

        // All remaining entries must have been isPendingEntry(false) in input
        for (const r of remaining) {
          const original = entries.find(e => e.id === r.id);
          expect(original).toBeDefined();
          if (original) {
            expect(isPendingEntry(original)).toBe(false);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2: discardPendingEntry only modifies the target entry
   * where deleted !== true AND captureStatus !== "discarded".
   *
   * **Validates: Requirements 4.1, 4.4**
   */
  it("Property 2: discard only modifies target non-deleted non-discarded entry", () => {
    fc.assert(
      fc.property(
        fc.array(pendingEntryArb, { minLength: 2, maxLength: 10 }).filter(arr => {
          // Ensure unique IDs
          const ids = arr.map(e => e.id);
          return new Set(ids).size === ids.length;
        }),
        (entries) => {
          // Pick a random valid target
          const target = entries[0];
          const { updated, discardedEntry } = discardPendingEntry(entries, target.id);

          // Only the target is modified
          expect(discardedEntry.id).toBe(target.id);
          expect(discardedEntry.captureStatus).toBe("discarded");

          // All other entries remain unchanged
          for (let i = 1; i < entries.length; i++) {
            expect(updated[i]).toEqual(entries[i]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3: promote and discard never modify entries where deleted === true.
   *
   * **Validates: Requirements 7.3**
   */
  it("Property 3: promote/discard never modify deleted entries", () => {
    fc.assert(
      fc.property(mixedPendingArrayArb, (entries) => {
        const now = new Date("2024-06-01T00:00:00.000Z");
        const { remaining } = promoteAllPendingEntries(entries, now);

        // Deleted entries in remaining must be unchanged
        const deletedOriginals = entries.filter(e => e.deleted === true);
        const deletedInRemaining = remaining.filter(e => e.deleted === true);

        for (const del of deletedInRemaining) {
          const original = deletedOriginals.find(e => e.id === del.id);
          expect(del).toEqual(original);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4: classifyPrunePendingCandidates does not mutate the input entries array.
   *
   * **Validates: Requirements 7.4**
   */
  it("Property 4: classifyPrunePendingCandidates does not mutate input", () => {
    fc.assert(
      fc.property(mixedPendingArrayArb, (entries) => {
        const now = new Date("2024-06-01T00:00:00.000Z");
        const entriesCopy = entries.map(e => ({ ...e }));

        classifyPrunePendingCandidates(entries, 30, now);

        // Verify entries array is not mutated
        expect(entries.length).toBe(entriesCopy.length);
        for (let i = 0; i < entries.length; i++) {
          expect(entries[i]).toEqual(entriesCopy[i]);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 5: promoteAllPendingEntries returns promoted.length equal to
   * the count of isPendingEntry(true) entries in the input.
   *
   * **Validates: Requirements 7.5**
   */
  it("Property 5: promoteAll.promoted.length equals count of isPendingEntry(true) entries", () => {
    fc.assert(
      fc.property(mixedPendingArrayArb, (entries) => {
        const now = new Date("2024-06-01T00:00:00.000Z");
        const { promoted } = promoteAllPendingEntries(entries, now);

        const expectedCount = entries.filter(isPendingEntry).length;
        expect(promoted.length).toBe(expectedCount);
      }),
      { numRuns: 100 },
    );
  });
});
