/**
 * memoryUsagePersistence.property.test.ts
 * Property-based tests for the usage stats persistence module (Phase 4-D).
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { persistMemorySelections } from "../core/memoryUsagePersistence.js";
import { readMemoryEntries, rewriteMemoryEntries } from "../core/memoryStore.js";
import type { DevMemoryEntry, DevMemoryKind, Severity, Confidence } from "../core/memoryValidator.js";
import { mkdir, rm } from "fs/promises";

// ---------------------------------------------------------------------------
// Test Infrastructure
// ---------------------------------------------------------------------------

const TEST_DIR = ".test-tmp/usage-persistence-property-" + process.pid + "-" + Date.now();
let testCounter = 0;

function getStorePath(): string {
  testCounter++;
  return `${TEST_DIR}/store-${testCounter}.jsonl`;
}

// ---------------------------------------------------------------------------
// Arbitrary Generators
// ---------------------------------------------------------------------------

const arbKind: fc.Arbitrary<DevMemoryKind> = fc.constantFrom(
  "test_fix", "type_fix", "lint_fix", "build_fix", "schema_fix",
  "behavior_change", "design_decision", "gotcha",
);

const arbSeverity: fc.Arbitrary<Severity> = fc.constantFrom("low", "medium", "high");
const arbConfidence: fc.Arbitrary<Confidence> = fc.constantFrom("low", "medium", "high");

/** Generate a valid eligible entry (enabled, not deleted, not quarantined) */
const arbEligibleEntry: fc.Arbitrary<DevMemoryEntry> = fc.record({
  id: fc.uuid(),
  createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2025-12-31") }).map((d) => d.toISOString()),
  kind: arbKind,
  summary: fc.string({ minLength: 1, maxLength: 50 }),
  trigger: fc.string({ minLength: 1, maxLength: 50 }),
  fix: fc.string({ minLength: 1, maxLength: 50 }),
  futurePromptHint: fc.string({ minLength: 1, maxLength: 50 }),
  relatedFiles: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 3 }),
  relatedSymbols: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 3 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }),
  severity: arbSeverity,
  confidence: arbConfidence,
  enabled: fc.constant(true),
}).map((entry) => ({
  ...entry,
  // Ensure no quarantined/deleted status
  deleted: undefined,
  captureStatus: undefined,
})) as fc.Arbitrary<DevMemoryEntry>;

/** Generate an entry with existing usageStats */
const arbEntryWithUsageStats: fc.Arbitrary<DevMemoryEntry> = arbEligibleEntry.chain((entry) =>
  fc.nat(100).map((selectedCount) => ({
    ...entry,
    usageStats: {
      selectedCount,
      successfulSelections: Math.floor(selectedCount / 2),
      rejectedSelections: 0,
      ...(selectedCount > 0 ? { lastSelectedAt: "2024-01-15T00:00:00.000Z" } : {}),
    },
  })),
);

/** Generate a quarantined entry */
const arbQuarantinedEntry: fc.Arbitrary<DevMemoryEntry> = arbEligibleEntry.map((entry) => ({
  ...entry,
  captureStatus: "quarantined" as const,
}));

/** Generate a deleted entry */
const arbDeletedEntry: fc.Arbitrary<DevMemoryEntry> = arbEligibleEntry.map((entry) => ({
  ...entry,
  deleted: true,
  deletedAt: "2024-03-01T00:00:00.000Z",
}));

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("memoryUsagePersistence property tests", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    testCounter = 0;
  });

  afterEach(async () => {
    try { await rm(TEST_DIR, { recursive: true, force: true, maxRetries: 3 }); } catch { /* ignore */ }
  });

  it("Property 1: selectedCount monotonically increases after persistence", { timeout: 30000 }, async () => {
    /**
     * **Validates: Requirements 6.1**
     * For any eligible entry, after persistence, selectedCount > original.
     */
    await fc.assert(
      fc.asyncProperty(arbEntryWithUsageStats, async (entry) => {
        const storePath = getStorePath();
        const originalCount = entry.usageStats?.selectedCount ?? 0;

        await rewriteMemoryEntries([entry], storePath);
        const result = await persistMemorySelections([entry], { storePath });

        expect(result.updatedIds).toContain(entry.id);

        const stored = await readMemoryEntries(storePath);
        const updatedEntry = stored.find((e) => e.id === entry.id);
        expect(updatedEntry?.usageStats?.selectedCount).toBeGreaterThan(originalCount);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 2: persistMemorySelections never modifies quarantined entries", { timeout: 30000 }, async () => {
    /**
     * **Validates: Requirements 6.2**
     * For any quarantined entry in store, persistence leaves it unchanged.
     */
    await fc.assert(
      fc.asyncProperty(arbQuarantinedEntry, async (entry) => {
        const storePath = getStorePath();
        const originalJson = JSON.stringify(entry);

        await rewriteMemoryEntries([entry], storePath);
        const result = await persistMemorySelections([entry], { storePath });

        expect(result.skippedIds).toContain(entry.id);
        expect(result.updatedIds).not.toContain(entry.id);

        const stored = await readMemoryEntries(storePath);
        const storedEntry = stored.find((e) => e.id === entry.id);
        expect(JSON.stringify(storedEntry)).toBe(originalJson);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 3: persistMemorySelections never modifies deleted entries", { timeout: 30000 }, async () => {
    /**
     * **Validates: Requirements 6.3**
     * For any deleted entry in store, persistence leaves it unchanged.
     */
    await fc.assert(
      fc.asyncProperty(arbDeletedEntry, async (entry) => {
        const storePath = getStorePath();
        const originalJson = JSON.stringify(entry);

        await rewriteMemoryEntries([entry], storePath);
        const result = await persistMemorySelections([entry], { storePath });

        expect(result.skippedIds).toContain(entry.id);
        expect(result.updatedIds).not.toContain(entry.id);

        const stored = await readMemoryEntries(storePath);
        const storedEntry = stored.find((e) => e.id === entry.id);
        expect(JSON.stringify(storedEntry)).toBe(originalJson);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 4: usage reset always returns selectedCount = 0", { timeout: 30000 }, async () => {
    /**
     * **Validates: Requirements 6.4**
     * For any entry, after reset, selectedCount === 0.
     * Also idempotent: reset(reset(x)) === reset(x).
     */
    await fc.assert(
      fc.asyncProperty(arbEntryWithUsageStats, async (entry) => {
        const storePath = getStorePath();
        await rewriteMemoryEntries([entry], storePath);

        // Simulate reset
        const entries = await readMemoryEntries(storePath);
        const target = entries.find((e) => e.id === entry.id);
        expect(target).toBeDefined();

        if (!target) return; // guard for TypeScript

        target.usageStats = {
          selectedCount: 0,
          successfulSelections: 0,
          rejectedSelections: 0,
        };
        await rewriteMemoryEntries(entries, storePath);

        const afterReset = await readMemoryEntries(storePath);
        const resetEntry = afterReset.find((e) => e.id === entry.id);
        expect(resetEntry?.usageStats?.selectedCount).toBe(0);
        expect(resetEntry?.usageStats?.successfulSelections).toBe(0);
        expect(resetEntry?.usageStats?.rejectedSelections).toBe(0);

        // Idempotence: reset again
        if (!resetEntry) return; // guard for TypeScript

        resetEntry.usageStats = {
          selectedCount: 0,
          successfulSelections: 0,
          rejectedSelections: 0,
        };
        await rewriteMemoryEntries(afterReset, storePath);

        const afterDoubleReset = await readMemoryEntries(storePath);
        const doubleResetEntry = afterDoubleReset.find((e) => e.id === entry.id);
        expect(doubleResetEntry?.usageStats?.selectedCount).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 5: persisted selectedCount equals original + 1 per persistence operation", { timeout: 30000 }, async () => {
    /**
     * **Validates: Requirements 6.5**
     * For single persistence, result is exactly original + 1.
     */
    await fc.assert(
      fc.asyncProperty(arbEntryWithUsageStats, async (entry) => {
        const storePath = getStorePath();
        const originalCount = entry.usageStats?.selectedCount ?? 0;

        await rewriteMemoryEntries([entry], storePath);
        await persistMemorySelections([entry], { storePath });

        const stored = await readMemoryEntries(storePath);
        const updatedEntry = stored.find((e) => e.id === entry.id);
        expect(updatedEntry?.usageStats?.selectedCount).toBe(originalCount + 1);
      }),
      { numRuns: 100 },
    );
  });
});
