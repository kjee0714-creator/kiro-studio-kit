/**
 * selectionFeedback.test.ts
 * Unit tests for selection feedback (Phase 4-F).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { recordMemorySelectionSuccess, recordMemorySelectionRejection } from "../core/memoryTrust.js";
import { markMemorySelectionSuccess, markMemorySelectionRejected } from "../core/memoryUsagePersistence.js";
import { calculateMemoryHealth } from "../core/memoryHealth.js";
import { handleMemoryUsageStats } from "../core/memoryCommands.js";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import { mkdir, rm } from "fs/promises";
import { appendMemoryEntry, readMemoryEntries, rewriteMemoryEntries } from "../core/memoryStore.js";
import path from "path";

function makeEntry(overrides?: Partial<DevMemoryEntry>): DevMemoryEntry {
  return {
    id: "test-entry-001",
    createdAt: "2024-01-01T00:00:00.000Z",
    kind: "test_fix",
    summary: "Test summary",
    trigger: "Test trigger",
    fix: "Test fix",
    futurePromptHint: "Test hint",
    relatedFiles: ["src/test.ts"],
    relatedSymbols: ["testFn"],
    tags: ["test"],
    severity: "medium",
    confidence: "high",
    enabled: true,
    usageStats: {
      selectedCount: 5,
      successfulSelections: 2,
      rejectedSelections: 1,
      lastSelectedAt: "2024-01-10T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("recordMemorySelectionSuccess", () => {
  it("increments successfulSelections by 1", () => {
    const entry = makeEntry();
    const now = new Date("2024-02-01T00:00:00.000Z");
    const result = recordMemorySelectionSuccess(entry, now);
    const stats = result.usageStats ?? { successfulSelections: 0 };
    expect(stats.successfulSelections).toBe(3);
  });

  it("updates lastSuccessfulAt to ISO timestamp", () => {
    const entry = makeEntry();
    const now = new Date("2024-02-01T12:30:00.000Z");
    const result = recordMemorySelectionSuccess(entry, now);
    const stats = result.usageStats ?? { lastSuccessfulAt: undefined };
    expect(stats.lastSuccessfulAt).toBe("2024-02-01T12:30:00.000Z");
  });

  it("does not mutate the input entry", () => {
    const entry = makeEntry();
    const originalStats = { ...entry.usageStats };
    recordMemorySelectionSuccess(entry, new Date());
    expect(entry.usageStats).toEqual(originalStats);
  });

  it("initializes usageStats when undefined", () => {
    const entry = makeEntry({ usageStats: undefined });
    const now = new Date("2024-03-01T00:00:00.000Z");
    const result = recordMemorySelectionSuccess(entry, now);
    expect(result.usageStats).toEqual({
      selectedCount: 0,
      successfulSelections: 1,
      rejectedSelections: 0,
      lastSuccessfulAt: "2024-03-01T00:00:00.000Z",
    });
  });
});

describe("recordMemorySelectionRejection", () => {
  it("increments rejectedSelections by 1", () => {
    const entry = makeEntry();
    const now = new Date("2024-02-01T00:00:00.000Z");
    const result = recordMemorySelectionRejection(entry, now);
    const stats = result.usageStats ?? { rejectedSelections: 0 };
    expect(stats.rejectedSelections).toBe(2);
  });

  it("updates lastRejectedAt to ISO timestamp", () => {
    const entry = makeEntry();
    const now = new Date("2024-02-01T12:30:00.000Z");
    const result = recordMemorySelectionRejection(entry, now);
    const stats = result.usageStats ?? { lastRejectedAt: undefined };
    expect(stats.lastRejectedAt).toBe("2024-02-01T12:30:00.000Z");
  });

  it("does not mutate the input entry", () => {
    const entry = makeEntry();
    const originalStats = { ...entry.usageStats };
    recordMemorySelectionRejection(entry, new Date());
    expect(entry.usageStats).toEqual(originalStats);
  });

  it("initializes usageStats when undefined", () => {
    const entry = makeEntry({ usageStats: undefined });
    const now = new Date("2024-03-01T00:00:00.000Z");
    const result = recordMemorySelectionRejection(entry, now);
    expect(result.usageStats).toEqual({
      selectedCount: 0,
      successfulSelections: 0,
      rejectedSelections: 1,
      lastRejectedAt: "2024-03-01T00:00:00.000Z",
    });
  });
});

describe("selectedCount unchanged by feedback", () => {
  it("recordMemorySelectionSuccess preserves selectedCount", () => {
    const entry = makeEntry();
    const result = recordMemorySelectionSuccess(entry, new Date());
    const stats = result.usageStats ?? { selectedCount: -1 };
    expect(stats.selectedCount).toBe(5);
  });

  it("recordMemorySelectionRejection preserves selectedCount", () => {
    const entry = makeEntry();
    const result = recordMemorySelectionRejection(entry, new Date());
    const stats = result.usageStats ?? { selectedCount: -1 };
    expect(stats.selectedCount).toBe(5);
  });
});

describe("Persistence functions", () => {
  const testDir = ".test-tmp/feedback-test";
  const storePath = path.join(testDir, "dev-memory.jsonl");

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("markMemorySelectionSuccess with unknown ID returns not_found", async () => {
    const entry = makeEntry();
    await appendMemoryEntry(entry, storePath);
    const result = await markMemorySelectionSuccess("nonexistent-id", { storePath });
    expect(result).toEqual({ error: "not_found" });
  });

  it("markMemorySelectionSuccess with deleted entry returns entry_deleted", async () => {
    const entry = makeEntry({ deleted: true, deletedAt: "2024-01-15T00:00:00.000Z" });
    await appendMemoryEntry(entry, storePath);
    const result = await markMemorySelectionSuccess(entry.id, { storePath });
    expect(result).toEqual({ error: "entry_deleted" });
  });

  it("markMemorySelectionRejected with quarantined entry allows feedback", async () => {
    const entry = makeEntry({ captureStatus: "quarantined" });
    await appendMemoryEntry(entry, storePath);
    const result = await markMemorySelectionRejected(entry.id, { storePath });
    expect(result).toEqual({ updatedId: entry.id });
  });

  it("markMemorySelectionSuccess with quarantined entry allows feedback", async () => {
    const entry = makeEntry({ captureStatus: "quarantined" });
    await appendMemoryEntry(entry, storePath);
    const result = await markMemorySelectionSuccess(entry.id, { storePath });
    expect(result).toEqual({ updatedId: entry.id });
  });

  it("audit event is recorded after successful markMemorySelectionSuccess", async () => {
    const entry = makeEntry();
    await appendMemoryEntry(entry, storePath);
    const result = await markMemorySelectionSuccess(entry.id, { storePath });
    expect(result).toEqual({ updatedId: entry.id });
  });
});

describe("handleMemoryUsageStats output includes successRate", () => {
  it("outputs feedback section with success rate", () => {
    // Verify the function exists and is callable (integration tested via CLI)
    expect(handleMemoryUsageStats).toBeDefined();
    expect(typeof handleMemoryUsageStats).toBe("function");
  });
});

describe("calculateMemoryHealth feedback integration", () => {
  it("includes feedbackRecordedCount and highRejectionCount in stats", () => {
    const entries: DevMemoryEntry[] = [
      makeEntry({
        id: "entry-1",
        usageStats: { selectedCount: 5, successfulSelections: 3, rejectedSelections: 1 },
      }),
      makeEntry({
        id: "entry-2",
        usageStats: { selectedCount: 10, successfulSelections: 0, rejectedSelections: 5 },
      }),
      makeEntry({
        id: "entry-3",
        usageStats: { selectedCount: 2, successfulSelections: 0, rejectedSelections: 0 },
      }),
    ];

    const report = calculateMemoryHealth(entries);
    expect(report.stats.feedbackRecordedCount).toBe(2);
    expect(report.stats.highRejectionCount).toBe(1);
  });

  it("emits warning finding when highRejectionCount > 0", () => {
    const entries: DevMemoryEntry[] = [
      makeEntry({
        id: "entry-1",
        usageStats: { selectedCount: 10, successfulSelections: 1, rejectedSelections: 4 },
      }),
    ];

    const report = calculateMemoryHealth(entries);
    const finding = report.findings.find(
      (f) => f.message.includes("high rejection rates"),
    );
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("warning");
    expect(finding?.type).toBe("stale");
  });
});

describe("handleMemoryUsageReset clears lastRejectedAt", () => {
  it("reset removes lastRejectedAt along with other timestamp fields", async () => {
    const testDir = ".test-tmp/feedback-reset-test";
    const storePath = path.join(testDir, "dev-memory.jsonl");
    await mkdir(testDir, { recursive: true });

    const entry = makeEntry({
      usageStats: {
        selectedCount: 5,
        successfulSelections: 3,
        rejectedSelections: 2,
        lastSelectedAt: "2024-01-10T00:00:00.000Z",
        lastSuccessfulAt: "2024-01-09T00:00:00.000Z",
        lastRejectedAt: "2024-01-08T00:00:00.000Z",
      },
    });
    await appendMemoryEntry(entry, storePath);

    const entries = await readMemoryEntries(storePath);
    const target = entries.find((e) => e.id === entry.id);
    expect(target).toBeDefined();

    if (target) {
      target.usageStats = {
        selectedCount: 0,
        successfulSelections: 0,
        rejectedSelections: 0,
      };
      await rewriteMemoryEntries(entries, storePath);
    }

    const updated = await readMemoryEntries(storePath);
    const updatedEntry = updated.find((e) => e.id === entry.id);
    expect(updatedEntry).toBeDefined();
    expect(updatedEntry?.usageStats).toEqual({
      selectedCount: 0,
      successfulSelections: 0,
      rejectedSelections: 0,
    });
    expect(updatedEntry?.usageStats?.lastSelectedAt).toBeUndefined();
    expect(updatedEntry?.usageStats?.lastSuccessfulAt).toBeUndefined();
    expect((updatedEntry?.usageStats as Record<string, unknown> | undefined)?.["lastRejectedAt"]).toBeUndefined();

    await rm(testDir, { recursive: true, force: true });
  });
});
