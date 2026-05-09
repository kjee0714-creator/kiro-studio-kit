/**
 * Property-based tests for memoryInjector.
 * Properties 8, 9.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { formatMemorySection } from "../core/memoryInjector.js";
import { VALID_KINDS, VALID_SEVERITIES, VALID_CONFIDENCES } from "../core/memoryValidator.js";
import type { DevMemoryEntry, DevMemoryKind, Severity, Confidence } from "../core/memoryValidator.js";

/** Arbitrary for valid DevMemoryEntry */
const validEntryArb: fc.Arbitrary<DevMemoryEntry> = fc.record({
  id: fc.uuid(),
  createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") }).map((d) => d.toISOString()),
  kind: fc.constantFrom(...VALID_KINDS) as fc.Arbitrary<DevMemoryKind>,
  summary: fc.string({ minLength: 1, maxLength: 100 }),
  trigger: fc.string({ minLength: 1, maxLength: 100 }),
  fix: fc.string({ minLength: 1, maxLength: 100 }),
  futurePromptHint: fc.string({ minLength: 1, maxLength: 100 }),
  relatedFiles: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 3 }),
  relatedSymbols: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 3 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 3 }),
  severity: fc.constantFrom(...VALID_SEVERITIES) as fc.Arbitrary<Severity>,
  confidence: fc.constantFrom(...VALID_CONFIDENCES) as fc.Arbitrary<Confidence>,
  enabled: fc.boolean(),
});

describe("Feature: dev-memory, Property 8: Memory section presence is determined by selection count", () => {
  it("should return non-empty string with header when entries are non-empty", () => {
    fc.assert(
      fc.property(
        fc.array(validEntryArb, { minLength: 1, maxLength: 5 }),
        (entries) => {
          const section = formatMemorySection(entries);
          expect(section.length).toBeGreaterThan(0);
          expect(section).toContain("## Development Memory / 再発防止メモ");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should return empty string when entries array is empty", () => {
    const section = formatMemorySection([]);
    expect(section).toBe("");
  });
});

describe("Feature: dev-memory, Property 9: Formatted entry contains all required fields", () => {
  it("should contain summary, kind, trigger, fix, and futurePromptHint", () => {
    fc.assert(
      fc.property(validEntryArb, (entry) => {
        const section = formatMemorySection([entry]);
        expect(section).toContain(entry.summary);
        expect(section).toContain(entry.kind);
        expect(section).toContain(entry.trigger);
        expect(section).toContain(entry.fix);
        expect(section).toContain(entry.futurePromptHint);
      }),
      { numRuns: 100 },
    );
  });
});
