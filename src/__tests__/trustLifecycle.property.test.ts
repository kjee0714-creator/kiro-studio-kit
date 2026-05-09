/**
 * trustLifecycle.property.test.ts
 * Property-based tests for trust lifecycle operations (Phase 4-H).
 * Uses fast-check with 100 runs per property.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import {
  assessTrustLifecycleAction,
  applyTrustLifecycleDecision,
} from "../core/memoryTrust.js";
import type { TrustLifecycleDecision } from "../core/memoryTrust.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const kindArb = fc.constantFrom(
  "test_fix", "type_fix", "lint_fix", "build_fix",
  "schema_fix", "behavior_change", "design_decision", "gotcha",
) as fc.Arbitrary<DevMemoryEntry["kind"]>;

const severityArb = fc.constantFrom("low", "medium", "high") as fc.Arbitrary<DevMemoryEntry["severity"]>;
const confidenceArb = fc.constantFrom("low", "medium", "high") as fc.Arbitrary<DevMemoryEntry["confidence"]>;
const trustLevelArb = fc.constantFrom("probation", "trusted", "verified") as fc.Arbitrary<DevMemoryEntry["trustLevel"]>;

const usageStatsArb = fc.record({
  selectedCount: fc.nat({ max: 50 }),
  successfulSelections: fc.nat({ max: 30 }),
  rejectedSelections: fc.nat({ max: 30 }),
});

/** Generate a valid DevMemoryEntry with various states */
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
});

/** Generate a deleted entry */
const deletedEntryArb: fc.Arbitrary<DevMemoryEntry> = entryArb.map(e => ({
  ...e,
  deleted: true,
}));

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("trustLifecycle property tests", () => {
  /**
   * Property 1: assessTrustLifecycleAction never returns "manual_verify"
   *
   * **Validates: Requirement 6.1**
   */
  it("Property 1: assessTrustLifecycleAction never returns manual_verify", () => {
    fc.assert(
      fc.property(entryArb, (entry) => {
        const decision = assessTrustLifecycleAction(entry);
        expect(decision.action).not.toBe("manual_verify");
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2: assessTrustLifecycleAction never returns an action that
   * would upgrade to "verified" (afterTrustLevel is never "verified"
   * unless the entry was already verified and action is "none")
   *
   * **Validates: Requirement 6.2**
   */
  it("Property 2: assessTrustLifecycleAction never upgrades to verified", () => {
    fc.assert(
      fc.property(entryArb, (entry) => {
        const decision = assessTrustLifecycleAction(entry);
        // If action is not "none", afterTrustLevel must not be "verified"
        if (decision.action !== "none") {
          expect(decision.afterTrustLevel).not.toBe("verified");
        }
        // The action itself must never be one that sets verified
        expect(decision.action).not.toBe("manual_verify");
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3: assessTrustLifecycleAction returns "none" for all entries
   * with deleted === true
   *
   * **Validates: Requirement 6.3**
   */
  it("Property 3: deleted entries always get action none", () => {
    fc.assert(
      fc.property(deletedEntryArb, (entry) => {
        const decision = assessTrustLifecycleAction(entry);
        expect(decision.action).toBe("none");
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4: applyTrustLifecycleDecision does not mutate the input entry
   *
   * **Validates: Requirement 6.4 (dry-run safety / pure function)**
   */
  it("Property 4: applyTrustLifecycleDecision does not mutate input", () => {
    const actionArb = fc.constantFrom("none", "upgrade_to_trusted", "degrade_to_probation", "manual_verify") as fc.Arbitrary<TrustLifecycleDecision["action"]>;

    fc.assert(
      fc.property(entryArb, actionArb, (entry, action) => {
        const entryCopy = JSON.parse(JSON.stringify(entry)) as DevMemoryEntry;
        const decision: TrustLifecycleDecision = {
          action,
          reason: "test",
          beforeTrustLevel: entry.trustLevel ?? "probation",
          afterTrustLevel: action === "upgrade_to_trusted" ? "trusted" : action === "manual_verify" ? "verified" : "probation",
        };

        applyTrustLifecycleDecision(entry, decision);

        // Original entry must be unchanged
        expect(entry).toEqual(entryCopy);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 5: only "manual_verify" action can produce an entry with
   * trustLevel === "verified" that wasn't already verified.
   *
   * **Validates: Requirement 6.5**
   */
  it("Property 5: only manual_verify can set verified on non-verified entry", () => {
    const nonVerifyActionArb = fc.constantFrom("none", "upgrade_to_trusted", "degrade_to_probation") as fc.Arbitrary<TrustLifecycleDecision["action"]>;

    // Use entries that are NOT already verified
    const nonVerifiedEntryArb = entryArb.map(e => ({
      ...e,
      trustLevel: (e.trustLevel === "verified" ? "trusted" : e.trustLevel) as DevMemoryEntry["trustLevel"],
    }));

    fc.assert(
      fc.property(nonVerifiedEntryArb, nonVerifyActionArb, (entry, action) => {
        const decision: TrustLifecycleDecision = {
          action,
          reason: "test",
          beforeTrustLevel: entry.trustLevel ?? "probation",
          afterTrustLevel: action === "upgrade_to_trusted" ? "trusted" : entry.trustLevel ?? "probation",
        };

        const result = applyTrustLifecycleDecision(entry, decision);
        // Non-manual_verify actions on non-verified entries must never produce verified
        expect(result.trustLevel).not.toBe("verified");
      }),
      { numRuns: 100 },
    );
  });
});
