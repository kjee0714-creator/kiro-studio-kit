/**
 * Property-based tests for dev-memory-visibility.
 * Properties 1–6 from the design document.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  scoreEntry,
  scoreEntryDetailed,
  selectMemoryEntries,
} from "../core/memorySelector.js";
import { VALID_KINDS, VALID_SEVERITIES, VALID_CONFIDENCES } from "../core/memoryValidator.js";
import type { DevMemoryEntry, DevMemoryKind, Severity, Confidence, MemoryMode } from "../core/memoryValidator.js";

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

const modeNotOffArb = fc.constantFrom("auto", "full") as fc.Arbitrary<MemoryMode>;

describe("Feature: dev-memory-visibility, Property 1: Score Consistency", () => {
  /**
   * **Validates: Requirements 1.2, 1.10, 8.1**
   */
  it("scoreEntryDetailed(entry, taskText).score === scoreEntry(entry, taskText)", () => {
    fc.assert(
      fc.property(validEntryArb, taskTextArb, (entry, taskText) => {
        const detailed = scoreEntryDetailed(entry, taskText);
        const simple = scoreEntry(entry, taskText);
        expect(detailed.score).toBe(simple);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: dev-memory-visibility, Property 2: Reason Points Sum to Score", () => {
  /**
   * **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9**
   */
  it("sum of reasons[i].points equals returned score", () => {
    fc.assert(
      fc.property(validEntryArb, taskTextArb, (entry, taskText) => {
        const detailed = scoreEntryDetailed(entry, taskText);
        const pointsSum = detailed.reasons.reduce((sum, r) => sum + r.points, 0);
        expect(pointsSum).toBe(detailed.score);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: dev-memory-visibility, Property 3: Selected Details Consistency", () => {
  /**
   * **Validates: Requirements 2.1, 2.6**
   */
  it("selectedDetails[i].entry corresponds to selected[i]", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryArb, { minLength: 1, maxLength: 10 }),
        taskTextArb,
        fc.constantFrom("auto", "full", "off") as fc.Arbitrary<MemoryMode>,
        (entries, taskText, mode) => {
          const result = selectMemoryEntries(entries, taskText, mode);
          const details = result.selectedDetails ?? [];
          expect(details.length).toBe(result.selected.length);
          for (let i = 0; i < details.length; i++) {
            expect(details[i].entry).toBe(result.selected[i]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: dev-memory-visibility, Property 4: Total Selected Chars Sum Invariant", () => {
  /**
   * **Validates: Requirements 2.4, 8.2**
   */
  it("totalSelectedChars === sum of selectedDetails[i].estimatedChars", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryArb, { minLength: 0, maxLength: 10 }),
        taskTextArb,
        fc.constantFrom("auto", "full", "off") as fc.Arbitrary<MemoryMode>,
        (entries, taskText, mode) => {
          const result = selectMemoryEntries(entries, taskText, mode);
          const details = result.selectedDetails ?? [];
          const expectedChars = details.reduce((sum, d) => sum + d.estimatedChars, 0);
          expect(result.totalSelectedChars).toBe(expectedChars);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: dev-memory-visibility, Property 5: Score Ordering", () => {
  /**
   * **Validates: Requirements 2.5, 8.3**
   */
  it("selectedDetails[i].score >= selectedDetails[i+1].score", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryArb, { minLength: 2, maxLength: 10 }),
        taskTextArb,
        (entries, taskText) => {
          // Score ordering is guaranteed in auto mode (sorted by score descending)
          const result = selectMemoryEntries(entries, taskText, "auto");
          const details = result.selectedDetails ?? [];
          for (let i = 1; i < details.length; i++) {
            expect(details[i - 1].score).toBeGreaterThanOrEqual(details[i].score);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: dev-memory-visibility, Property 6: Filtering Count Invariant", () => {
  /**
   * **Validates: Requirements 2.2, 2.3**
   */
  it("for mode != 'off', consideredCount + excludedCount === entries.length", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryArb, { minLength: 0, maxLength: 10 }),
        taskTextArb,
        modeNotOffArb,
        (entries, taskText, mode) => {
          const result = selectMemoryEntries(entries, taskText, mode);
          const considered = result.consideredCount ?? 0;
          const excluded = result.excludedCount ?? 0;
          expect(considered + excluded).toBe(entries.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
