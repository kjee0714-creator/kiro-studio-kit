/**
 * memoryInjectionPolicy.test.ts
 * Unit tests for memory injection policy (Phase 4-I).
 */

import { describe, it, expect } from "vitest";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import {
  applyMemoryInjectionPolicy,
  isHighRejectionMemory,
  isAutoCapturedMemory,
  getTrustPriority,
  DEFAULT_MEMORY_INJECTION_POLICY,
} from "../core/memoryInjectionPolicy.js";

function makeEntry(overrides: Partial<DevMemoryEntry> = {}): DevMemoryEntry {
  return {
    id: overrides.id ?? "test-id-1",
    createdAt: "2024-01-01T00:00:00.000Z",
    kind: "test_fix",
    summary: "Test summary",
    trigger: "Test trigger",
    fix: "Test fix",
    futurePromptHint: "Test hint",
    relatedFiles: [],
    relatedSymbols: [],
    tags: [],
    severity: "medium",
    confidence: "high",
    enabled: true,
    ...overrides,
  };
}

describe("isHighRejectionMemory", () => {
  it("returns true when rejected >= 3 and rejected > successful", () => {
    const entry = makeEntry({
      usageStats: { selectedCount: 10, successfulSelections: 2, rejectedSelections: 4 },
    });
    expect(isHighRejectionMemory(entry)).toBe(true);
  });

  it("returns false when rejected < 3", () => {
    const entry = makeEntry({
      usageStats: { selectedCount: 5, successfulSelections: 1, rejectedSelections: 2 },
    });
    expect(isHighRejectionMemory(entry)).toBe(false);
  });

  it("returns false when rejected <= successful", () => {
    const entry = makeEntry({
      usageStats: { selectedCount: 10, successfulSelections: 5, rejectedSelections: 3 },
    });
    expect(isHighRejectionMemory(entry)).toBe(false);
  });

  it("returns false when no usageStats", () => {
    const entry = makeEntry();
    expect(isHighRejectionMemory(entry)).toBe(false);
  });
});

describe("isAutoCapturedMemory", () => {
  it("returns true when autoCaptured is true", () => {
    const entry = makeEntry({ autoCaptured: true });
    expect(isAutoCapturedMemory(entry)).toBe(true);
  });

  it("returns false when autoCaptured is undefined", () => {
    const entry = makeEntry();
    expect(isAutoCapturedMemory(entry)).toBe(false);
  });

  it("returns false when autoCaptured is false", () => {
    const entry = makeEntry({ autoCaptured: false });
    expect(isAutoCapturedMemory(entry)).toBe(false);
  });
});

describe("getTrustPriority", () => {
  it("returns 300 for verified", () => {
    expect(getTrustPriority(makeEntry({ trustLevel: "verified" }))).toBe(300);
  });

  it("returns 200 for trusted", () => {
    expect(getTrustPriority(makeEntry({ trustLevel: "trusted" }))).toBe(200);
  });

  it("returns 100 for probation", () => {
    expect(getTrustPriority(makeEntry({ trustLevel: "probation" }))).toBe(100);
  });

  it("returns 50 for undefined trustLevel", () => {
    const entry = makeEntry();
    delete (entry as Record<string, unknown>)["trustLevel"];
    expect(getTrustPriority(entry)).toBe(50);
  });
});

describe("applyMemoryInjectionPolicy", () => {
  it("returns empty result for empty input", () => {
    const result = applyMemoryInjectionPolicy([]);
    expect(result.selectedEntries).toHaveLength(0);
    expect(result.excludedEntries).toHaveLength(0);
    expect(result.stats.inputCount).toBe(0);
    expect(result.stats.outputCount).toBe(0);
  });

  it("excludes deleted entries", () => {
    const entries = [makeEntry({ id: "a", deleted: true }), makeEntry({ id: "b" })];
    const result = applyMemoryInjectionPolicy(entries);
    expect(result.selectedEntries.map(e => e.id)).toEqual(["b"]);
    expect(result.decisions.find(d => d.id === "a")?.action).toBe("exclude");
    expect(result.decisions.find(d => d.id === "a")?.reason).toContain("deleted");
  });

  it("excludes disabled entries", () => {
    const entries = [makeEntry({ id: "a", enabled: false }), makeEntry({ id: "b" })];
    const result = applyMemoryInjectionPolicy(entries);
    expect(result.selectedEntries.map(e => e.id)).toEqual(["b"]);
    expect(result.decisions.find(d => d.id === "a")?.action).toBe("exclude");
    expect(result.decisions.find(d => d.id === "a")?.reason).toContain("disabled");
  });

  it("excludes discarded entries", () => {
    const entries = [makeEntry({ id: "a", captureStatus: "discarded" }), makeEntry({ id: "b" })];
    const result = applyMemoryInjectionPolicy(entries);
    expect(result.selectedEntries.map(e => e.id)).toEqual(["b"]);
    expect(result.decisions.find(d => d.id === "a")?.action).toBe("exclude");
    expect(result.decisions.find(d => d.id === "a")?.reason).toContain("discarded");
  });

  it("excludes high rejection entries when suppressHighRejection=true", () => {
    const entries = [
      makeEntry({ id: "a", usageStats: { selectedCount: 10, successfulSelections: 1, rejectedSelections: 5 } }),
      makeEntry({ id: "b" }),
    ];
    const result = applyMemoryInjectionPolicy(entries, { suppressHighRejection: true });
    expect(result.selectedEntries.map(e => e.id)).toEqual(["b"]);
    expect(result.stats.highRejectionExcludedCount).toBe(1);
  });

  it("includes high rejection entries when suppressHighRejection=false", () => {
    const entries = [
      makeEntry({ id: "a", usageStats: { selectedCount: 10, successfulSelections: 1, rejectedSelections: 5 } }),
      makeEntry({ id: "b" }),
    ];
    const result = applyMemoryInjectionPolicy(entries, { suppressHighRejection: false });
    expect(result.selectedEntries.map(e => e.id)).toContain("a");
    expect(result.stats.highRejectionExcludedCount).toBe(0);
  });

  it("respects maxTotalEntries", () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ id: `entry-${i}`, trustLevel: "trusted" }),
    );
    const result = applyMemoryInjectionPolicy(entries, { maxTotalEntries: 3 });
    expect(result.selectedEntries).toHaveLength(3);
    expect(result.stats.outputCount).toBe(3);
  });

  it("limits probation entries to maxProbationEntries", () => {
    const entries = [
      makeEntry({ id: "v1", trustLevel: "verified" }),
      makeEntry({ id: "p1", trustLevel: "probation" }),
      makeEntry({ id: "p2", trustLevel: "probation" }),
      makeEntry({ id: "p3", trustLevel: "probation" }),
    ];
    const result = applyMemoryInjectionPolicy(entries, { maxProbationEntries: 1, maxTotalEntries: 10 });
    const probationIncluded = result.selectedEntries.filter(e => e.trustLevel === "probation");
    expect(probationIncluded).toHaveLength(1);
    expect(result.stats.probationIncludedCount).toBe(1);
  });

  it("enforces autoCaptured ratio", () => {
    const entries = [
      makeEntry({ id: "a1", trustLevel: "trusted", autoCaptured: true }),
      makeEntry({ id: "a2", trustLevel: "trusted", autoCaptured: true }),
      makeEntry({ id: "a3", trustLevel: "trusted", autoCaptured: true }),
      makeEntry({ id: "m1", trustLevel: "trusted", autoCaptured: false }),
    ];
    const result = applyMemoryInjectionPolicy(entries, {
      maxTotalEntries: 4,
      maxProbationEntries: 5,
      maxAutoCapturedRatio: 0.5,
    });
    const autoCapturedCount = result.selectedEntries.filter(e => e.autoCaptured === true).length;
    // With 4 entries and ratio 0.5, max allowed = floor(4 * 0.5) = 2, but after removal
    // the total changes. The key invariant: autoCaptured <= max(1, floor(total * ratio))
    expect(autoCapturedCount).toBeLessThanOrEqual(2);
  });

  it("prioritizes verified > trusted > probation", () => {
    const entries = [
      makeEntry({ id: "p1", trustLevel: "probation" }),
      makeEntry({ id: "t1", trustLevel: "trusted" }),
      makeEntry({ id: "v1", trustLevel: "verified" }),
    ];
    const result = applyMemoryInjectionPolicy(entries, { maxTotalEntries: 10, maxProbationEntries: 5 });
    expect(result.selectedEntries[0].id).toBe("v1");
    expect(result.selectedEntries[1].id).toBe("t1");
    expect(result.selectedEntries[2].id).toBe("p1");
  });

  it("preserves input order within same trust level (stable sort)", () => {
    const entries = [
      makeEntry({ id: "t1", trustLevel: "trusted" }),
      makeEntry({ id: "t2", trustLevel: "trusted" }),
      makeEntry({ id: "t3", trustLevel: "trusted" }),
    ];
    const result = applyMemoryInjectionPolicy(entries, { maxTotalEntries: 10, maxProbationEntries: 5 });
    expect(result.selectedEntries.map(e => e.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("does not mutate input entries", () => {
    const entries = [
      makeEntry({ id: "a", trustLevel: "probation" }),
      makeEntry({ id: "b", trustLevel: "trusted" }),
    ];
    const copy = JSON.parse(JSON.stringify(entries));
    applyMemoryInjectionPolicy(entries);
    expect(entries).toEqual(copy);
  });

  it("decisions array documents each entry", () => {
    const entries = [
      makeEntry({ id: "a", trustLevel: "trusted" }),
      makeEntry({ id: "b", deleted: true }),
    ];
    const result = applyMemoryInjectionPolicy(entries);
    expect(result.decisions).toHaveLength(2);
    expect(result.decisions.find(d => d.id === "a")?.action).toBe("include");
    expect(result.decisions.find(d => d.id === "b")?.action).toBe("exclude");
  });

  it("stats are accurate", () => {
    const entries = [
      makeEntry({ id: "v1", trustLevel: "verified" }),
      makeEntry({ id: "t1", trustLevel: "trusted", autoCaptured: true }),
      makeEntry({ id: "p1", trustLevel: "probation" }),
      makeEntry({ id: "d1", deleted: true }),
      makeEntry({ id: "r1", trustLevel: "trusted", usageStats: { selectedCount: 10, successfulSelections: 1, rejectedSelections: 5 } }),
    ];
    const result = applyMemoryInjectionPolicy(entries, { maxTotalEntries: 10, maxProbationEntries: 5 });
    expect(result.stats.inputCount).toBe(5);
    expect(result.stats.highRejectionExcludedCount).toBe(1);
    expect(result.stats.excludedCount).toBe(2); // deleted + high rejection
    expect(result.stats.outputCount).toBe(3);
  });

  it("default config values are correct", () => {
    expect(DEFAULT_MEMORY_INJECTION_POLICY.maxTotalEntries).toBe(5);
    expect(DEFAULT_MEMORY_INJECTION_POLICY.maxProbationEntries).toBe(1);
    expect(DEFAULT_MEMORY_INJECTION_POLICY.maxAutoCapturedRatio).toBe(0.5);
    expect(DEFAULT_MEMORY_INJECTION_POLICY.suppressHighRejection).toBe(true);
  });

  it("minimum guarantee: at least 1 autoCaptured entry when all valid entries are autoCaptured", () => {
    const entries = [
      makeEntry({ id: "a1", trustLevel: "trusted", autoCaptured: true }),
      makeEntry({ id: "a2", trustLevel: "trusted", autoCaptured: true }),
    ];
    const result = applyMemoryInjectionPolicy(entries, {
      maxTotalEntries: 5,
      maxProbationEntries: 5,
      maxAutoCapturedRatio: 0.1, // very low ratio
    });
    // Minimum guarantee: at least 1 entry remains
    expect(result.selectedEntries.length).toBeGreaterThanOrEqual(1);
  });

  it("minimum guarantee does not resurrect deleted/disabled/discarded/high-rejection entries", () => {
    const entries = [
      makeEntry({ id: "d1", deleted: true, autoCaptured: true, trustLevel: "trusted" }),
      makeEntry({ id: "dis1", enabled: false, autoCaptured: true, trustLevel: "trusted" }),
      makeEntry({ id: "disc1", captureStatus: "discarded", autoCaptured: true, trustLevel: "trusted" }),
      makeEntry({ id: "hr1", autoCaptured: true, trustLevel: "trusted", usageStats: { selectedCount: 10, successfulSelections: 0, rejectedSelections: 5 } }),
    ];
    const result = applyMemoryInjectionPolicy(entries, {
      maxTotalEntries: 5,
      maxProbationEntries: 5,
      maxAutoCapturedRatio: 1.0,
    });
    // All entries are invalid — none should be included
    expect(result.selectedEntries).toHaveLength(0);
  });

  it("maxProbationEntries=0 excludes all probation entries", () => {
    const entries = [
      makeEntry({ id: "p1", trustLevel: "probation" }),
      makeEntry({ id: "p2", trustLevel: "probation" }),
      makeEntry({ id: "t1", trustLevel: "trusted" }),
    ];
    const result = applyMemoryInjectionPolicy(entries, { maxProbationEntries: 0, maxTotalEntries: 10 });
    const probationIncluded = result.selectedEntries.filter(e => (e.trustLevel ?? "probation") === "probation");
    expect(probationIncluded).toHaveLength(0);
    expect(result.selectedEntries.map(e => e.id)).toEqual(["t1"]);
  });
});
