/**
 * memoryDecay.property.test.ts
 * Property-based tests for memory decay / expiry (Phase 4-N).
 * Uses fast-check with 100 runs per property.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { mkdir, rm } from "fs/promises";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import { applyMemoryInjectionPolicy } from "../core/memoryInjectionPolicy.js";
import { isExpiredMemory, markMemoryReviewed, disableExpiredMemories } from "../core/memoryDecay.js";
import { readMemoryEntries, rewriteMemoryEntries } from "../core/memoryStore.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const kindArb = fc.constantFrom(
  "test_fix", "type_fix", "lint_fix", "build_fix",
  "schema_fix", "behavior_change", "design_decision", "gotcha",
) as fc.Arbitrary<DevMemoryEntry["kind"]>;

const severityArb = fc.constantFrom("low", "medium", "high") as fc.Arbitrary<DevMemoryEntry["severity"]>;
const confidenceArb = fc.constantFrom("medium", "high") as fc.Arbitrary<DevMemoryEntry["confidence"]>;
const trustLevelArb = fc.constantFrom("probation", "trusted", "verified") as fc.Arbitrary<DevMemoryEntry["trustLevel"]>;

const entryArb: fc.Arbitrary<DevMemoryEntry> = fc.record({
  id: fc.uuid(),
  createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2025-01-01") }).map(d => d.toISOString()),
  kind: kindArb,
  summary: fc.string({ minLength: 1, maxLength: 50 }),
  trigger: fc.string({ minLength: 1, maxLength: 50 }),
  fix: fc.string({ minLength: 1, maxLength: 50 }),
  futurePromptHint: fc.string({ minLength: 1, maxLength: 50 }),
  relatedFiles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 2 }),
  relatedSymbols: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 2 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 2 }),
  severity: severityArb,
  confidence: confidenceArb,
  enabled: fc.constant(true),
  trustLevel: trustLevelArb,
  expiresAt: fc.option(
    fc.oneof(
      fc.constant("2020-01-01T00:00:00.000Z"), // expired
      fc.constant("2099-01-01T00:00:00.000Z"), // not expired
    ),
    { nil: undefined },
  ),
});

const entriesArb = fc.array(entryArb, { minLength: 0, maxLength: 10 });

// ---------------------------------------------------------------------------
// Pure Function Properties
// ---------------------------------------------------------------------------

describe("memoryDecay property tests", () => {
  /**
   * Property 1: expired entries are never selected by injection policy
   */
  it("Property 1: expired entries never selected", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const result = applyMemoryInjectionPolicy(entries, {
          maxTotalEntries: 20,
          maxProbationEntries: 20,
          suppressHighRejection: false,
        });
        for (const entry of result.selectedEntries) {
          expect(isExpiredMemory(entry)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2: stale entries are NOT excluded solely for being stale
   * (entries with old createdAt but no expiresAt should still be selectable)
   */
  it("Property 2: stale entries not excluded solely for staleness", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            createdAt: fc.constant("2020-01-01T00:00:00.000Z"), // very old = stale
            kind: kindArb,
            summary: fc.string({ minLength: 1, maxLength: 50 }),
            trigger: fc.string({ minLength: 1, maxLength: 50 }),
            fix: fc.string({ minLength: 1, maxLength: 50 }),
            futurePromptHint: fc.string({ minLength: 1, maxLength: 50 }),
            relatedFiles: fc.constant([] as string[]),
            relatedSymbols: fc.constant([] as string[]),
            tags: fc.constant([] as string[]),
            severity: severityArb,
            confidence: confidenceArb,
            enabled: fc.constant(true),
            trustLevel: fc.constant("trusted" as const),
            // No expiresAt — so not expired, just stale
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (entries) => {
          const result = applyMemoryInjectionPolicy(entries as DevMemoryEntry[], {
            maxTotalEntries: 20,
            maxProbationEntries: 20,
            suppressHighRejection: false,
          });
          // Stale entries should still be included (not excluded by expiry)
          expect(result.selectedEntries.length).toBe(entries.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Persistence Properties
// ---------------------------------------------------------------------------

const PERSIST_TEST_DIR = ".test-tmp/memoryDecay-property-" + process.pid + "-" + Date.now();
let persistTestCounter = 0;

function getStorePath(): string {
  persistTestCounter++;
  return `${PERSIST_TEST_DIR}/store-${persistTestCounter}.jsonl`;
}

const cleanEntryArb: fc.Arbitrary<DevMemoryEntry> = fc.record({
  id: fc.uuid(),
  createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2025-01-01") }).map(d => d.toISOString()),
  kind: kindArb,
  summary: fc.string({ minLength: 1, maxLength: 50 }),
  trigger: fc.string({ minLength: 1, maxLength: 50 }),
  fix: fc.string({ minLength: 1, maxLength: 50 }),
  futurePromptHint: fc.string({ minLength: 1, maxLength: 50 }),
  relatedFiles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 2 }),
  relatedSymbols: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 2 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 2 }),
  severity: severityArb,
  confidence: confidenceArb,
  enabled: fc.constant(true),
  trustLevel: trustLevelArb,
});

describe("memoryDecay persistence property tests", () => {
  beforeEach(async () => {
    await mkdir(PERSIST_TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    try { await rm(PERSIST_TEST_DIR, { recursive: true, force: true, maxRetries: 3 }); } catch { /* ignore */ }
  });

  /**
   * Property 3: markMemoryReviewed updates exactly requested IDs
   */
  it("Property 3: markMemoryReviewed updates exactly requested IDs", { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(cleanEntryArb, { minLength: 2, maxLength: 6 }),
        async (entries) => {
          const storePath = getStorePath();
          await rewriteMemoryEntries(entries, storePath);

          const targetId = entries[0].id;
          await markMemoryReviewed([targetId], { storePath });

          const afterEntries = await readMemoryEntries(storePath);
          const target = afterEntries.find(e => e.id === targetId);
          expect(target?.lastReviewedAt).toBeDefined();

          // Others unchanged
          for (const entry of afterEntries) {
            if (entry.id !== targetId) {
              const before = entries.find(e => e.id === entry.id);
              expect(entry.lastReviewedAt).toBe(before?.lastReviewedAt);
            }
          }
          expect(afterEntries.length).toBe(entries.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4: disableExpiredMemories dry-run does not modify store
   */
  it("Property 4: disableExpiredMemories dry-run does not modify store", { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(cleanEntryArb, { minLength: 1, maxLength: 5 }).map(entries => {
          // Make first entry expired
          entries[0].expiresAt = "2020-01-01T00:00:00.000Z";
          return entries;
        }),
        async (entries) => {
          const storePath = getStorePath();
          await rewriteMemoryEntries(entries, storePath);

          await disableExpiredMemories({ storePath, dryRun: true });

          const afterEntries = await readMemoryEntries(storePath);
          // All entries should be unchanged
          for (const entry of afterEntries) {
            const before = entries.find(e => e.id === entry.id);
            expect(entry.enabled).toBe(before?.enabled);
            expect(entry.disabledReason).toBe(before?.disabledReason);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 5: disableExpiredMemories never physically deletes entries
   */
  it("Property 5: disableExpiredMemories never physically deletes", { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(cleanEntryArb, { minLength: 1, maxLength: 5 }).map(entries => {
          entries[0].expiresAt = "2020-01-01T00:00:00.000Z";
          return entries;
        }),
        async (entries) => {
          const storePath = getStorePath();
          await rewriteMemoryEntries(entries, storePath);

          await disableExpiredMemories({ storePath });

          const afterEntries = await readMemoryEntries(storePath);
          expect(afterEntries.length).toBe(entries.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
