/**
 * memoryConflict.test.ts
 * Unit tests for memory conflict management (Phase 4-K).
 */

import { describe, it, expect } from "vitest";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import {
  isSupersededMemory,
  groupByConflictGroup,
  selectConflictWinners,
} from "../core/memoryConflict.js";
import { applyMemoryInjectionPolicy } from "../core/memoryInjectionPolicy.js";

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

describe("isSupersededMemory", () => {
  it("returns true when supersededBy is set", () => {
    expect(isSupersededMemory(makeEntry({ supersededBy: "newer-id" }))).toBe(true);
  });

  it("returns false when supersededBy is undefined", () => {
    expect(isSupersededMemory(makeEntry())).toBe(false);
  });

  it("returns false when supersededBy is empty string", () => {
    expect(isSupersededMemory(makeEntry({ supersededBy: "" }))).toBe(false);
  });
});

describe("groupByConflictGroup", () => {
  it("groups entries by conflictKey", () => {
    const entries = [
      makeEntry({ id: "a", conflictKey: "group1" }),
      makeEntry({ id: "b", conflictKey: "group1" }),
      makeEntry({ id: "c", conflictKey: "group2" }),
    ];
    const groups = groupByConflictGroup(entries);
    expect(groups.size).toBe(2);
    expect(groups.get("group1")?.map(e => e.id)).toEqual(["a", "b"]);
    expect(groups.get("group2")?.map(e => e.id)).toEqual(["c"]);
  });

  it("excludes entries without conflictKey", () => {
    const entries = [
      makeEntry({ id: "a", conflictKey: "group1" }),
      makeEntry({ id: "b" }),
    ];
    const groups = groupByConflictGroup(entries);
    expect(groups.size).toBe(1);
    expect(groups.get("group1")?.length).toBe(1);
  });

  it("returns empty map for no conflict groups", () => {
    const entries = [makeEntry({ id: "a" }), makeEntry({ id: "b" })];
    const groups = groupByConflictGroup(entries);
    expect(groups.size).toBe(0);
  });
});

describe("selectConflictWinners", () => {
  it("picks highest trust priority entry as winner", () => {
    const entries = [
      makeEntry({ id: "a", conflictKey: "g1", trustLevel: "probation" }),
      makeEntry({ id: "b", conflictKey: "g1", trustLevel: "verified" }),
      makeEntry({ id: "c", conflictKey: "g1", trustLevel: "trusted" }),
    ];
    const winners = selectConflictWinners(entries);
    expect(winners.has("b")).toBe(true);
    expect(winners.has("a")).toBe(false);
    expect(winners.has("c")).toBe(false);
  });

  it("is stable — first entry wins ties", () => {
    const entries = [
      makeEntry({ id: "a", conflictKey: "g1", trustLevel: "trusted" }),
      makeEntry({ id: "b", conflictKey: "g1", trustLevel: "trusted" }),
    ];
    const winners = selectConflictWinners(entries);
    expect(winners.has("a")).toBe(true);
    expect(winners.has("b")).toBe(false);
  });

  it("handles multiple groups independently", () => {
    const entries = [
      makeEntry({ id: "a", conflictKey: "g1", trustLevel: "probation" }),
      makeEntry({ id: "b", conflictKey: "g1", trustLevel: "trusted" }),
      makeEntry({ id: "c", conflictKey: "g2", trustLevel: "verified" }),
      makeEntry({ id: "d", conflictKey: "g2", trustLevel: "trusted" }),
    ];
    const winners = selectConflictWinners(entries);
    expect(winners.has("b")).toBe(true);
    expect(winners.has("c")).toBe(true);
  });
});

describe("injection policy conflict handling", () => {
  it("excludes entries with supersededBy set", () => {
    const entries = [
      makeEntry({ id: "a", trustLevel: "trusted", supersededBy: "b" }),
      makeEntry({ id: "b", trustLevel: "trusted" }),
    ];
    const result = applyMemoryInjectionPolicy(entries, { maxTotalEntries: 10, maxProbationEntries: 10 });
    expect(result.selectedEntries.map(e => e.id)).toEqual(["b"]);
    expect(result.stats.supersededExcludedCount).toBe(1);
  });

  it("includes at most 1 entry per conflictKey", () => {
    const entries = [
      makeEntry({ id: "a", conflictKey: "g1", trustLevel: "trusted" }),
      makeEntry({ id: "b", conflictKey: "g1", trustLevel: "probation" }),
      makeEntry({ id: "c", conflictKey: "g1", trustLevel: "verified" }),
    ];
    const result = applyMemoryInjectionPolicy(entries, { maxTotalEntries: 10, maxProbationEntries: 10 });
    const g1Entries = result.selectedEntries.filter(e => e.conflictKey === "g1");
    expect(g1Entries).toHaveLength(1);
    expect(g1Entries[0].id).toBe("c"); // verified wins
    expect(result.stats.conflictExcludedCount).toBe(2);
  });

  it("entries without conflictKey are not affected by conflict resolution", () => {
    const entries = [
      makeEntry({ id: "a", trustLevel: "trusted" }),
      makeEntry({ id: "b", trustLevel: "trusted" }),
    ];
    const result = applyMemoryInjectionPolicy(entries, { maxTotalEntries: 10, maxProbationEntries: 10 });
    expect(result.selectedEntries).toHaveLength(2);
    expect(result.stats.conflictExcludedCount).toBe(0);
  });

  it("superseded decision includes supersededBy ID", () => {
    const entries = [
      makeEntry({ id: "old", trustLevel: "trusted", supersededBy: "new" }),
      makeEntry({ id: "new", trustLevel: "trusted" }),
    ];
    const result = applyMemoryInjectionPolicy(entries, { maxTotalEntries: 10, maxProbationEntries: 10 });
    const decision = result.decisions.find(d => d.id === "old");
    expect(decision?.reason).toContain("Superseded by new");
  });

  it("conflict decision includes winner ID", () => {
    const entries = [
      makeEntry({ id: "winner", conflictKey: "g1", trustLevel: "verified" }),
      makeEntry({ id: "loser", conflictKey: "g1", trustLevel: "probation" }),
    ];
    const result = applyMemoryInjectionPolicy(entries, { maxTotalEntries: 10, maxProbationEntries: 10 });
    const decision = result.decisions.find(d => d.id === "loser");
    expect(decision?.reason).toContain("winner is winner");
  });
});

describe("validator schema extension", () => {
  it("accepts entries with supersededBy string", async () => {
    const { validateDevMemoryEntry } = await import("../core/memoryValidator.js");
    const entry = makeEntry({ supersededBy: "some-id" });
    const result = validateDevMemoryEntry(entry as unknown);
    expect(result.success).toBe(true);
  });

  it("rejects entries with supersededBy non-string", async () => {
    const { validateDevMemoryEntry } = await import("../core/memoryValidator.js");
    const entry = { ...makeEntry(), supersededBy: 123 };
    const result = validateDevMemoryEntry(entry as unknown);
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes("supersededBy"))).toBe(true);
  });

  it("accepts entries with disabledReason string", async () => {
    const { validateDevMemoryEntry } = await import("../core/memoryValidator.js");
    const entry = makeEntry({ disabledReason: "superseded" });
    const result = validateDevMemoryEntry(entry as unknown);
    expect(result.success).toBe(true);
  });

  it("rejects entries with disabledReason non-string", async () => {
    const { validateDevMemoryEntry } = await import("../core/memoryValidator.js");
    const entry = { ...makeEntry(), disabledReason: true };
    const result = validateDevMemoryEntry(entry as unknown);
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes("disabledReason"))).toBe(true);
  });
});
