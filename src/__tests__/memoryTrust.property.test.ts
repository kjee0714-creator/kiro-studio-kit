/**
 * memoryTrust.property.test.ts
 * Property-based tests for the trust assessment module (Phase 4-C).
 *
 * **Validates: Requirements 2.5, 3.1, 3.2, 3.4, 1.4, 11.1-11.5**
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { assessMemoryTrust, recordMemorySelection } from "../core/memoryTrust.js";
import type { DevMemoryEntry, DevMemoryKind, Severity, Confidence, MemorySource, CaptureStatus, TrustLevel, MemoryAuthority } from "../core/memoryValidator.js";

// ---------------------------------------------------------------------------
// Arbitrary Generators
// ---------------------------------------------------------------------------

const arbKind: fc.Arbitrary<DevMemoryKind> = fc.constantFrom(
  "test_fix", "type_fix", "lint_fix", "build_fix", "schema_fix",
  "behavior_change", "design_decision", "gotcha",
);

const arbSeverity: fc.Arbitrary<Severity> = fc.constantFrom("low", "medium", "high");
const arbConfidence: fc.Arbitrary<Confidence> = fc.constantFrom("low", "medium", "high");
const arbSource: fc.Arbitrary<MemorySource> = fc.constantFrom("manual", "kiro_log", "imported");
const arbCaptureStatus: fc.Arbitrary<CaptureStatus> = fc.constantFrom("active", "quarantined", "discarded");
const arbTrustLevel: fc.Arbitrary<TrustLevel> = fc.constantFrom("probation", "trusted", "verified");
const arbAuthority: fc.Arbitrary<MemoryAuthority> = fc.constantFrom("hint", "rule", "constraint");

const arbUsageStats = fc.record({
  selectedCount: fc.nat(100),
  successfulSelections: fc.nat(50),
  rejectedSelections: fc.nat(50),
  lastSelectedAt: fc.option(fc.date().map((d) => d.toISOString()), { nil: undefined }),
  lastSuccessfulAt: fc.option(fc.date().map((d) => d.toISOString()), { nil: undefined }),
});

const arbDevMemoryEntry: fc.Arbitrary<DevMemoryEntry> = fc.record({
  id: fc.uuid(),
  createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2025-12-31") }).map((d) => d.toISOString()),
  kind: arbKind,
  summary: fc.string({ minLength: 1, maxLength: 100 }),
  trigger: fc.string({ minLength: 1, maxLength: 100 }),
  fix: fc.string({ minLength: 1, maxLength: 100 }),
  futurePromptHint: fc.string({ minLength: 1, maxLength: 100 }),
  relatedFiles: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
  relatedSymbols: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 5 }),
  severity: arbSeverity,
  confidence: arbConfidence,
  enabled: fc.boolean(),
  // Optional trust-related fields
  deleted: fc.option(fc.boolean(), { nil: undefined }),
  conflictKey: fc.option(fc.string({ minLength: 0, maxLength: 30 }), { nil: undefined }),
  duplicateOf: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: undefined }),
  source: fc.option(arbSource, { nil: undefined }),
  captureStatus: fc.option(arbCaptureStatus, { nil: undefined }),
  trustLevel: fc.option(arbTrustLevel, { nil: undefined }),
  authority: fc.option(arbAuthority, { nil: undefined }),
  verifiedAt: fc.option(fc.date().map((d) => d.toISOString()), { nil: undefined }),
  promotedAt: fc.option(fc.date().map((d) => d.toISOString()), { nil: undefined }),
  degradedAt: fc.option(fc.date().map((d) => d.toISOString()), { nil: undefined }),
  usageStats: fc.option(arbUsageStats, { nil: undefined }),
  occurrences: fc.option(fc.nat(20), { nil: undefined }),
  trustScore: fc.option(fc.nat(100), { nil: undefined }),
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("memoryTrust property tests", () => {
  it("Property 1: trustScore always in range 0-100 for all arbitrary entries", () => {
    /**
     * **Validates: Requirements 2.5**
     * FOR ALL DevMemoryEntry inputs, assessMemoryTrust returns trustScore in [0, 100].
     */
    fc.assert(
      fc.property(arbDevMemoryEntry, (entry) => {
        const result = assessMemoryTrust(entry);
        expect(result.trustScore).toBeGreaterThanOrEqual(0);
        expect(result.trustScore).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 2: verified recommendation requires trustScore >= 75", () => {
    /**
     * **Validates: Requirements 3.3**
     * If recommendedTrustLevel is "verified", trustScore >= 75.
     */
    fc.assert(
      fc.property(arbDevMemoryEntry, (entry) => {
        const result = assessMemoryTrust(entry);
        if (result.recommendedTrustLevel === "verified") {
          expect(result.trustScore).toBeGreaterThanOrEqual(75);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Property 3: quarantined entries never receive verified recommendation", () => {
    /**
     * **Validates: Requirements 3.4**
     * If captureStatus === "quarantined", recommendedTrustLevel !== "verified".
     */
    const arbQuarantinedEntry = arbDevMemoryEntry.map((entry) => ({
      ...entry,
      captureStatus: "quarantined" as CaptureStatus,
    }));

    fc.assert(
      fc.property(arbQuarantinedEntry, (entry) => {
        const result = assessMemoryTrust(entry);
        expect(result.recommendedTrustLevel).not.toBe("verified");
      }),
      { numRuns: 100 },
    );
  });

  it("Property 4: recordMemorySelection monotonically increases selectedCount", () => {
    /**
     * **Validates: Requirements 1.4**
     * result.usageStats.selectedCount >= (input.usageStats?.selectedCount ?? 0)
     */
    fc.assert(
      fc.property(arbDevMemoryEntry, (entry) => {
        const result = recordMemorySelection(entry);
        const inputCount = entry.usageStats?.selectedCount ?? 0;
        const outputCount = result.usageStats?.selectedCount ?? 0;
        expect(outputCount).toBeGreaterThanOrEqual(inputCount);
        // More specifically, it should be exactly inputCount + 1
        expect(outputCount).toBe(inputCount + 1);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 5: deleted entries never receive trust level higher than probation", () => {
    /**
     * **Validates: Requirements 11.5**
     * If deleted === true, recommendedTrustLevel === "probation".
     */
    const arbDeletedEntry = arbDevMemoryEntry.map((entry) => ({
      ...entry,
      deleted: true,
    }));

    fc.assert(
      fc.property(arbDeletedEntry, (entry) => {
        const result = assessMemoryTrust(entry);
        expect(result.recommendedTrustLevel).toBe("probation");
      }),
      { numRuns: 100 },
    );
  });
});
