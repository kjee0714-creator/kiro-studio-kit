/**
 * Property-based tests for memoryHealth module.
 * Uses fast-check to verify invariants across random inputs.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { calculateMemoryHealth, findDuplicateClusters } from "../core/memoryHealth.js";
import type { DevMemoryEntry, DevMemoryKind, Severity, Confidence } from "../core/memoryValidator.js";

/** Arbitrary for valid DevMemoryKind */
const arbKind = fc.constantFrom<DevMemoryKind>(
  "test_fix", "type_fix", "lint_fix", "build_fix",
  "schema_fix", "behavior_change", "design_decision", "gotcha",
);

/** Arbitrary for valid Severity */
const arbSeverity = fc.constantFrom<Severity>("low", "medium", "high");

/** Arbitrary for valid Confidence */
const arbConfidence = fc.constantFrom<Confidence>("low", "medium", "high");

/** Arbitrary for a valid DevMemoryEntry */
const arbEntry: fc.Arbitrary<DevMemoryEntry> = fc.record({
  id: fc.uuid(),
  createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2025-01-01") }).map(d => d.toISOString()),
  kind: arbKind,
  summary: fc.string({ minLength: 1, maxLength: 100 }),
  trigger: fc.string({ minLength: 1, maxLength: 100 }),
  fix: fc.string({ minLength: 1, maxLength: 100 }),
  futurePromptHint: fc.string({ minLength: 1, maxLength: 100 }),
  relatedFiles: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
  relatedSymbols: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
  severity: arbSeverity,
  confidence: arbConfidence,
  enabled: fc.boolean(),
  deleted: fc.option(fc.boolean(), { nil: undefined }),
  autoCaptured: fc.option(fc.boolean(), { nil: undefined }),
  conflictKey: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  expiresAt: fc.option(
    fc.date({ min: new Date("2020-01-01"), max: new Date("2026-01-01") }).map(d => d.toISOString()),
    { nil: undefined },
  ),
  supersedes: fc.option(fc.array(fc.uuid(), { minLength: 0, maxLength: 3 }), { nil: undefined }),
});

/** Arbitrary for an array of entries */
const arbEntries = fc.array(arbEntry, { minLength: 0, maxLength: 30 });

describe("memoryHealth property tests", () => {
  /**
   * **Validates: Requirements 1.2**
   * Property 1: All scores are integers in [0, 100]
   */
  it("all scores are integers in range [0, 100] for any valid input", () => {
    fc.assert(
      fc.property(arbEntries, (entries) => {
        const report = calculateMemoryHealth(entries, { now: new Date("2024-07-01T00:00:00.000Z") });

        expect(Number.isInteger(report.overallScore)).toBe(true);
        expect(Number.isInteger(report.bloatScore)).toBe(true);
        expect(Number.isInteger(report.conflictScore)).toBe(true);
        expect(Number.isInteger(report.duplicationScore)).toBe(true);
        expect(Number.isInteger(report.stalenessScore)).toBe(true);
        expect(Number.isInteger(report.injectionRiskScore)).toBe(true);

        expect(report.overallScore).toBeGreaterThanOrEqual(0);
        expect(report.overallScore).toBeLessThanOrEqual(100);
        expect(report.bloatScore).toBeGreaterThanOrEqual(0);
        expect(report.bloatScore).toBeLessThanOrEqual(100);
        expect(report.conflictScore).toBeGreaterThanOrEqual(0);
        expect(report.conflictScore).toBeLessThanOrEqual(100);
        expect(report.duplicationScore).toBeGreaterThanOrEqual(0);
        expect(report.duplicationScore).toBeLessThanOrEqual(100);
        expect(report.stalenessScore).toBeGreaterThanOrEqual(0);
        expect(report.stalenessScore).toBeLessThanOrEqual(100);
        expect(report.injectionRiskScore).toBeGreaterThanOrEqual(0);
        expect(report.injectionRiskScore).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.7**
   * Property 2: Empty store always returns overallScore === 0 and level === "ok"
   */
  it("empty store always returns overallScore === 0 and level === 'ok'", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") }),
        (now) => {
          const report = calculateMemoryHealth([], { now });
          expect(report.overallScore).toBe(0);
          expect(report.level).toBe("ok");
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 9.1**
   * Property 3: stats.deletedEntries count matches actual deleted count
   */
  it("stats.deletedEntries count matches actual deleted entries", () => {
    fc.assert(
      fc.property(arbEntries, (entries) => {
        const report = calculateMemoryHealth(entries, { now: new Date("2024-07-01T00:00:00.000Z") });
        const actualDeleted = entries.filter(e => e.deleted === true).length;
        expect(report.stats.deletedEntries).toBe(actualDeleted);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 7.3**
   * Property 4: Every cluster from findDuplicateClusters has entryIds.length >= 2
   */
  it("every cluster from findDuplicateClusters has entryIds.length >= 2", () => {
    fc.assert(
      fc.property(arbEntries, (entries) => {
        const clusters = findDuplicateClusters(entries);
        for (const cluster of clusters) {
          expect(cluster.entryIds.length).toBeGreaterThanOrEqual(2);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.3**
   * Property 5: overallScore equals the weighted formula
   */
  it("overallScore equals round(bloat×0.25 + conflict×0.25 + duplication×0.20 + staleness×0.15 + injectionRisk×0.15)", () => {
    fc.assert(
      fc.property(arbEntries, (entries) => {
        const report = calculateMemoryHealth(entries, { now: new Date("2024-07-01T00:00:00.000Z") });

        if (entries.length === 0) {
          expect(report.overallScore).toBe(0);
          return;
        }

        const expected = Math.round(
          report.bloatScore * 0.25 +
          report.conflictScore * 0.25 +
          report.duplicationScore * 0.20 +
          report.stalenessScore * 0.15 +
          report.injectionRiskScore * 0.15,
        );
        // Clamp expected to [0, 100]
        const clampedExpected = Math.round(Math.max(0, Math.min(100, expected)));
        expect(report.overallScore).toBe(clampedExpected);
      }),
      { numRuns: 100 },
    );
  });
});
