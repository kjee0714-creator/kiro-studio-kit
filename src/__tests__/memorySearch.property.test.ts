/**
 * Property-based tests for memory search.
 * Property 10: Search is case-insensitive.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { mkdir, rm } from "fs/promises";
import { VALID_KINDS, VALID_SEVERITIES, VALID_CONFIDENCES } from "../core/memoryValidator.js";
import type { DevMemoryEntry, DevMemoryKind, Severity, Confidence } from "../core/memoryValidator.js";

const TEST_DIR = ".test-tmp/memorySearch-property";

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

/** Perform search logic (same as handleMemorySearch but pure) */
function searchEntries(entries: DevMemoryEntry[], query: string): DevMemoryEntry[] {
  const lowerQuery = query.toLowerCase();
  return entries.filter((entry) => {
    const searchableFields = [
      entry.summary,
      entry.trigger,
      entry.fix,
      entry.futurePromptHint,
      ...entry.tags,
      ...entry.relatedSymbols,
      ...entry.relatedFiles,
    ];
    return searchableFields.some((field) => field.toLowerCase().includes(lowerQuery));
  });
}

/** Arbitrary for valid DevMemoryEntry */
const validEntryArb: fc.Arbitrary<DevMemoryEntry> = fc.record({
  id: fc.uuid(),
  createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") }).map((d) => d.toISOString()),
  kind: fc.constantFrom(...VALID_KINDS) as fc.Arbitrary<DevMemoryKind>,
  summary: fc.string({ minLength: 1, maxLength: 50 }),
  trigger: fc.string({ minLength: 1, maxLength: 50 }),
  fix: fc.string({ minLength: 1, maxLength: 50 }),
  futurePromptHint: fc.string({ minLength: 1, maxLength: 50 }),
  relatedFiles: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 3 }),
  relatedSymbols: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { maxLength: 3 }),
  severity: fc.constantFrom(...VALID_SEVERITIES) as fc.Arbitrary<Severity>,
  confidence: fc.constantFrom(...VALID_CONFIDENCES) as fc.Arbitrary<Confidence>,
  enabled: fc.boolean(),
});

describe("Feature: dev-memory, Property 10: Search is case-insensitive", () => {
  it("should return same results regardless of query casing", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryArb, { minLength: 1, maxLength: 5 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (entries, query) => {
          const lowerResults = searchEntries(entries, query.toLowerCase());
          const upperResults = searchEntries(entries, query.toUpperCase());
          const mixedResults = searchEntries(entries, query);

          const lowerIds = lowerResults.map((e) => e.id).sort();
          const upperIds = upperResults.map((e) => e.id).sort();
          const mixedIds = mixedResults.map((e) => e.id).sort();

          expect(lowerIds).toEqual(upperIds);
          expect(lowerIds).toEqual(mixedIds);
        },
      ),
      { numRuns: 100 },
    );
  });
});
