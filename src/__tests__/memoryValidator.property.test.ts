/**
 * Property-based tests for memoryValidator.
 * Property 1: Validation accepts valid entries and rejects invalid entries.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  validateDevMemoryEntry,
  VALID_KINDS,
  VALID_SEVERITIES,
  VALID_CONFIDENCES,
} from "../core/memoryValidator.js";
import type { DevMemoryEntry, DevMemoryKind, Severity, Confidence } from "../core/memoryValidator.js";

/** Arbitrary for valid DevMemoryEntry */
const validEntryArb: fc.Arbitrary<DevMemoryEntry> = fc.record({
  id: fc.uuid(),
  createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") }).map((d) => d.toISOString()),
  kind: fc.constantFrom(...VALID_KINDS) as fc.Arbitrary<DevMemoryKind>,
  summary: fc.string({ minLength: 1, maxLength: 200 }),
  trigger: fc.string({ minLength: 1, maxLength: 200 }),
  fix: fc.string({ minLength: 1, maxLength: 200 }),
  futurePromptHint: fc.string({ minLength: 1, maxLength: 200 }),
  relatedFiles: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
  relatedSymbols: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 5 }),
  severity: fc.constantFrom(...VALID_SEVERITIES) as fc.Arbitrary<Severity>,
  confidence: fc.constantFrom(...VALID_CONFIDENCES) as fc.Arbitrary<Confidence>,
  enabled: fc.boolean(),
});

describe("Feature: dev-memory, Property 1: Validation accepts valid entries and rejects invalid entries", () => {
  it("should accept any valid DevMemoryEntry", () => {
    fc.assert(
      fc.property(validEntryArb, (entry) => {
        const result = validateDevMemoryEntry(entry);
        expect(result.success).toBe(true);
        expect(result.errors).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it("should reject entries with empty required string fields", () => {
    const emptyFieldArb = fc.constantFrom("id", "createdAt", "summary", "trigger", "fix", "futurePromptHint");

    fc.assert(
      fc.property(validEntryArb, emptyFieldArb, (entry, field) => {
        const invalid = { ...entry, [field]: "" };
        const result = validateDevMemoryEntry(invalid);
        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it("should reject entries with invalid kind values", () => {
    const invalidKindArb = fc.string({ minLength: 1, maxLength: 20 }).filter(
      (s) => !VALID_KINDS.includes(s as DevMemoryKind),
    );

    fc.assert(
      fc.property(validEntryArb, invalidKindArb, (entry, invalidKind) => {
        const invalid = { ...entry, kind: invalidKind };
        const result = validateDevMemoryEntry(invalid);
        expect(result.success).toBe(false);
        expect(result.errors.some((e) => e.includes("kind"))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("should reject entries with non-boolean enabled", () => {
    const nonBooleanArb = fc.oneof(
      fc.string(),
      fc.integer(),
      fc.constant(null),
      fc.constant(undefined),
    );

    fc.assert(
      fc.property(validEntryArb, nonBooleanArb, (entry, nonBool) => {
        const invalid = { ...entry, enabled: nonBool };
        const result = validateDevMemoryEntry(invalid);
        expect(result.success).toBe(false);
        expect(result.errors.some((e) => e.includes("enabled"))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("should reject entries with non-array relatedFiles/relatedSymbols/tags", () => {
    const arrayFieldArb = fc.constantFrom("relatedFiles", "relatedSymbols", "tags");
    const nonArrayArb = fc.oneof(fc.string(), fc.integer(), fc.constant(null));

    fc.assert(
      fc.property(validEntryArb, arrayFieldArb, nonArrayArb, (entry, field, nonArray) => {
        const invalid = { ...entry, [field]: nonArray };
        const result = validateDevMemoryEntry(invalid);
        expect(result.success).toBe(false);
        expect(result.errors.some((e) => e.includes(field))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("should reject entries with invalid severity values", () => {
    const invalidSeverityArb = fc.string({ minLength: 1, maxLength: 20 }).filter(
      (s) => !VALID_SEVERITIES.includes(s as Severity),
    );

    fc.assert(
      fc.property(validEntryArb, invalidSeverityArb, (entry, invalidSeverity) => {
        const invalid = { ...entry, severity: invalidSeverity };
        const result = validateDevMemoryEntry(invalid);
        expect(result.success).toBe(false);
        expect(result.errors.some((e) => e.includes("severity"))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("should reject entries with invalid confidence values", () => {
    const invalidConfidenceArb = fc.string({ minLength: 1, maxLength: 20 }).filter(
      (s) => !VALID_CONFIDENCES.includes(s as Confidence),
    );

    fc.assert(
      fc.property(validEntryArb, invalidConfidenceArb, (entry, invalidConfidence) => {
        const invalid = { ...entry, confidence: invalidConfidence };
        const result = validateDevMemoryEntry(invalid);
        expect(result.success).toBe(false);
        expect(result.errors.some((e) => e.includes("confidence"))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("should reject null/undefined/non-object inputs", () => {
    const nonObjectArb = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.string(),
      fc.integer(),
      fc.boolean(),
    );

    fc.assert(
      fc.property(nonObjectArb, (input) => {
        const result = validateDevMemoryEntry(input);
        expect(result.success).toBe(false);
        expect(result.errors).toContain("input must be a non-null object");
      }),
      { numRuns: 50 },
    );
  });
});
