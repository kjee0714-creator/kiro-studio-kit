/**
 * memoryDuplicate.property.test.ts
 * Property-based tests for memory duplicate management (Phase 4-L).
 * Uses fast-check with 100 runs per property.
 * Includes persistence PBTs per SPEC requirements.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { mkdir, rm } from "fs/promises";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import { applyMemoryInjectionPolicy } from "../core/memoryInjectionPolicy.js";
import { markMemoryDuplicate, clearMemoryDuplicate } from "../core/memoryDuplicate.js";
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
  duplicateOf: fc.option(fc.uuid(), { nil: undefined }),
  mergedInto: fc.option(fc.uuid(), { nil: undefined }),
});

const entriesArb = fc.array(entryArb, { minLength: 0, maxLength: 12 });

// ---------------------------------------------------------------------------
// Pure Function Properties
// ---------------------------------------------------------------------------

describe("memoryDuplicate property tests", () => {
  /**
   * Property 1: duplicateOf entries are never in injection policy output
   */
  it("Property 1: duplicateOf entries are never in policy output", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const result = applyMemoryInjectionPolicy(entries, {
          maxTotalEntries: 20,
          maxProbationEntries: 20,
          suppressHighRejection: false,
        });
        for (const entry of result.selectedEntries) {
          expect(entry.duplicateOf === undefined || entry.duplicateOf === "").toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2: mergedInto entries are never in injection policy output
   */
  it("Property 2: mergedInto entries are never in policy output", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const result = applyMemoryInjectionPolicy(entries, {
          maxTotalEntries: 20,
          maxProbationEntries: 20,
          suppressHighRejection: false,
        });
        for (const entry of result.selectedEntries) {
          expect(entry.mergedInto === undefined || entry.mergedInto === "").toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Persistence Properties
// ---------------------------------------------------------------------------

const PERSIST_TEST_DIR = ".test-tmp/memoryDuplicate-property-" + process.pid + "-" + Date.now();
let persistTestCounter = 0;

function getStorePath(): string {
  persistTestCounter++;
  return `${PERSIST_TEST_DIR}/store-${persistTestCounter}.jsonl`;
}

/** Entry without duplicate/merged fields for persistence tests */
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

describe("memoryDuplicate persistence property tests", () => {
  beforeEach(async () => {
    await mkdir(PERSIST_TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    try { await rm(PERSIST_TEST_DIR, { recursive: true, force: true, maxRetries: 3 }); } catch { /* ignore */ }
  });

  /**
   * Property 3: markMemoryDuplicate preserves entry count
   */
  it("Property 3: markMemoryDuplicate preserves entry count", { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(cleanEntryArb, { minLength: 2, maxLength: 8 }),
        async (entries) => {
          const storePath = getStorePath();
          await rewriteMemoryEntries(entries, storePath);

          const canonicalId = entries[0].id;
          const duplicateId = entries[1].id;

          await markMemoryDuplicate(canonicalId, duplicateId, { storePath });

          const afterEntries = await readMemoryEntries(storePath);
          expect(afterEntries.length).toBe(entries.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4: markMemoryDuplicate updates only canonical and duplicate entries
   */
  it("Property 4: markMemoryDuplicate updates only canonical and duplicate entries", { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(cleanEntryArb, { minLength: 3, maxLength: 8 }),
        async (entries) => {
          const storePath = getStorePath();
          await rewriteMemoryEntries(entries, storePath);

          const canonicalId = entries[0].id;
          const duplicateId = entries[1].id;
          const otherIds = entries.slice(2).map(e => e.id);

          await markMemoryDuplicate(canonicalId, duplicateId, { storePath });

          const afterEntries = await readMemoryEntries(storePath);

          // Duplicate entry updated
          const dupEntry = afterEntries.find(e => e.id === duplicateId);
          expect(dupEntry?.duplicateOf).toBe(canonicalId);
          expect(dupEntry?.enabled).toBe(false);
          expect(dupEntry?.disabledReason).toBe("duplicate");

          // Canonical entry updated
          const canEntry = afterEntries.find(e => e.id === canonicalId);
          expect(canEntry?.duplicates).toContain(duplicateId);

          // Other entries unchanged
          for (const id of otherIds) {
            const afterEntry = afterEntries.find(e => e.id === id);
            const beforeEntry = entries.find(e => e.id === id);
            expect(afterEntry?.duplicateOf).toBe(beforeEntry?.duplicateOf);
            expect(afterEntry?.enabled).toBe(beforeEntry?.enabled);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 5: clearMemoryDuplicate removes relation without physically deleting
   */
  it("Property 5: clearMemoryDuplicate removes relation without deleting", { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(cleanEntryArb, { minLength: 2, maxLength: 8 }),
        async (entries) => {
          const storePath = getStorePath();
          await rewriteMemoryEntries(entries, storePath);

          const canonicalId = entries[0].id;
          const duplicateId = entries[1].id;

          // First mark as duplicate
          await markMemoryDuplicate(canonicalId, duplicateId, { storePath });

          // Then clear
          await clearMemoryDuplicate(duplicateId, { storePath });

          const afterEntries = await readMemoryEntries(storePath);

          // Entry count preserved
          expect(afterEntries.length).toBe(entries.length);

          // Duplicate relation removed
          const dupEntry = afterEntries.find(e => e.id === duplicateId);
          expect(dupEntry?.duplicateOf).toBeUndefined();

          // Canonical's duplicates array no longer contains duplicateId
          const canEntry = afterEntries.find(e => e.id === canonicalId);
          expect(canEntry?.duplicates ?? []).not.toContain(duplicateId);
        },
      ),
      { numRuns: 100 },
    );
  });
});
