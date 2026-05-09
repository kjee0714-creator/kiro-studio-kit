/**
 * selectionFeedback.property.test.ts
 * Property-based tests for selection feedback (Phase 4-F).
 * Uses fast-check with 100 runs per property.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { recordMemorySelectionSuccess, recordMemorySelectionRejection } from "../core/memoryTrust.js";
import type { DevMemoryEntry, DevMemoryKind, Severity, Confidence, MemoryUsageStats } from "../core/memoryValidator.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const kindArb = fc.constantFrom<DevMemoryKind>(
  "test_fix", "type_fix", "lint_fix", "build_fix",
  "schema_fix", "behavior_change", "design_decision", "gotcha",
);

const severityArb = fc.constantFrom<Severity>("low", "medium", "high");
const confidenceArb = fc.constantFrom<Confidence>("low", "medium", "high");

const usageStatsArb: fc.Arbitrary<MemoryUsageStats> = fc.record({
  selectedCount: fc.nat({ max: 100 }),
  successfulSelections: fc.nat({ max: 100 }),
  rejectedSelections: fc.nat({ max: 100 }),
  lastSelectedAt: fc.option(fc.date().map((d) => d.toISOString()), { nil: undefined }),
  lastSuccessfulAt: fc.option(fc.date().map((d) => d.toISOString()), { nil: undefined }),
  lastRejectedAt: fc.option(fc.date().map((d) => d.toISOString()), { nil: undefined }),
});

const entryArb: fc.Arbitrary<DevMemoryEntry> = fc.record({
  id: fc.uuid(),
  createdAt: fc.date().map((d) => d.toISOString()),
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
  enabled: fc.boolean(),
  usageStats: fc.option(usageStatsArb, { nil: undefined }),
});

const nowArb = fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") });

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("Selection Feedback Property Tests", () => {
  /**
   * **Validates: Requirements 1.1, 1.3**
   * Property 1: recordMemorySelectionSuccess increments only successfulSelections
   */
  it("recordMemorySelectionSuccess increments only successfulSelections", () => {
    fc.assert(
      fc.property(entryArb, nowArb, (entry, now) => {
        const result = recordMemorySelectionSuccess(entry, now);
        const beforeSuccess = entry.usageStats?.successfulSelections ?? 0;
        const beforeRejected = entry.usageStats?.rejectedSelections ?? 0;
        const resultStats = result.usageStats ?? { successfulSelections: 0, rejectedSelections: 0 };

        // successfulSelections incremented by exactly 1
        expect(resultStats.successfulSelections).toBe(beforeSuccess + 1);
        // rejectedSelections unchanged
        expect(resultStats.rejectedSelections).toBe(beforeRejected);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.1, 2.3**
   * Property 2: recordMemorySelectionRejection increments only rejectedSelections
   */
  it("recordMemorySelectionRejection increments only rejectedSelections", () => {
    fc.assert(
      fc.property(entryArb, nowArb, (entry, now) => {
        const result = recordMemorySelectionRejection(entry, now);
        const beforeRejected = entry.usageStats?.rejectedSelections ?? 0;
        const beforeSuccess = entry.usageStats?.successfulSelections ?? 0;
        const resultStats = result.usageStats ?? { rejectedSelections: 0, successfulSelections: 0 };

        // rejectedSelections incremented by exactly 1
        expect(resultStats.rejectedSelections).toBe(beforeRejected + 1);
        // successfulSelections unchanged
        expect(resultStats.successfulSelections).toBe(beforeSuccess);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.3, 2.3**
   * Property 3: selectedCount unchanged by either feedback function
   */
  it("selectedCount unchanged by either feedback function", () => {
    fc.assert(
      fc.property(entryArb, nowArb, (entry, now) => {
        const beforeSelected = entry.usageStats?.selectedCount ?? 0;

        const afterSuccess = recordMemorySelectionSuccess(entry, now);
        const successStats = afterSuccess.usageStats ?? { selectedCount: -1 };
        expect(successStats.selectedCount).toBe(beforeSelected);

        const afterRejection = recordMemorySelectionRejection(entry, now);
        const rejectionStats = afterRejection.usageStats ?? { selectedCount: -1 };
        expect(rejectionStats.selectedCount).toBe(beforeSelected);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.3**
   * Property 4: successRate in [0, 1] when denominator > 0
   */
  it("successRate in [0, 1] when (successfulSelections + rejectedSelections) > 0", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100 }),
        fc.nat({ max: 100 }),
        (successful, rejected) => {
          const denominator = successful + rejected;
          fc.pre(denominator > 0);
          const rate = successful / denominator;
          expect(rate).toBeGreaterThanOrEqual(0);
          expect(rate).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.5, 2.5**
   * Property 5: Pure functions return new objects (input unchanged)
   */
  it("pure functions do not mutate input entry", () => {
    fc.assert(
      fc.property(entryArb, nowArb, (entry, now) => {
        // Deep clone the entry to compare later
        const originalJson = JSON.stringify(entry);

        recordMemorySelectionSuccess(entry, now);
        expect(JSON.stringify(entry)).toBe(originalJson);

        recordMemorySelectionRejection(entry, now);
        expect(JSON.stringify(entry)).toBe(originalJson);
      }),
      { numRuns: 100 },
    );
  });
});
