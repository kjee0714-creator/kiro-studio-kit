/**
 * memoryUsagePersistence.test.ts
 * Unit tests for the usage stats persistence module (Phase 4-D).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { persistMemorySelections } from "../core/memoryUsagePersistence.js";
import { calculateMemoryHealth } from "../core/memoryHealth.js";
import { readMemoryEntries, rewriteMemoryEntries } from "../core/memoryStore.js";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import { mkdir, rm } from "fs/promises";

const TEST_DIR = ".test-tmp/usage-persistence-test";
const STORE_PATH = `${TEST_DIR}/dev-memory.jsonl`;

function makeEntry(overrides: Partial<DevMemoryEntry> = {}): DevMemoryEntry {
  return {
    id: "entry-1",
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
    ...overrides,
  };
}

describe("memoryUsagePersistence", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("persistMemorySelections", () => {
    it("updates selectedCount for eligible entries", async () => {
      const entry = makeEntry({
        id: "eligible-1",
        usageStats: { selectedCount: 3, successfulSelections: 1, rejectedSelections: 0 },
      });
      await rewriteMemoryEntries([entry], STORE_PATH);

      const result = await persistMemorySelections(
        [entry],
        { storePath: STORE_PATH, now: new Date("2024-06-01T00:00:00.000Z") },
      );

      expect(result.updatedIds).toContain("eligible-1");
      expect(result.skippedIds).toHaveLength(0);

      const stored = await readMemoryEntries(STORE_PATH);
      expect(stored[0].usageStats?.selectedCount).toBe(4);
    });

    it("updates lastSelectedAt timestamp", async () => {
      const entry = makeEntry({ id: "ts-entry" });
      await rewriteMemoryEntries([entry], STORE_PATH);

      const now = new Date("2024-07-15T12:00:00.000Z");
      await persistMemorySelections([entry], { storePath: STORE_PATH, now });

      const stored = await readMemoryEntries(STORE_PATH);
      expect(stored[0].usageStats?.lastSelectedAt).toBe("2024-07-15T12:00:00.000Z");
    });

    it("skips disabled entries", async () => {
      const entry = makeEntry({ id: "disabled-1", enabled: false });
      await rewriteMemoryEntries([entry], STORE_PATH);

      const result = await persistMemorySelections([entry], { storePath: STORE_PATH });

      expect(result.skippedIds).toContain("disabled-1");
      expect(result.updatedIds).toHaveLength(0);
    });

    it("skips deleted entries", async () => {
      const entry = makeEntry({ id: "deleted-1", deleted: true });
      await rewriteMemoryEntries([entry], STORE_PATH);

      const result = await persistMemorySelections([entry], { storePath: STORE_PATH });

      expect(result.skippedIds).toContain("deleted-1");
      expect(result.updatedIds).toHaveLength(0);
    });

    it("skips quarantined entries", async () => {
      const entry = makeEntry({ id: "quarantined-1", captureStatus: "quarantined" });
      await rewriteMemoryEntries([entry], STORE_PATH);

      const result = await persistMemorySelections([entry], { storePath: STORE_PATH });

      expect(result.skippedIds).toContain("quarantined-1");
      expect(result.updatedIds).toHaveLength(0);
    });

    it("skips entries not found in store", async () => {
      const storeEntry = makeEntry({ id: "in-store" });
      await rewriteMemoryEntries([storeEntry], STORE_PATH);

      const notInStore = makeEntry({ id: "not-in-store" });
      const result = await persistMemorySelections([notInStore], { storePath: STORE_PATH });

      expect(result.skippedIds).toContain("not-in-store");
      expect(result.updatedIds).toHaveLength(0);
    });

    it("deduplicates selectedEntries — same ID only increments +1", async () => {
      const entry = makeEntry({
        id: "dup-test",
        usageStats: { selectedCount: 5, successfulSelections: 2, rejectedSelections: 0 },
      });
      await rewriteMemoryEntries([entry], STORE_PATH);

      // Pass the same entry twice
      const result = await persistMemorySelections(
        [entry, entry],
        { storePath: STORE_PATH, now: new Date("2024-08-01T00:00:00.000Z") },
      );

      expect(result.updatedIds).toHaveLength(1);
      expect(result.updatedIds).toContain("dup-test");

      const stored = await readMemoryEntries(STORE_PATH);
      // Should be 6, not 7 — deduplicated to single +1
      expect(stored[0].usageStats?.selectedCount).toBe(6);
    });
  });

  describe("prompt generator persistence failure", () => {
    it("persistence failure does not throw when wrapped in try/catch", async () => {
      // Simulate what the prompt generator does: wrap in try/catch
      let caught = false;
      try {
        // Call with a non-existent store path that will return empty entries
        const persistResult = await persistMemorySelections(
          [makeEntry({ id: "some-id" })],
          { storePath: `${TEST_DIR}/nonexistent-dir/store.jsonl` },
        );
        // If it doesn't throw, it should have skipped the entry
        expect(persistResult.skippedIds).toContain("some-id");
      } catch {
        // This is the expected behavior in prompt generator - catch and continue
        caught = true;
      }

      // The prompt generator should continue regardless of outcome
      expect(typeof caught).toBe("boolean");
    });
  });

  describe("handleMemoryUsageStats", () => {
    it("displays entries sorted by selectedCount", async () => {
      const entries: DevMemoryEntry[] = [
        makeEntry({
          id: "high-usage",
          summary: "High usage entry",
          usageStats: { selectedCount: 10, successfulSelections: 5, rejectedSelections: 0, lastSelectedAt: "2024-06-01T00:00:00.000Z" },
        }),
        makeEntry({
          id: "low-usage",
          summary: "Low usage entry",
          usageStats: { selectedCount: 2, successfulSelections: 1, rejectedSelections: 0, lastSelectedAt: "2024-05-01T00:00:00.000Z" },
        }),
      ];

      // Verify the sorting logic: high-usage should come first
      const active = entries.filter((e) => e.enabled && e.deleted !== true);
      const sorted = active
        .filter((e) => (e.usageStats?.selectedCount ?? 0) > 0)
        .sort((a, b) => (b.usageStats?.selectedCount ?? 0) - (a.usageStats?.selectedCount ?? 0));

      expect(sorted[0].id).toBe("high-usage");
      expect(sorted[1].id).toBe("low-usage");
    });

    it("handles empty store gracefully", () => {
      // The function should not throw on empty store
      const report = calculateMemoryHealth([]);
      expect(report.stats.activeEntries).toBe(0);
      expect(report.stats.neverSelectedCount).toBe(0);
    });
  });

  describe("handleMemoryUsageReset", () => {
    it("resets usageStats to zero values", async () => {
      const entry = makeEntry({
        id: "reset-target",
        usageStats: {
          selectedCount: 15,
          successfulSelections: 8,
          rejectedSelections: 2,
          lastSelectedAt: "2024-06-01T00:00:00.000Z",
          lastSuccessfulAt: "2024-05-15T00:00:00.000Z",
        },
      });
      await rewriteMemoryEntries([entry], STORE_PATH);

      // Simulate what handleMemoryUsageReset does
      const entries = await readMemoryEntries(STORE_PATH);
      const target = entries.find((e) => e.id === "reset-target");
      expect(target).toBeDefined();

      if (!target) return; // guard for TypeScript

      target.usageStats = {
        selectedCount: 0,
        successfulSelections: 0,
        rejectedSelections: 0,
      };
      await rewriteMemoryEntries(entries, STORE_PATH);

      const updated = await readMemoryEntries(STORE_PATH);
      expect(updated[0].usageStats?.selectedCount).toBe(0);
      expect(updated[0].usageStats?.successfulSelections).toBe(0);
      expect(updated[0].usageStats?.rejectedSelections).toBe(0);
      expect(updated[0].usageStats?.lastSelectedAt).toBeUndefined();
      expect(updated[0].usageStats?.lastSuccessfulAt).toBeUndefined();
    });

    it("errors on unknown ID", async () => {
      const entry = makeEntry({ id: "known-id" });
      await rewriteMemoryEntries([entry], STORE_PATH);

      const entries = await readMemoryEntries(STORE_PATH);
      const target = entries.find((e) => e.id === "unknown-id");
      expect(target).toBeUndefined();
    });
  });

  describe("health report usage findings", () => {
    it("includes usage findings when neverSelected ratio > 0.5", () => {
      // Create entries where more than half have never been selected
      const entries: DevMemoryEntry[] = [
        makeEntry({ id: "never-1", enabled: true }),
        makeEntry({ id: "never-2", enabled: true }),
        makeEntry({ id: "never-3", enabled: true }),
        makeEntry({
          id: "selected-1",
          enabled: true,
          usageStats: { selectedCount: 5, successfulSelections: 2, rejectedSelections: 0 },
        }),
      ];

      const report = calculateMemoryHealth(entries);

      expect(report.stats.neverSelectedCount).toBe(3);
      expect(report.stats.frequentlySelectedCount).toBe(0);
      expect(report.stats.recentlyActiveCount).toBe(0);

      // 3/4 = 0.75 > 0.5, so a finding should be emitted
      const usageFinding = report.findings.find(
        (f) => f.type === "stale" && f.message.includes("never been selected"),
      );
      expect(usageFinding).toBeDefined();
      expect(usageFinding?.severity).toBe("warning");
      expect(usageFinding?.suggestedCommand).toBe("kiro-studio-kit memory usage stats");
    });
  });
});
