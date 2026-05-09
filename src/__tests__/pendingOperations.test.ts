/**
 * pendingOperations.test.ts
 * Unit tests for pending memory operations pure functions and CLI handlers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import {
  isPendingEntry,
  promotePendingEntry,
  promoteAllPendingEntries,
  discardPendingEntry,
  classifyPrunePendingCandidates,
  applyPrunePendingEntries,
  computePendingStats,
} from "../core/pendingOperations.js";

function makePendingEntry(overrides: Partial<DevMemoryEntry> = {}): DevMemoryEntry {
  return {
    id: overrides.id ?? "test-id-1",
    createdAt: overrides.createdAt ?? "2024-01-01T00:00:00.000Z",
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
    enabled: false,
    captureStatus: "quarantined",
    trustLevel: "probation",
    authority: "hint",
    ...overrides,
  };
}

describe("pendingOperations pure functions", () => {
  describe("isPendingEntry", () => {
    it("returns true for a normal pending entry", () => {
      const entry = makePendingEntry();
      expect(isPendingEntry(entry)).toBe(true);
    });

    it("returns false for a deleted entry", () => {
      const entry = makePendingEntry({ deleted: true });
      expect(isPendingEntry(entry)).toBe(false);
    });

    it("returns false for a discarded entry", () => {
      const entry = makePendingEntry({ captureStatus: "discarded" });
      expect(isPendingEntry(entry)).toBe(false);
    });
  });

  describe("promotePendingEntry", () => {
    it("sets promotion fields correctly", () => {
      const entry = makePendingEntry();
      const now = new Date("2024-06-01T12:00:00.000Z");
      const result = promotePendingEntry(entry, now);

      expect(result.captureStatus).toBe("active");
      expect(result.enabled).toBe(true);
      expect(result.trustLevel).toBe("probation");
      expect(result.authority).toBe("hint");
      expect(result.promotedAt).toBe("2024-06-01T12:00:00.000Z");
    });

    it("does not mutate the original entry", () => {
      const entry = makePendingEntry();
      promotePendingEntry(entry);
      expect(entry.captureStatus).toBe("quarantined");
      expect(entry.enabled).toBe(false);
    });
  });

  describe("promoteAllPendingEntries", () => {
    it("promotes all non-deleted non-discarded entries", () => {
      const entries = [
        makePendingEntry({ id: "a" }),
        makePendingEntry({ id: "b", deleted: true }),
        makePendingEntry({ id: "c", captureStatus: "discarded" }),
        makePendingEntry({ id: "d" }),
      ];
      const { promoted, remaining } = promoteAllPendingEntries(entries);

      expect(promoted.length).toBe(2);
      expect(promoted[0].id).toBe("a");
      expect(promoted[1].id).toBe("d");
      expect(remaining.length).toBe(2);
      expect(remaining[0].id).toBe("b");
      expect(remaining[1].id).toBe("c");
    });

    it("returns empty promoted array when no promotable entries exist", () => {
      const entries = [
        makePendingEntry({ id: "a", deleted: true }),
        makePendingEntry({ id: "b", captureStatus: "discarded" }),
      ];
      const { promoted, remaining } = promoteAllPendingEntries(entries);
      expect(promoted.length).toBe(0);
      expect(remaining.length).toBe(2);
    });
  });

  describe("discardPendingEntry", () => {
    it("sets captureStatus to discarded on target entry", () => {
      const entries = [
        makePendingEntry({ id: "a" }),
        makePendingEntry({ id: "b" }),
      ];
      const { updated, discardedEntry } = discardPendingEntry(entries, "a");

      expect(discardedEntry.captureStatus).toBe("discarded");
      expect(updated[0].captureStatus).toBe("discarded");
      expect(updated[1].captureStatus).toBe("quarantined");
    });

    it("throws not_found for non-existent ID", () => {
      const entries = [makePendingEntry({ id: "a" })];
      expect(() => discardPendingEntry(entries, "nonexistent")).toThrow("not_found");
    });

    it("throws entry_deleted for deleted entry", () => {
      const entries = [makePendingEntry({ id: "a", deleted: true })];
      expect(() => discardPendingEntry(entries, "a")).toThrow("entry_deleted");
    });

    it("throws already_discarded for discarded entry", () => {
      const entries = [makePendingEntry({ id: "a", captureStatus: "discarded" })];
      expect(() => discardPendingEntry(entries, "a")).toThrow("already_discarded");
    });
  });

  describe("classifyPrunePendingCandidates", () => {
    it("identifies entries older than threshold", () => {
      const now = new Date("2024-06-01T00:00:00.000Z");
      const entries = [
        makePendingEntry({ id: "old", createdAt: "2024-01-01T00:00:00.000Z" }),
        makePendingEntry({ id: "new", createdAt: "2024-05-20T00:00:00.000Z" }),
      ];
      const candidates = classifyPrunePendingCandidates(entries, 30, now);

      expect(candidates.length).toBe(1);
      expect(candidates[0].entry.id).toBe("old");
      expect(candidates[0].ageInDays).toBeGreaterThan(30);
    });

    it("excludes deleted and discarded entries", () => {
      const now = new Date("2024-06-01T00:00:00.000Z");
      const entries = [
        makePendingEntry({ id: "old-deleted", createdAt: "2024-01-01T00:00:00.000Z", deleted: true }),
        makePendingEntry({ id: "old-discarded", createdAt: "2024-01-01T00:00:00.000Z", captureStatus: "discarded" }),
        makePendingEntry({ id: "old-valid", createdAt: "2024-01-01T00:00:00.000Z" }),
      ];
      const candidates = classifyPrunePendingCandidates(entries, 30, now);

      expect(candidates.length).toBe(1);
      expect(candidates[0].entry.id).toBe("old-valid");
    });

    it("returns empty array when no entries exceed threshold", () => {
      const now = new Date("2024-06-01T00:00:00.000Z");
      const entries = [
        makePendingEntry({ id: "new", createdAt: "2024-05-20T00:00:00.000Z" }),
      ];
      const candidates = classifyPrunePendingCandidates(entries, 30, now);
      expect(candidates.length).toBe(0);
    });
  });

  describe("applyPrunePendingEntries", () => {
    it("sets captureStatus to discarded on candidate entries", () => {
      const entries = [
        makePendingEntry({ id: "a" }),
        makePendingEntry({ id: "b" }),
        makePendingEntry({ id: "c" }),
      ];
      const result = applyPrunePendingEntries(entries, ["a", "c"]);

      expect(result[0].captureStatus).toBe("discarded");
      expect(result[1].captureStatus).toBe("quarantined");
      expect(result[2].captureStatus).toBe("discarded");
    });
  });

  describe("computePendingStats", () => {
    it("computes correct stats for mixed entries", () => {
      const now = new Date("2024-06-01T00:00:00.000Z");
      const entries = [
        makePendingEntry({ id: "a", createdAt: "2024-01-01T00:00:00.000Z" }),
        makePendingEntry({ id: "b", createdAt: "2024-05-20T00:00:00.000Z" }),
        makePendingEntry({ id: "c", deleted: true, createdAt: "2023-01-01T00:00:00.000Z" }),
        makePendingEntry({ id: "d", captureStatus: "discarded", createdAt: "2023-06-01T00:00:00.000Z" }),
      ];
      const stats = computePendingStats(entries, now);

      expect(stats.pendingCount).toBe(2); // only a and b (not deleted, not discarded)
      expect(stats.oldPendingCount).toBe(1); // only a is >30 days
      expect(stats.oldestPendingAt).toBe("2024-01-01T00:00:00.000Z");
    });

    it("returns zero counts for empty array", () => {
      const stats = computePendingStats([]);
      expect(stats.pendingCount).toBe(0);
      expect(stats.oldPendingCount).toBe(0);
      expect(stats.oldestPendingAt).toBeNull();
    });
  });
});

describe("pending CLI handlers", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("process.exit"); });
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Note: CLI handler integration tests would require mocking the store I/O.
  // The pure function tests above cover the core logic thoroughly.
  // These tests verify the handler argument validation paths.

  it("handlePendingInspect errors on missing ID", async () => {
    const { handlePendingInspect } = await import("../core/memoryCommands.js");
    await expect(handlePendingInspect([])).rejects.toThrow("process.exit");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("IDを指定"));
  });

  it("handlePendingDiscard errors on missing ID", async () => {
    const { handlePendingDiscard } = await import("../core/memoryCommands.js");
    await expect(handlePendingDiscard([])).rejects.toThrow("process.exit");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("IDを指定"));
  });
});
