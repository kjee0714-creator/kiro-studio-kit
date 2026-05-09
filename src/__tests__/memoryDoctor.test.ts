/**
 * memoryDoctor.test.ts
 * Unit tests for memory repair / doctor (Phase 4-O).
 */

import { describe, it, expect } from "vitest";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import { detectMemoryIssues, applyMemoryRepairs } from "../core/memoryDoctor.js";

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

describe("detectMemoryIssues", () => {
  it("detects missing_supersede_target", () => {
    const entries = [makeEntry({ id: "a", supersededBy: "nonexistent" })];
    const report = detectMemoryIssues(entries);
    expect(report.issues.some(i => i.type === "missing_supersede_target")).toBe(true);
  });

  it("detects missing_duplicate_target", () => {
    const entries = [makeEntry({ id: "a", duplicateOf: "nonexistent" })];
    const report = detectMemoryIssues(entries);
    expect(report.issues.some(i => i.type === "missing_duplicate_target")).toBe(true);
  });

  it("detects missing_merge_target", () => {
    const entries = [makeEntry({ id: "a", mergedInto: "nonexistent" })];
    const report = detectMemoryIssues(entries);
    expect(report.issues.some(i => i.type === "missing_merge_target")).toBe(true);
  });

  it("detects invalid_conflict_group (1 member)", () => {
    const entries = [makeEntry({ id: "a", conflictKey: "lonely-group" })];
    const report = detectMemoryIssues(entries);
    expect(report.issues.some(i => i.type === "invalid_conflict_group")).toBe(true);
  });

  it("does not flag valid conflict group (2+ members)", () => {
    const entries = [
      makeEntry({ id: "a", conflictKey: "g1" }),
      makeEntry({ id: "b", conflictKey: "g1" }),
    ];
    const report = detectMemoryIssues(entries);
    expect(report.issues.some(i => i.type === "invalid_conflict_group")).toBe(false);
  });

  it("detects duplicate_relation_mismatch", () => {
    const entries = [
      makeEntry({ id: "canonical" }),
      makeEntry({ id: "dup", duplicateOf: "canonical" }),
    ];
    const report = detectMemoryIssues(entries);
    expect(report.issues.some(i => i.type === "duplicate_relation_mismatch")).toBe(true);
  });

  it("detects enabled_disabled_mismatch (disabled without reason)", () => {
    const entries = [makeEntry({ id: "a", enabled: false })];
    const report = detectMemoryIssues(entries);
    expect(report.issues.some(i => i.type === "enabled_disabled_mismatch")).toBe(true);
  });

  it("detects enabled_disabled_mismatch (enabled with reason)", () => {
    const entries = [makeEntry({ id: "a", enabled: true, disabledReason: "stale" })];
    const report = detectMemoryIssues(entries);
    expect(report.issues.some(i => i.type === "enabled_disabled_mismatch")).toBe(true);
  });

  it("detects expired_but_enabled", () => {
    const entries = [makeEntry({ id: "a", expiresAt: "2020-01-01T00:00:00.000Z" })];
    const report = detectMemoryIssues(entries);
    expect(report.issues.some(i => i.type === "expired_but_enabled")).toBe(true);
  });

  it("detects temporary_without_expiry", () => {
    const entries = [makeEntry({ id: "a", scope: "temporary" })];
    const report = detectMemoryIssues(entries);
    expect(report.issues.some(i => i.type === "temporary_without_expiry")).toBe(true);
    expect(report.issues.find(i => i.type === "temporary_without_expiry")?.repairable).toBe(false);
  });

  it("detects circular_supersede", () => {
    const entries = [
      makeEntry({ id: "a", supersededBy: "b" }),
      makeEntry({ id: "b", supersededBy: "a" }),
    ];
    const report = detectMemoryIssues(entries);
    expect(report.issues.some(i => i.type === "circular_supersede")).toBe(true);
    expect(report.issues.find(i => i.type === "circular_supersede")?.repairable).toBe(false);
  });

  it("detects circular_duplicate", () => {
    const entries = [
      makeEntry({ id: "a", duplicateOf: "b" }),
      makeEntry({ id: "b", duplicateOf: "a" }),
    ];
    const report = detectMemoryIssues(entries);
    expect(report.issues.some(i => i.type === "circular_duplicate")).toBe(true);
    expect(report.issues.find(i => i.type === "circular_duplicate")?.repairable).toBe(false);
  });

  it("returns clean report for healthy entries", () => {
    const entries = [makeEntry({ id: "a" }), makeEntry({ id: "b" })];
    const now = new Date("2024-01-15T00:00:00.000Z");
    const report = detectMemoryIssues(entries, now);
    expect(report.issueCount).toBe(0);
  });
});

describe("applyMemoryRepairs", () => {
  it("clears missing supersede target", () => {
    const entries = [makeEntry({ id: "a", supersededBy: "nonexistent", disabledReason: "superseded" })];
    const report = detectMemoryIssues(entries);
    const { repairedEntries } = applyMemoryRepairs(entries, report);
    expect(repairedEntries[0].supersededBy).toBeUndefined();
    expect(repairedEntries[0].disabledReason).toBeUndefined();
  });

  it("clears missing duplicate target", () => {
    const entries = [makeEntry({ id: "a", duplicateOf: "nonexistent", disabledReason: "duplicate" })];
    const report = detectMemoryIssues(entries);
    const { repairedEntries } = applyMemoryRepairs(entries, report);
    expect(repairedEntries[0].duplicateOf).toBeUndefined();
    expect(repairedEntries[0].disabledReason).toBeUndefined();
  });

  it("fixes expired_but_enabled", () => {
    const entries = [makeEntry({ id: "a", expiresAt: "2020-01-01T00:00:00.000Z" })];
    const report = detectMemoryIssues(entries);
    const { repairedEntries } = applyMemoryRepairs(entries, report);
    expect(repairedEntries[0].enabled).toBe(false);
    expect(repairedEntries[0].disabledReason).toBe("expired");
  });

  it("does not mutate input entries", () => {
    const entries = [makeEntry({ id: "a", supersededBy: "nonexistent" })];
    const copy = JSON.parse(JSON.stringify(entries));
    const report = detectMemoryIssues(entries);
    applyMemoryRepairs(entries, report);
    expect(entries).toEqual(copy);
  });

  it("does not repair circular references", () => {
    const entries = [
      makeEntry({ id: "a", supersededBy: "b" }),
      makeEntry({ id: "b", supersededBy: "a" }),
    ];
    const report = detectMemoryIssues(entries);
    const { repairedEntries } = applyMemoryRepairs(entries, report);
    // Circular entries should not be modified
    expect(repairedEntries.find(e => e.id === "a")?.supersededBy).toBe("b");
    expect(repairedEntries.find(e => e.id === "b")?.supersededBy).toBe("a");
  });

  it("preserves entry count (no deletion)", () => {
    const entries = [
      makeEntry({ id: "a", supersededBy: "nonexistent" }),
      makeEntry({ id: "b" }),
    ];
    const report = detectMemoryIssues(entries);
    const { repairedEntries } = applyMemoryRepairs(entries, report);
    expect(repairedEntries.length).toBe(entries.length);
  });

  it("does not change unrelated entries", () => {
    const entries = [
      makeEntry({ id: "broken", supersededBy: "nonexistent" }),
      makeEntry({ id: "healthy", trustLevel: "verified" }),
    ];
    const report = detectMemoryIssues(entries);
    const { repairedEntries } = applyMemoryRepairs(entries, report);
    const healthy = repairedEntries.find(e => e.id === "healthy");
    expect(healthy?.trustLevel).toBe("verified");
    expect(healthy?.supersededBy).toBeUndefined();
  });
});
