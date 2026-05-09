/**
 * Unit tests for memoryHealth module.
 */
import { describe, it, expect } from "vitest";
import { calculateMemoryHealth, findDuplicateClusters } from "../core/memoryHealth.js";
import type { DevMemoryEntry } from "../core/memoryValidator.js";

/** Helper to create a valid entry with overrides */
function makeEntry(overrides: Partial<DevMemoryEntry> = {}): DevMemoryEntry {
  return {
    id: overrides.id ?? `entry-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: overrides.createdAt ?? "2024-06-01T00:00:00.000Z",
    kind: overrides.kind ?? "test_fix",
    summary: overrides.summary ?? "Test summary",
    trigger: overrides.trigger ?? "Test trigger",
    fix: overrides.fix ?? "Test fix",
    futurePromptHint: overrides.futurePromptHint ?? "Test hint",
    relatedFiles: overrides.relatedFiles ?? ["src/test.ts"],
    relatedSymbols: overrides.relatedSymbols ?? ["testFn"],
    tags: overrides.tags ?? ["testing"],
    severity: overrides.severity ?? "medium",
    confidence: overrides.confidence ?? "high",
    enabled: overrides.enabled ?? true,
    ...(overrides.deleted !== undefined ? { deleted: overrides.deleted } : {}),
    ...(overrides.deletedAt !== undefined ? { deletedAt: overrides.deletedAt } : {}),
    ...(overrides.expiresAt !== undefined ? { expiresAt: overrides.expiresAt } : {}),
    ...(overrides.supersedes !== undefined ? { supersedes: overrides.supersedes } : {}),
    ...(overrides.autoCaptured !== undefined ? { autoCaptured: overrides.autoCaptured } : {}),
    ...(overrides.conflictKey !== undefined ? { conflictKey: overrides.conflictKey } : {}),
  };
}

describe("memoryHealth", () => {
  describe("calculateMemoryHealth", () => {
    it("should return score 0, level ok, empty findings for empty store", () => {
      const report = calculateMemoryHealth([]);
      expect(report.overallScore).toBe(0);
      expect(report.level).toBe("ok");
      expect(report.findings).toEqual([]);
      expect(report.recommendations).toEqual([]);
      expect(report.stats.totalEntries).toBe(0);
      expect(report.stats.activeEntries).toBe(0);
      expect(report.stats.deletedEntries).toBe(0);
      expect(report.stats.disabledEntries).toBe(0);
      expect(report.stats.supersededEntries).toBe(0);
      expect(report.stats.expiredEntries).toBe(0);
      expect(report.stats.lowConfidenceEntries).toBe(0);
      expect(report.stats.autoCapturedEntries).toBe(0);
    });

    it("should produce high bloatScore for high active count", () => {
      // Create 200 active entries
      const entries: DevMemoryEntry[] = [];
      for (let i = 0; i < 200; i++) {
        entries.push(makeEntry({ id: `entry-${i}` }));
      }
      const report = calculateMemoryHealth(entries, { now: new Date("2024-06-15T00:00:00.000Z") });
      expect(report.bloatScore).toBeGreaterThanOrEqual(65);
      expect(report.stats.activeEntries).toBe(200);
    });

    it("should produce compact recommendation for deleted entries", () => {
      const entries = [
        makeEntry({ id: "active-1" }),
        makeEntry({ id: "deleted-1", deleted: true }),
        makeEntry({ id: "deleted-2", deleted: true }),
      ];
      const report = calculateMemoryHealth(entries, { now: new Date("2024-06-15T00:00:00.000Z") });
      expect(report.stats.deletedEntries).toBe(2);
      expect(report.recommendations).toContain(
        "Run `kiro-studio-kit memory compact` to remove deleted entries",
      );
    });

    it("should produce high stalenessScore for expired and old entries", () => {
      // Create entries that are very old (> 180 days)
      const oldDate = "2020-01-01T00:00:00.000Z";
      const entries: DevMemoryEntry[] = [];
      for (let i = 0; i < 10; i++) {
        entries.push(makeEntry({
          id: `old-${i}`,
          createdAt: oldDate,
          expiresAt: "2023-01-01T00:00:00.000Z",
        }));
      }
      const report = calculateMemoryHealth(entries, { now: new Date("2024-06-15T00:00:00.000Z") });
      expect(report.stalenessScore).toBeGreaterThan(40);
    });

    it("should produce high duplicationScore for duplicate-like entries", () => {
      // Create entries that form duplicate clusters
      const entries: DevMemoryEntry[] = [];
      for (let i = 0; i < 6; i++) {
        entries.push(makeEntry({
          id: `dup-${i}`,
          kind: "test_fix",
          tags: ["vitest", "mock", "testing"],
          relatedSymbols: ["vi.mock", "describe"],
          summary: "Fix vitest mock hoisting issue",
          futurePromptHint: "Always hoist vi.mock calls",
        }));
      }
      const report = calculateMemoryHealth(entries, { now: new Date("2024-06-15T00:00:00.000Z") });
      expect(report.duplicationScore).toBeGreaterThan(20);
    });

    it("should produce high conflictScore for same conflictKey entries", () => {
      const entries = [
        makeEntry({ id: "c1", conflictKey: "formatting" }),
        makeEntry({ id: "c2", conflictKey: "formatting" }),
        makeEntry({ id: "c3", conflictKey: "naming" }),
        makeEntry({ id: "c4", conflictKey: "naming" }),
      ];
      const report = calculateMemoryHealth(entries, { now: new Date("2024-06-15T00:00:00.000Z") });
      expect(report.conflictScore).toBeGreaterThanOrEqual(30);
    });

    it("should determine level thresholds correctly", () => {
      // ok: score 0-49
      const emptyReport = calculateMemoryHealth([]);
      expect(emptyReport.level).toBe("ok");

      // Create a scenario that produces warning level (score 50-74)
      const warningEntries: DevMemoryEntry[] = [];
      for (let i = 0; i < 160; i++) {
        warningEntries.push(makeEntry({
          id: `w-${i}`,
          conflictKey: i < 4 ? "conflict-group" : undefined,
        }));
      }
      const warningReport = calculateMemoryHealth(warningEntries, { now: new Date("2024-06-15T00:00:00.000Z") });
      // The bloat score alone should push this into warning territory
      expect(warningReport.bloatScore).toBeGreaterThanOrEqual(50);

      // Create a scenario that produces critical level (score 75-100)
      const criticalEntries: DevMemoryEntry[] = [];
      for (let i = 0; i < 300; i++) {
        criticalEntries.push(makeEntry({
          id: `cr-${i}`,
          createdAt: "2020-01-01T00:00:00.000Z",
          conflictKey: `group-${i % 5}`,
          tags: ["shared-tag-1", "shared-tag-2", "shared-tag-3"],
          relatedSymbols: ["sharedSymbol"],
          summary: i % 2 === 0 ? "Always use semicolons" : "Never use semicolons",
          futurePromptHint: i % 2 === 0 ? "Use strict formatting" : "Avoid strict formatting",
          autoCaptured: true,
        }));
      }
      const criticalReport = calculateMemoryHealth(criticalEntries, {
        now: new Date("2024-06-15T00:00:00.000Z"),
        storeSizeKb: 1200,
      });
      expect(criticalReport.level).toBe("critical");
      expect(criticalReport.overallScore).toBeGreaterThanOrEqual(75);
    });

    it("should have recommendations when findings exist", () => {
      // Create entries that trigger findings
      const entries: DevMemoryEntry[] = [];
      for (let i = 0; i < 160; i++) {
        entries.push(makeEntry({ id: `r-${i}` }));
      }
      entries.push(makeEntry({ id: "deleted-r", deleted: true }));
      const report = calculateMemoryHealth(entries, { now: new Date("2024-06-15T00:00:00.000Z") });
      // Should have at least bloat finding and compact recommendation
      expect(report.findings.length).toBeGreaterThan(0);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe("findDuplicateClusters", () => {
    it("should return correct clusters with reason strings", () => {
      const entries = [
        makeEntry({
          id: "a",
          kind: "test_fix",
          tags: ["vitest", "mock", "testing"],
          relatedSymbols: ["vi.mock", "describe"],
        }),
        makeEntry({
          id: "b",
          kind: "test_fix",
          tags: ["vitest", "mock", "unit"],
          relatedSymbols: ["vi.mock", "it"],
        }),
        makeEntry({
          id: "c",
          kind: "lint_fix",
          tags: ["eslint", "unused"],
          relatedSymbols: ["noUnusedVars"],
        }),
      ];

      const clusters = findDuplicateClusters(entries);
      expect(clusters.length).toBe(1);
      expect(clusters[0].entryIds).toContain("a");
      expect(clusters[0].entryIds).toContain("b");
      expect(clusters[0].reason).toContain("test_fix");
    });

    it("should return empty array when no duplicates exist", () => {
      const entries = [
        makeEntry({
          id: "x",
          kind: "test_fix",
          tags: ["vitest"],
          relatedSymbols: ["vi.mock"],
        }),
        makeEntry({
          id: "y",
          kind: "lint_fix",
          tags: ["eslint"],
          relatedSymbols: ["noUnusedVars"],
        }),
        makeEntry({
          id: "z",
          kind: "build_fix",
          tags: ["webpack"],
          relatedSymbols: ["bundler"],
        }),
      ];

      const clusters = findDuplicateClusters(entries);
      expect(clusters).toEqual([]);
    });
  });
});
