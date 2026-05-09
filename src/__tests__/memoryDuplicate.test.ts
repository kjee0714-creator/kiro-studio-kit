/**
 * memoryDuplicate.test.ts
 * Unit tests for memory duplicate management (Phase 4-L).
 */

import { describe, it, expect } from "vitest";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import { isDuplicateMemory, isMergedMemory, getCanonicalMemoryId, listDuplicateGroups, findDuplicateInfo } from "../core/memoryDuplicate.js";
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

describe("isDuplicateMemory", () => {
  it("returns true when duplicateOf is set", () => {
    expect(isDuplicateMemory(makeEntry({ duplicateOf: "canonical-id" }))).toBe(true);
  });
  it("returns false when duplicateOf is undefined", () => {
    expect(isDuplicateMemory(makeEntry())).toBe(false);
  });
  it("returns false when duplicateOf is empty", () => {
    expect(isDuplicateMemory(makeEntry({ duplicateOf: "" }))).toBe(false);
  });
});

describe("isMergedMemory", () => {
  it("returns true when mergedInto is set", () => {
    expect(isMergedMemory(makeEntry({ mergedInto: "target-id" }))).toBe(true);
  });
  it("returns false when mergedInto is undefined", () => {
    expect(isMergedMemory(makeEntry())).toBe(false);
  });
});

describe("getCanonicalMemoryId", () => {
  it("returns duplicateOf when set", () => {
    expect(getCanonicalMemoryId(makeEntry({ duplicateOf: "c1" }))).toBe("c1");
  });
  it("returns mergedInto when set", () => {
    expect(getCanonicalMemoryId(makeEntry({ mergedInto: "m1" }))).toBe("m1");
  });
  it("returns undefined when neither set", () => {
    expect(getCanonicalMemoryId(makeEntry())).toBeUndefined();
  });
});

describe("listDuplicateGroups", () => {
  it("groups by canonical duplicates array", () => {
    const entries = [
      makeEntry({ id: "c1", duplicates: ["d1", "d2"] }),
      makeEntry({ id: "d1", duplicateOf: "c1" }),
      makeEntry({ id: "d2", duplicateOf: "c1" }),
    ];
    const groups = listDuplicateGroups(entries);
    expect(groups.length).toBe(1);
    expect(groups[0].canonicalId).toBe("c1");
    expect(groups[0].duplicateIds).toContain("d1");
    expect(groups[0].duplicateIds).toContain("d2");
  });

  it("returns empty for no duplicates", () => {
    const entries = [makeEntry({ id: "a" }), makeEntry({ id: "b" })];
    expect(listDuplicateGroups(entries)).toHaveLength(0);
  });
});

describe("findDuplicateInfo", () => {
  it("identifies canonical role", () => {
    const entries = [makeEntry({ id: "c1", duplicates: ["d1"] })];
    const info = findDuplicateInfo(entries, "c1");
    expect(info.role).toBe("canonical");
    expect(info.duplicateIds).toContain("d1");
  });

  it("identifies duplicate role", () => {
    const entries = [makeEntry({ id: "d1", duplicateOf: "c1" })];
    const info = findDuplicateInfo(entries, "d1");
    expect(info.role).toBe("duplicate");
    expect(info.canonicalId).toBe("c1");
  });

  it("identifies merged role", () => {
    const entries = [makeEntry({ id: "m1", mergedInto: "t1" })];
    const info = findDuplicateInfo(entries, "m1");
    expect(info.role).toBe("merged");
    expect(info.canonicalId).toBe("t1");
  });

  it("returns none for regular entry", () => {
    const entries = [makeEntry({ id: "a" })];
    const info = findDuplicateInfo(entries, "a");
    expect(info.role).toBe("none");
  });
});

describe("injection policy duplicate handling", () => {
  it("excludes entries with duplicateOf set", () => {
    const entries = [
      makeEntry({ id: "c1", trustLevel: "trusted" }),
      makeEntry({ id: "d1", trustLevel: "trusted", duplicateOf: "c1" }),
    ];
    const result = applyMemoryInjectionPolicy(entries, { maxTotalEntries: 10, maxProbationEntries: 10 });
    expect(result.selectedEntries.map(e => e.id)).toEqual(["c1"]);
    expect(result.stats.duplicateExcludedCount).toBe(1);
  });

  it("excludes entries with mergedInto set", () => {
    const entries = [
      makeEntry({ id: "t1", trustLevel: "trusted" }),
      makeEntry({ id: "m1", trustLevel: "trusted", mergedInto: "t1" }),
    ];
    const result = applyMemoryInjectionPolicy(entries, { maxTotalEntries: 10, maxProbationEntries: 10 });
    expect(result.selectedEntries.map(e => e.id)).toEqual(["t1"]);
    expect(result.stats.mergedExcludedCount).toBe(1);
  });

  it("decision includes duplicate reason", () => {
    const entries = [makeEntry({ id: "d1", trustLevel: "trusted", duplicateOf: "c1" })];
    const result = applyMemoryInjectionPolicy(entries, { maxTotalEntries: 10, maxProbationEntries: 10 });
    const decision = result.decisions.find(d => d.id === "d1");
    expect(decision?.reason).toContain("Duplicate of c1");
  });

  it("decision includes merged reason", () => {
    const entries = [makeEntry({ id: "m1", trustLevel: "trusted", mergedInto: "t1" })];
    const result = applyMemoryInjectionPolicy(entries, { maxTotalEntries: 10, maxProbationEntries: 10 });
    const decision = result.decisions.find(d => d.id === "m1");
    expect(decision?.reason).toContain("Merged into t1");
  });
});

describe("validator schema extension", () => {
  it("accepts entries with duplicates array", async () => {
    const { validateDevMemoryEntry } = await import("../core/memoryValidator.js");
    const entry = makeEntry({ duplicates: ["id1", "id2"] });
    const result = validateDevMemoryEntry(entry as unknown);
    expect(result.success).toBe(true);
  });

  it("rejects entries with duplicates non-array", async () => {
    const { validateDevMemoryEntry } = await import("../core/memoryValidator.js");
    const entry = { ...makeEntry(), duplicates: "not-array" };
    const result = validateDevMemoryEntry(entry as unknown);
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes("duplicates"))).toBe(true);
  });

  it("accepts entries with mergedInto string", async () => {
    const { validateDevMemoryEntry } = await import("../core/memoryValidator.js");
    const entry = makeEntry({ mergedInto: "target-id" });
    const result = validateDevMemoryEntry(entry as unknown);
    expect(result.success).toBe(true);
  });

  it("rejects entries with mergedInto non-string", async () => {
    const { validateDevMemoryEntry } = await import("../core/memoryValidator.js");
    const entry = { ...makeEntry(), mergedInto: 123 };
    const result = validateDevMemoryEntry(entry as unknown);
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes("mergedInto"))).toBe(true);
  });
});

describe("markMemoryDuplicate persistence", () => {
  it("throws on missing canonicalId", async () => {
    const { markMemoryDuplicate } = await import("../core/memoryDuplicate.js");
    const { rewriteMemoryEntries } = await import("../core/memoryStore.js");
    const { mkdir, rm } = await import("fs/promises");

    const dir = ".test-tmp/dup-mark-test";
    await mkdir(dir, { recursive: true });
    const storePath = `${dir}/store.jsonl`;
    const entries = [makeEntry({ id: "a" }), makeEntry({ id: "b" })];
    await rewriteMemoryEntries(entries, storePath);

    await expect(markMemoryDuplicate("missing", "b", { storePath })).rejects.toThrow("not found");
    await rm(dir, { recursive: true, force: true });
  });

  it("throws on missing duplicateId", async () => {
    const { markMemoryDuplicate } = await import("../core/memoryDuplicate.js");
    const { rewriteMemoryEntries } = await import("../core/memoryStore.js");
    const { mkdir, rm } = await import("fs/promises");

    const dir = ".test-tmp/dup-mark-test2";
    await mkdir(dir, { recursive: true });
    const storePath = `${dir}/store.jsonl`;
    const entries = [makeEntry({ id: "a" }), makeEntry({ id: "b" })];
    await rewriteMemoryEntries(entries, storePath);

    await expect(markMemoryDuplicate("a", "missing", { storePath })).rejects.toThrow("not found");
    await rm(dir, { recursive: true, force: true });
  });

  it("throws when canonicalId === duplicateId", async () => {
    const { markMemoryDuplicate } = await import("../core/memoryDuplicate.js");
    await expect(markMemoryDuplicate("same", "same")).rejects.toThrow("itself");
  });
});

describe("clearMemoryDuplicate persistence", () => {
  it("default does not re-enable", async () => {
    const { markMemoryDuplicate, clearMemoryDuplicate } = await import("../core/memoryDuplicate.js");
    const { rewriteMemoryEntries, readMemoryEntries } = await import("../core/memoryStore.js");
    const { mkdir, rm } = await import("fs/promises");

    const dir = ".test-tmp/dup-clear-test";
    await mkdir(dir, { recursive: true });
    const storePath = `${dir}/store.jsonl`;
    const entries = [makeEntry({ id: "c1" }), makeEntry({ id: "d1" })];
    await rewriteMemoryEntries(entries, storePath);

    await markMemoryDuplicate("c1", "d1", { storePath });
    await clearMemoryDuplicate("d1", { storePath });

    const after = await readMemoryEntries(storePath);
    const dupEntry = after.find(e => e.id === "d1");
    expect(dupEntry?.duplicateOf).toBeUndefined();
    expect(dupEntry?.enabled).toBe(false); // NOT re-enabled by default
    await rm(dir, { recursive: true, force: true });
  });

  it("re-enables with reEnable=true", async () => {
    const { markMemoryDuplicate, clearMemoryDuplicate } = await import("../core/memoryDuplicate.js");
    const { rewriteMemoryEntries, readMemoryEntries } = await import("../core/memoryStore.js");
    const { mkdir, rm } = await import("fs/promises");

    const dir = ".test-tmp/dup-clear-test2";
    await mkdir(dir, { recursive: true });
    const storePath = `${dir}/store.jsonl`;
    const entries = [makeEntry({ id: "c1" }), makeEntry({ id: "d1" })];
    await rewriteMemoryEntries(entries, storePath);

    await markMemoryDuplicate("c1", "d1", { storePath });
    await clearMemoryDuplicate("d1", { storePath, reEnable: true });

    const after = await readMemoryEntries(storePath);
    const dupEntry = after.find(e => e.id === "d1");
    expect(dupEntry?.duplicateOf).toBeUndefined();
    expect(dupEntry?.enabled).toBe(true); // re-enabled
    await rm(dir, { recursive: true, force: true });
  });

  it("throws on non-duplicate entry", async () => {
    const { clearMemoryDuplicate } = await import("../core/memoryDuplicate.js");
    const { rewriteMemoryEntries } = await import("../core/memoryStore.js");
    const { mkdir, rm } = await import("fs/promises");

    const dir = ".test-tmp/dup-clear-test3";
    await mkdir(dir, { recursive: true });
    const storePath = `${dir}/store.jsonl`;
    const entries = [makeEntry({ id: "a" })];
    await rewriteMemoryEntries(entries, storePath);

    await expect(clearMemoryDuplicate("a", { storePath })).rejects.toThrow("not marked as a duplicate");
    await rm(dir, { recursive: true, force: true });
  });

  it("removes duplicateId from canonical duplicates array", async () => {
    const { markMemoryDuplicate, clearMemoryDuplicate } = await import("../core/memoryDuplicate.js");
    const { rewriteMemoryEntries, readMemoryEntries } = await import("../core/memoryStore.js");
    const { mkdir, rm } = await import("fs/promises");

    const dir = ".test-tmp/dup-clear-test4";
    await mkdir(dir, { recursive: true });
    const storePath = `${dir}/store.jsonl`;
    const entries = [makeEntry({ id: "c1" }), makeEntry({ id: "d1" }), makeEntry({ id: "d2" })];
    await rewriteMemoryEntries(entries, storePath);

    await markMemoryDuplicate("c1", "d1", { storePath });
    await markMemoryDuplicate("c1", "d2", { storePath });
    await clearMemoryDuplicate("d1", { storePath });

    const after = await readMemoryEntries(storePath);
    const canEntry = after.find(e => e.id === "c1");
    expect(canEntry?.duplicates).not.toContain("d1");
    expect(canEntry?.duplicates).toContain("d2");
    await rm(dir, { recursive: true, force: true });
  });
});
