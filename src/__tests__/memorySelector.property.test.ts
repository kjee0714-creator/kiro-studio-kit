/**
 * Property-based tests for memorySelector.
 * Properties 3, 4, 5, 6, 7.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  selectMemoryEntries,
  scoreEntry,
  estimateEntryChars,
} from "../core/memorySelector.js";
import { VALID_KINDS, VALID_SEVERITIES, VALID_CONFIDENCES } from "../core/memoryValidator.js";
import type { DevMemoryEntry, DevMemoryKind, Severity, Confidence } from "../core/memoryValidator.js";

/** Arbitrary for valid DevMemoryEntry */
const validEntryArb: fc.Arbitrary<DevMemoryEntry> = fc.record({
  id: fc.uuid(),
  createdAt: fc.date({ min: new Date("2023-01-01"), max: new Date("2025-12-31") }).map((d) => d.toISOString()),
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

const taskTextArb = fc.string({ minLength: 0, maxLength: 200 });

describe("Feature: dev-memory, Property 3: Exclusion filter correctness", () => {
  it("should never include disabled entries", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryArb, { minLength: 1, maxLength: 10 }),
        taskTextArb,
        (entries, taskText) => {
          const result = selectMemoryEntries(entries, taskText, "auto");
          for (const selected of result.selected) {
            expect(selected.enabled).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should never include low-confidence entries", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryArb, { minLength: 1, maxLength: 10 }),
        taskTextArb,
        (entries, taskText) => {
          const result = selectMemoryEntries(entries, taskText, "auto");
          for (const selected of result.selected) {
            expect(selected.confidence).not.toBe("low");
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should never include expired entries", () => {
    const expiredEntryArb = validEntryArb.map((e) => ({
      ...e,
      enabled: true,
      confidence: "high" as Confidence,
      expiresAt: "2020-01-01T00:00:00.000Z", // definitely expired
    }));

    fc.assert(
      fc.property(
        fc.array(expiredEntryArb, { minLength: 1, maxLength: 5 }),
        taskTextArb,
        (entries, taskText) => {
          const result = selectMemoryEntries(entries, taskText, "auto");
          expect(result.selected).toHaveLength(0);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("should never include superseded entries", () => {
    fc.assert(
      fc.property(validEntryArb, validEntryArb, taskTextArb, (entry1, entry2, taskText) => {
        // entry2 supersedes entry1
        const superseding = { ...entry2, enabled: true, confidence: "high" as Confidence, supersedes: [entry1.id] };
        const superseded = { ...entry1, enabled: true, confidence: "high" as Confidence };
        const entries = [superseded, superseding];
        const result = selectMemoryEntries(entries, taskText, "full");
        const selectedIds = result.selected.map((e) => e.id);
        expect(selectedIds).not.toContain(superseded.id);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: dev-memory, Property 4: Scoring additivity", () => {
  it("should return non-negative scores", () => {
    fc.assert(
      fc.property(validEntryArb, taskTextArb, (entry, taskText) => {
        const score = scoreEntry(entry, taskText);
        expect(score).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 },
    );
  });

  it("should add +5 for each relatedFiles match in task text", () => {
    fc.assert(
      fc.property(validEntryArb, (entry) => {
        if (entry.relatedFiles.length === 0) return;
        // Create task text containing all relatedFiles
        const taskText = entry.relatedFiles.join(" ");
        const score = scoreEntry(entry, taskText);
        // Score should include at least 5 * relatedFiles.length
        expect(score).toBeGreaterThanOrEqual(5 * entry.relatedFiles.length);
      }),
      { numRuns: 100 },
    );
  });

  it("should add +4 for each relatedSymbols match in task text", () => {
    fc.assert(
      fc.property(validEntryArb, (entry) => {
        if (entry.relatedSymbols.length === 0) return;
        const taskText = entry.relatedSymbols.join(" ");
        const score = scoreEntry(entry, taskText);
        expect(score).toBeGreaterThanOrEqual(4 * entry.relatedSymbols.length);
      }),
      { numRuns: 100 },
    );
  });

  it("should add +3 for each tags match in task text", () => {
    fc.assert(
      fc.property(validEntryArb, (entry) => {
        if (entry.tags.length === 0) return;
        const taskText = entry.tags.join(" ");
        const score = scoreEntry(entry, taskText);
        expect(score).toBeGreaterThanOrEqual(3 * entry.tags.length);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: dev-memory, Property 5: Auto mode respects constraints", () => {
  it("should return at most 5 entries", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryArb, { minLength: 1, maxLength: 20 }),
        taskTextArb,
        (entries, taskText) => {
          const result = selectMemoryEntries(entries, taskText, "auto");
          expect(result.selected.length).toBeLessThanOrEqual(5);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should only include entries with score > 0", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryArb, { minLength: 1, maxLength: 10 }),
        taskTextArb,
        (entries, taskText) => {
          const result = selectMemoryEntries(entries, taskText, "auto");
          for (const selected of result.selected) {
            const score = scoreEntry(selected, taskText);
            expect(score).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should respect 2000 char limit", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryArb, { minLength: 1, maxLength: 10 }),
        taskTextArb,
        (entries, taskText) => {
          const result = selectMemoryEntries(entries, taskText, "auto");
          const totalChars = result.selected.reduce(
            (sum, e) => sum + estimateEntryChars(e),
            0,
          );
          expect(totalChars).toBeLessThanOrEqual(2000);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should be sorted by score descending", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryArb, { minLength: 2, maxLength: 10 }),
        taskTextArb,
        (entries, taskText) => {
          const result = selectMemoryEntries(entries, taskText, "auto");
          for (let i = 1; i < result.selected.length; i++) {
            const prevScore = scoreEntry(result.selected[i - 1], taskText);
            const currScore = scoreEntry(result.selected[i], taskText);
            expect(prevScore).toBeGreaterThanOrEqual(currScore);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: dev-memory, Property 6: Full mode respects constraints", () => {
  it("should only include enabled entries with confidence != low", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryArb, { minLength: 1, maxLength: 10 }),
        taskTextArb,
        (entries, taskText) => {
          const result = selectMemoryEntries(entries, taskText, "full");
          for (const selected of result.selected) {
            expect(selected.enabled).toBe(true);
            expect(selected.confidence).not.toBe("low");
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should respect 10000 char limit", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryArb, { minLength: 1, maxLength: 20 }),
        taskTextArb,
        (entries, taskText) => {
          const result = selectMemoryEntries(entries, taskText, "full");
          const totalChars = result.selected.reduce(
            (sum, e) => sum + estimateEntryChars(e),
            0,
          );
          expect(totalChars).toBeLessThanOrEqual(10000);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: dev-memory, Property 7: Off mode returns empty selection", () => {
  it("should always return empty selection", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryArb, { minLength: 0, maxLength: 10 }),
        taskTextArb,
        (entries, taskText) => {
          const result = selectMemoryEntries(entries, taskText, "off");
          expect(result.selected).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should report totalAvailable as the input entries count", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryArb, { minLength: 0, maxLength: 10 }),
        taskTextArb,
        (entries, taskText) => {
          const result = selectMemoryEntries(entries, taskText, "off");
          expect(result.totalAvailable).toBe(entries.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
