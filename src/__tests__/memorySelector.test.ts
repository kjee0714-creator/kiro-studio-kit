/**
 * Unit tests for memorySelector.
 * Tests specific scoring scenarios, mode behaviors, and edge cases.
 */
import { describe, it, expect } from "vitest";
import {
  scoreEntry,
  selectMemoryEntries,
  filterEntries,
} from "../core/memorySelector.js";
import type { DevMemoryEntry } from "../core/memoryValidator.js";

function makeEntry(overrides: Partial<DevMemoryEntry> = {}): DevMemoryEntry {
  return {
    id: "entry-001",
    createdAt: new Date().toISOString(),
    kind: "test_fix",
    summary: "Test fix summary",
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

describe("memorySelector", () => {
  describe("scoreEntry", () => {
    it("should return 0 for entry with no matches in task text", () => {
      const entry = makeEntry({
        relatedFiles: ["src/foo.ts"],
        relatedSymbols: ["fooFunc"],
        tags: ["foo"],
        severity: "low",
        createdAt: "2020-01-01T00:00:00.000Z",
      });
      const score = scoreEntry(entry, "completely unrelated text");
      expect(score).toBe(0);
    });

    it("should add +5 for relatedFiles match", () => {
      const entry = makeEntry({
        relatedFiles: ["src/helpers/compute.ts"],
        severity: "low",
        createdAt: "2020-01-01T00:00:00.000Z",
      });
      const score = scoreEntry(entry, "modify src/helpers/compute.ts");
      expect(score).toBe(5);
    });

    it("should add +4 for relatedSymbols match", () => {
      const entry = makeEntry({
        relatedSymbols: ["computeBudget"],
        severity: "low",
        createdAt: "2020-01-01T00:00:00.000Z",
      });
      const score = scoreEntry(entry, "fix computeBudget function");
      expect(score).toBe(4);
    });

    it("should add +3 for tags match", () => {
      const entry = makeEntry({
        tags: ["context-budget"],
        severity: "low",
        createdAt: "2020-01-01T00:00:00.000Z",
      });
      const score = scoreEntry(entry, "implement context-budget feature");
      expect(score).toBe(3);
    });

    it("should add +2 for kind keyword match (test_fix)", () => {
      const entry = makeEntry({
        kind: "test_fix",
        severity: "low",
        createdAt: "2020-01-01T00:00:00.000Z",
      });
      const score = scoreEntry(entry, "fix the vitest configuration");
      expect(score).toBe(2);
    });

    it("should add +2 for severity high", () => {
      const entry = makeEntry({
        severity: "high",
        createdAt: "2020-01-01T00:00:00.000Z",
      });
      const score = scoreEntry(entry, "unrelated text");
      expect(score).toBe(2);
    });

    it("should add +1 for severity medium", () => {
      const entry = makeEntry({
        severity: "medium",
        createdAt: "2020-01-01T00:00:00.000Z",
      });
      const score = scoreEntry(entry, "unrelated text");
      expect(score).toBe(1);
    });

    it("should add +1 for recent entry (within 30 days)", () => {
      const entry = makeEntry({
        severity: "low",
        createdAt: new Date().toISOString(),
      });
      const score = scoreEntry(entry, "unrelated text");
      expect(score).toBe(1);
    });

    it("should accumulate multiple scoring factors", () => {
      const entry = makeEntry({
        relatedFiles: ["src/test.ts"],
        relatedSymbols: ["myFunc"],
        tags: ["testing"],
        kind: "test_fix",
        severity: "high",
        createdAt: new Date().toISOString(),
      });
      // +5 (file) + +4 (symbol) + +3 (tag) + +2 (kind: "test" in text) + +2 (high) + +1 (recent)
      const score = scoreEntry(entry, "fix src/test.ts myFunc testing");
      expect(score).toBe(17);
    });

    it("should be case-insensitive", () => {
      const entry = makeEntry({
        relatedFiles: ["SRC/MyFile.ts"],
        severity: "low",
        createdAt: "2020-01-01T00:00:00.000Z",
      });
      const score = scoreEntry(entry, "modify src/myfile.ts");
      expect(score).toBe(5);
    });
  });

  describe("filterEntries", () => {
    it("should exclude disabled entries", () => {
      const entries = [makeEntry({ enabled: false })];
      expect(filterEntries(entries)).toHaveLength(0);
    });

    it("should exclude low confidence entries", () => {
      const entries = [makeEntry({ confidence: "low" })];
      expect(filterEntries(entries)).toHaveLength(0);
    });

    it("should exclude expired entries", () => {
      const entries = [makeEntry({ expiresAt: "2020-01-01T00:00:00.000Z" })];
      expect(filterEntries(entries)).toHaveLength(0);
    });

    it("should exclude superseded entries", () => {
      const entry1 = makeEntry({ id: "old-entry" });
      const entry2 = makeEntry({ id: "new-entry", supersedes: ["old-entry"] });
      const filtered = filterEntries([entry1, entry2]);
      expect(filtered.map((e) => e.id)).not.toContain("old-entry");
      expect(filtered.map((e) => e.id)).toContain("new-entry");
    });

    it("should keep valid entries", () => {
      const entries = [makeEntry()];
      expect(filterEntries(entries)).toHaveLength(1);
    });
  });

  describe("selectMemoryEntries", () => {
    it("should return empty for off mode", () => {
      const entries = [makeEntry({ tags: ["match"] })];
      const result = selectMemoryEntries(entries, "match", "off");
      expect(result.selected).toHaveLength(0);
    });

    it("should select matching entries in auto mode", () => {
      const entry = makeEntry({ tags: ["context-budget"] });
      const result = selectMemoryEntries([entry], "implement context-budget", "auto");
      expect(result.selected).toHaveLength(1);
    });

    it("should exclude score 0 entries in auto mode", () => {
      const entry = makeEntry({
        severity: "low",
        createdAt: "2020-01-01T00:00:00.000Z",
      });
      const result = selectMemoryEntries([entry], "completely unrelated", "auto");
      expect(result.selected).toHaveLength(0);
    });

    it("should limit to 5 entries in auto mode", () => {
      const entries = Array.from({ length: 10 }, (_, i) =>
        makeEntry({ id: `entry-${i}`, tags: ["match"] }),
      );
      const result = selectMemoryEntries(entries, "match", "auto");
      expect(result.selected.length).toBeLessThanOrEqual(5);
    });

    it("should include all valid entries in full mode", () => {
      const entries = [
        makeEntry({ id: "e1" }),
        makeEntry({ id: "e2" }),
        makeEntry({ id: "e3", enabled: false }),
      ];
      const result = selectMemoryEntries(entries, "anything", "full");
      expect(result.selected.length).toBe(2);
      expect(result.selected.map((e) => e.id)).not.toContain("e3");
    });

    it("should report totalAvailable correctly", () => {
      const entries = [makeEntry(), makeEntry({ id: "e2", enabled: false })];
      const result = selectMemoryEntries(entries, "test", "auto");
      // totalAvailable = filtered count (1 enabled)
      expect(result.totalAvailable).toBe(1);
    });
  });
});
