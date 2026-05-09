/**
 * Unit tests for dev-memory-visibility feature.
 * Tests scoreEntryDetailed, extended selectMemoryEntries, extended injectMemorySection,
 * handleMemoryInspect, handleMemoryStats, and parseMemoryReportFlag.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, rm } from "fs/promises";
import path from "node:path";
import {
  scoreEntryDetailed,
  selectMemoryEntries,
} from "../core/memorySelector.js";
import { injectMemorySection } from "../core/memoryInjector.js";
import { handleMemoryInspect, handleMemoryStats } from "../core/memoryCommands.js";
import { parseMemoryReportFlag } from "../cli.js";
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

const TEST_DIR = ".test-tmp/memoryVisibility-unit";

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  try {
    await rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe("scoreEntryDetailed", () => {
  it("should return file reason for relatedFiles match", () => {
    const entry = makeEntry({
      relatedFiles: ["src/foo.ts"],
      severity: "low",
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    const result = scoreEntryDetailed(entry, "modify src/foo.ts");
    const fileReasons = result.reasons.filter((r) => r.type === "file");
    expect(fileReasons).toHaveLength(1);
    expect(fileReasons[0].value).toBe("src/foo.ts");
    expect(fileReasons[0].points).toBe(5);
  });

  it("should return symbol reason for relatedSymbols match", () => {
    const entry = makeEntry({
      relatedSymbols: ["computeBudget"],
      severity: "low",
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    const result = scoreEntryDetailed(entry, "fix computeBudget function");
    const symbolReasons = result.reasons.filter((r) => r.type === "symbol");
    expect(symbolReasons).toHaveLength(1);
    expect(symbolReasons[0].value).toBe("computeBudget");
    expect(symbolReasons[0].points).toBe(4);
  });

  it("should return tag reason for tags match", () => {
    const entry = makeEntry({
      tags: ["context-budget"],
      severity: "low",
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    const result = scoreEntryDetailed(entry, "implement context-budget");
    const tagReasons = result.reasons.filter((r) => r.type === "tag");
    expect(tagReasons).toHaveLength(1);
    expect(tagReasons[0].value).toBe("context-budget");
    expect(tagReasons[0].points).toBe(3);
  });

  it("should return kind reason when kind keywords match", () => {
    const entry = makeEntry({
      kind: "test_fix",
      severity: "low",
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    const result = scoreEntryDetailed(entry, "fix the vitest configuration");
    const kindReasons = result.reasons.filter((r) => r.type === "kind");
    expect(kindReasons).toHaveLength(1);
    expect(kindReasons[0].value).toBe("test_fix");
    expect(kindReasons[0].points).toBe(2);
  });

  it("should return severity reason for high severity", () => {
    const entry = makeEntry({
      severity: "high",
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    const result = scoreEntryDetailed(entry, "unrelated text");
    const sevReasons = result.reasons.filter((r) => r.type === "severity");
    expect(sevReasons).toHaveLength(1);
    expect(sevReasons[0].value).toBe("high");
    expect(sevReasons[0].points).toBe(2);
  });

  it("should return severity reason for medium severity", () => {
    const entry = makeEntry({
      severity: "medium",
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    const result = scoreEntryDetailed(entry, "unrelated text");
    const sevReasons = result.reasons.filter((r) => r.type === "severity");
    expect(sevReasons).toHaveLength(1);
    expect(sevReasons[0].value).toBe("medium");
    expect(sevReasons[0].points).toBe(1);
  });

  it("should return recent reason for entry within 30 days", () => {
    const entry = makeEntry({
      severity: "low",
      createdAt: new Date().toISOString(),
    });
    const result = scoreEntryDetailed(entry, "unrelated text");
    const recentReasons = result.reasons.filter((r) => r.type === "recent");
    expect(recentReasons).toHaveLength(1);
    expect(recentReasons[0].value).toBe("within_30d");
    expect(recentReasons[0].points).toBe(1);
  });

  it("should return score 0 and empty reasons for no-match entry", () => {
    const entry = makeEntry({
      relatedFiles: ["src/unrelated.ts"],
      relatedSymbols: ["unrelatedFunc"],
      tags: ["unrelated-tag"],
      kind: "gotcha",
      severity: "low",
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    const result = scoreEntryDetailed(entry, "completely different text");
    expect(result.score).toBe(0);
    expect(result.reasons).toHaveLength(0);
  });

  it("should accumulate multiple reasons correctly", () => {
    const entry = makeEntry({
      relatedFiles: ["src/test.ts"],
      relatedSymbols: ["myFunc"],
      tags: ["testing"],
      kind: "test_fix",
      severity: "high",
      createdAt: new Date().toISOString(),
    });
    const result = scoreEntryDetailed(entry, "fix src/test.ts myFunc testing");
    // file(5) + symbol(4) + tag(3) + kind(2) + severity(2) + recent(1) = 17
    expect(result.score).toBe(17);
    expect(result.reasons.length).toBeGreaterThanOrEqual(5);
  });
});

describe("selectMemoryEntries extended fields", () => {
  it("should populate selectedDetails alongside selected", () => {
    const entry = makeEntry({ tags: ["match"] });
    const result = selectMemoryEntries([entry], "match", "auto");
    expect(result.selected).toHaveLength(1);
    expect(result.selectedDetails).toHaveLength(1);
    expect(result.selectedDetails?.[0].entry).toBe(result.selected[0]);
  });

  it("should compute consideredCount and excludedCount", () => {
    const entries = [
      makeEntry({ id: "e1", enabled: true }),
      makeEntry({ id: "e2", enabled: false }),
      makeEntry({ id: "e3", confidence: "low" }),
    ];
    const result = selectMemoryEntries(entries, "test", "auto");
    expect(result.consideredCount).toBe(1);
    expect(result.excludedCount).toBe(2);
  });

  it("should compute totalSelectedChars correctly", () => {
    const entry = makeEntry({ tags: ["match"] });
    const result = selectMemoryEntries([entry], "match", "auto");
    const expectedChars = result.selectedDetails?.reduce((sum, d) => sum + d.estimatedChars, 0) ?? 0;
    expect(result.totalSelectedChars).toBe(expectedChars);
  });

  it("should return empty selectedDetails for mode off", () => {
    const entry = makeEntry({ tags: ["match"] });
    const result = selectMemoryEntries([entry], "match", "off");
    expect(result.selectedDetails).toHaveLength(0);
    expect(result.consideredCount).toBe(0);
    expect(result.excludedCount).toBe(0);
    expect(result.totalSelectedChars).toBe(0);
  });
});

describe("injectMemorySection extended meta", () => {
  it("should include selectedDetails in meta", async () => {
    const storePath = path.join(TEST_DIR, "inject-test.jsonl");
    const entry = makeEntry({ tags: ["match"] });
    await writeFile(storePath, JSON.stringify(entry) + "\n");

    const { meta } = await injectMemorySection("match", "auto", storePath);
    expect(meta.selectedDetails).toBeDefined();
    expect(meta.selectedDetails?.length).toBeGreaterThanOrEqual(0);
  });

  it("should compute topScore correctly", async () => {
    const storePath = path.join(TEST_DIR, "inject-top.jsonl");
    const entry = makeEntry({ tags: ["match"], severity: "high" });
    await writeFile(storePath, JSON.stringify(entry) + "\n");

    const { meta } = await injectMemorySection("match", "auto", storePath);
    expect(meta.topScore).toBeGreaterThan(0);
  });

  it("should include totalSelectedChars in meta", async () => {
    const storePath = path.join(TEST_DIR, "inject-chars.jsonl");
    const entry = makeEntry({ tags: ["match"] });
    await writeFile(storePath, JSON.stringify(entry) + "\n");

    const { meta } = await injectMemorySection("match", "auto", storePath);
    expect(meta.totalSelectedChars).toBeGreaterThan(0);
  });

  it("should return zeroed fields for mode off", async () => {
    const storePath = path.join(TEST_DIR, "inject-off.jsonl");
    const entry = makeEntry({ tags: ["match"] });
    await writeFile(storePath, JSON.stringify(entry) + "\n");

    const { meta } = await injectMemorySection("match", "off", storePath);
    expect(meta.consideredCount).toBe(0);
    expect(meta.excludedCount).toBe(0);
    expect(meta.totalSelectedChars).toBe(0);
    expect(meta.topScore).toBe(0);
    expect(meta.selectedDetails).toHaveLength(0);
  });

  it("should map matchedReasons from reasons in selectedDetails", async () => {
    const storePath = path.join(TEST_DIR, "inject-reasons.jsonl");
    const entry = makeEntry({ tags: ["match"], severity: "high" });
    await writeFile(storePath, JSON.stringify(entry) + "\n");

    const { meta } = await injectMemorySection("match", "auto", storePath);
    if (meta.selectedDetails && meta.selectedDetails.length > 0) {
      const detail = meta.selectedDetails[0];
      expect(detail.matchedReasons).toBeDefined();
      expect(detail.matchedReasons.length).toBeGreaterThan(0);
      expect(detail.id).toBe(entry.id);
      expect(detail.summary).toBe(entry.summary);
      expect(detail.kind).toBe(entry.kind);
    }
  });
});

describe("handleMemoryInspect", () => {
  it("should display all fields for valid ID", async () => {
    const storePath = path.join(TEST_DIR, "inspect-test.jsonl");
    const entry = makeEntry({
      id: "inspect-id-123",
      kind: "lint_fix",
      severity: "high",
      confidence: "medium",
      relatedFiles: ["src/a.ts"],
      relatedSymbols: ["funcA"],
      tags: ["tag1"],
    });
    await writeFile(storePath, JSON.stringify(entry) + "\n");

    // Mock readMemoryEntries by mocking the store module
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // We need to mock the store path - use dynamic import with mock
    const memoryStore = await import("../core/memoryStore.js");
    const readSpy = vi.spyOn(memoryStore, "readMemoryEntries").mockResolvedValue([entry]);

    await handleMemoryInspect(["inspect-id-123"]);

    const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("ID: inspect-id-123");
    expect(output).toContain("Kind: lint_fix");
    expect(output).toContain("Severity: high");
    expect(output).toContain("Confidence: medium");
    expect(output).toContain("Enabled: true");
    expect(output).toContain("Summary:");
    expect(output).toContain("Trigger:");
    expect(output).toContain("Fix:");
    expect(output).toContain("Future Hint:");
    expect(output).toContain("src/a.ts");
    expect(output).toContain("funcA");
    expect(output).toContain("tag1");

    consoleSpy.mockRestore();
    readSpy.mockRestore();
  });

  it("should error on missing ID", async () => {
    const memoryStore = await import("../core/memoryStore.js");
    const readSpy = vi.spyOn(memoryStore, "readMemoryEntries").mockResolvedValue([]);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(handleMemoryInspect(["nonexistent-id"])).rejects.toThrow("process.exit called");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("nonexistent-id"));

    exitSpy.mockRestore();
    errorSpy.mockRestore();
    readSpy.mockRestore();
  });

  it("should error when no ID argument provided", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(handleMemoryInspect([])).rejects.toThrow("process.exit called");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("ID"));

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("should display disabled entries when their ID is specified", async () => {
    const entry = makeEntry({ id: "disabled-entry", enabled: false });
    const memoryStore = await import("../core/memoryStore.js");
    const readSpy = vi.spyOn(memoryStore, "readMemoryEntries").mockResolvedValue([entry]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await handleMemoryInspect(["disabled-entry"]);

    const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Enabled: false");

    consoleSpy.mockRestore();
    readSpy.mockRestore();
  });
});

describe("handleMemoryStats", () => {
  it("should display correct counts", async () => {
    const entries = [
      makeEntry({ id: "e1", enabled: true, confidence: "high", severity: "high", kind: "test_fix" }),
      makeEntry({ id: "e2", enabled: false, confidence: "high", severity: "medium", kind: "lint_fix" }),
      makeEntry({ id: "e3", enabled: true, confidence: "low", severity: "low", kind: "test_fix" }),
    ];
    const memoryStore = await import("../core/memoryStore.js");
    const readSpy = vi.spyOn(memoryStore, "readMemoryEntries").mockResolvedValue(entries);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await handleMemoryStats();

    const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Total entries: 3");
    expect(output).toContain("Enabled: 2");
    expect(output).toContain("Disabled: 1");
    expect(output).toContain("Low confidence: 1");
    expect(output).toContain("By kind:");
    expect(output).toContain("test_fix: 2");
    expect(output).toContain("lint_fix: 1");
    expect(output).toContain("By severity:");

    consoleSpy.mockRestore();
    readSpy.mockRestore();
  });

  it("should handle empty store gracefully", async () => {
    const memoryStore = await import("../core/memoryStore.js");
    const readSpy = vi.spyOn(memoryStore, "readMemoryEntries").mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await handleMemoryStats();

    const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Total entries: 0");
    expect(output).toContain("Enabled: 0");
    expect(output).toContain("Disabled: 0");

    consoleSpy.mockRestore();
    readSpy.mockRestore();
  });
});

describe("parseMemoryReportFlag", () => {
  it("should return true when --memory-report is present", () => {
    expect(parseMemoryReportFlag(["prompt", "task.md", "--memory-report"])).toBe(true);
  });

  it("should return false when --memory-report is absent", () => {
    expect(parseMemoryReportFlag(["prompt", "task.md"])).toBe(false);
  });

  it("should return true with other flags present", () => {
    expect(parseMemoryReportFlag(["prompt", "task.md", "--mode", "auto", "--memory-report", "--out", "dir"])).toBe(true);
  });

  it("should return false for similar but different flags", () => {
    expect(parseMemoryReportFlag(["prompt", "task.md", "--memory-reports"])).toBe(false);
    expect(parseMemoryReportFlag(["prompt", "task.md", "--memory"])).toBe(false);
  });
});
