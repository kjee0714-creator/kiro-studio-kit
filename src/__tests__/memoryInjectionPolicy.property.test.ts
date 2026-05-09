/**
 * memoryInjectionPolicy.property.test.ts
 * Property-based tests for memory injection policy (Phase 4-I).
 * Uses fast-check with 100 runs per property.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import {
  applyMemoryInjectionPolicy,
  isHighRejectionMemory,
  DEFAULT_MEMORY_INJECTION_POLICY,
} from "../core/memoryInjectionPolicy.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const kindArb = fc.constantFrom(
  "test_fix", "type_fix", "lint_fix", "build_fix",
  "schema_fix", "behavior_change", "design_decision", "gotcha",
) as fc.Arbitrary<DevMemoryEntry["kind"]>;

const severityArb = fc.constantFrom("low", "medium", "high") as fc.Arbitrary<DevMemoryEntry["severity"]>;
const confidenceArb = fc.constantFrom("low", "medium", "high") as fc.Arbitrary<DevMemoryEntry["confidence"]>;
const trustLevelArb = fc.constantFrom("probation", "trusted", "verified", undefined) as fc.Arbitrary<DevMemoryEntry["trustLevel"]>;

const usageStatsArb = fc.record({
  selectedCount: fc.nat({ max: 50 }),
  successfulSelections: fc.nat({ max: 30 }),
  rejectedSelections: fc.nat({ max: 30 }),
});

const entryArb: fc.Arbitrary<DevMemoryEntry> = fc.record({
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
  enabled: fc.boolean(),
  deleted: fc.oneof(fc.constant(undefined), fc.constant(true)),
  trustLevel: trustLevelArb,
  captureStatus: fc.constantFrom("active", "quarantined", "discarded", undefined) as fc.Arbitrary<DevMemoryEntry["captureStatus"]>,
  usageStats: fc.option(usageStatsArb, { nil: undefined }),
  autoCaptured: fc.oneof(fc.constant(undefined), fc.constant(true), fc.constant(false)),
});

const entriesArb = fc.array(entryArb, { minLength: 0, maxLength: 15 });

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("memoryInjectionPolicy property tests", () => {
  /**
   * Property 1: result length <= maxTotalEntries
   */
  it("Property 1: result length <= maxTotalEntries", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const result = applyMemoryInjectionPolicy(entries);
        expect(result.selectedEntries.length).toBeLessThanOrEqual(
          DEFAULT_MEMORY_INJECTION_POLICY.maxTotalEntries,
        );
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2: probation included count <= maxProbationEntries
   */
  it("Property 2: probation included count <= maxProbationEntries", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const result = applyMemoryInjectionPolicy(entries);
        expect(result.stats.probationIncludedCount).toBeLessThanOrEqual(
          DEFAULT_MEMORY_INJECTION_POLICY.maxProbationEntries,
        );
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3: deleted/disabled/discarded entries never in selectedEntries
   */
  it("Property 3: deleted/disabled/discarded entries never in selectedEntries", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const result = applyMemoryInjectionPolicy(entries);
        for (const entry of result.selectedEntries) {
          expect(entry.deleted).not.toBe(true);
          expect(entry.enabled).not.toBe(false);
          expect(entry.captureStatus).not.toBe("discarded");
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4: high rejection entries excluded when suppressHighRejection=true
   */
  it("Property 4: high rejection entries excluded when suppressHighRejection=true", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const result = applyMemoryInjectionPolicy(entries, { suppressHighRejection: true });
        for (const entry of result.selectedEntries) {
          expect(isHighRejectionMemory(entry)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 5: applyMemoryInjectionPolicy does not mutate input entries
   */
  it("Property 5: applyMemoryInjectionPolicy does not mutate input entries", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const copy = JSON.parse(JSON.stringify(entries)) as DevMemoryEntry[];
        applyMemoryInjectionPolicy(entries);
        expect(entries).toEqual(copy);
      }),
      { numRuns: 100 },
    );
  });
});
