/**
 * Property-based tests for memoryStore.
 * Property 2: JSONL serialization round-trip.
 */
import { describe, it, expect, afterEach } from "vitest";
import fc from "fast-check";
import { rm, mkdir } from "fs/promises";
import path from "path";
import { appendMemoryEntry, readMemoryEntries } from "../core/memoryStore.js";
import { VALID_KINDS, VALID_SEVERITIES, VALID_CONFIDENCES } from "../core/memoryValidator.js";
import type { DevMemoryEntry, DevMemoryKind, Severity, Confidence } from "../core/memoryValidator.js";

const TEST_DIR = ".test-tmp/memoryStore-property";
let testCounter = 0;

function getTestPath(): string {
  testCounter++;
  return path.join(TEST_DIR, `test-${testCounter}-${Date.now()}.jsonl`);
}

afterEach(async () => {
  try {
    await rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

/** Arbitrary for valid DevMemoryEntry */
const validEntryArb: fc.Arbitrary<DevMemoryEntry> = fc.record({
  id: fc.uuid(),
  createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") }).map((d) => d.toISOString()),
  kind: fc.constantFrom(...VALID_KINDS) as fc.Arbitrary<DevMemoryKind>,
  summary: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => !(/sk-|BEGIN PRIVATE KEY|password=|api_key|secret/i.test(s))),
  trigger: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => !(/sk-|BEGIN PRIVATE KEY|password=|api_key|secret/i.test(s))),
  fix: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => !(/sk-|BEGIN PRIVATE KEY|password=|api_key|secret/i.test(s))),
  futurePromptHint: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => !(/sk-|BEGIN PRIVATE KEY|password=|api_key|secret/i.test(s))),
  relatedFiles: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 3 }),
  relatedSymbols: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 3 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 3 }),
  severity: fc.constantFrom(...VALID_SEVERITIES) as fc.Arbitrary<Severity>,
  confidence: fc.constantFrom(...VALID_CONFIDENCES) as fc.Arbitrary<Confidence>,
  enabled: fc.boolean(),
});

describe("Feature: dev-memory, Property 2: JSONL serialization round-trip", () => {
  it("should round-trip a single entry through write and read", async () => {
    await mkdir(TEST_DIR, { recursive: true });

    await fc.assert(
      fc.asyncProperty(validEntryArb, async (entry) => {
        const storePath = getTestPath();
        await appendMemoryEntry(entry, storePath);
        const entries = await readMemoryEntries(storePath);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toEqual(entry);
      }),
      { numRuns: 50 },
    );
  });

  it("should round-trip multiple entries through sequential writes and read", async () => {
    await mkdir(TEST_DIR, { recursive: true });

    await fc.assert(
      fc.asyncProperty(
        fc.array(validEntryArb, { minLength: 1, maxLength: 5 }),
        async (entries) => {
          const storePath = getTestPath();
          for (const entry of entries) {
            await appendMemoryEntry(entry, storePath);
          }
          const readBack = await readMemoryEntries(storePath);
          expect(readBack).toHaveLength(entries.length);
          for (let i = 0; i < entries.length; i++) {
            expect(readBack[i]).toEqual(entries[i]);
          }
        },
      ),
      { numRuns: 20 },
    );
  });
});
