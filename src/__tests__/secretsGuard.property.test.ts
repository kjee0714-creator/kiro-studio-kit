/**
 * Property-based tests for secretsGuard.
 * Property 11: Secrets guard detects known patterns.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { checkForSecrets, SECRET_PATTERNS } from "../core/secretsGuard.js";
import type { DevMemoryEntry, DevMemoryKind, Severity, Confidence } from "../core/memoryValidator.js";
import { VALID_KINDS, VALID_SEVERITIES, VALID_CONFIDENCES } from "../core/memoryValidator.js";

/** Base valid entry for injection */
const baseEntryArb: fc.Arbitrary<DevMemoryEntry> = fc.record({
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

/** Secret pattern strings to inject */
const secretStrings = ["sk-live-abc123", "BEGIN PRIVATE KEY", "password=hunter2", "my_api_key_here", "client_secret"];

describe("Feature: dev-memory, Property 11: Secrets guard detects known patterns", () => {
  it("should detect secrets injected into summary field", () => {
    const secretArb = fc.constantFrom(...secretStrings);

    fc.assert(
      fc.property(baseEntryArb, secretArb, (entry, secret) => {
        const withSecret = { ...entry, summary: `prefix ${secret} suffix` };
        const warnings = checkForSecrets(withSecret);
        expect(warnings.length).toBeGreaterThan(0);
        expect(warnings.some((w) => w.includes("summary"))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("should detect secrets injected into trigger field", () => {
    const secretArb = fc.constantFrom(...secretStrings);

    fc.assert(
      fc.property(baseEntryArb, secretArb, (entry, secret) => {
        const withSecret = { ...entry, trigger: `before ${secret} after` };
        const warnings = checkForSecrets(withSecret);
        expect(warnings.length).toBeGreaterThan(0);
        expect(warnings.some((w) => w.includes("trigger"))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("should detect secrets injected into fix field", () => {
    const secretArb = fc.constantFrom(...secretStrings);

    fc.assert(
      fc.property(baseEntryArb, secretArb, (entry, secret) => {
        const withSecret = { ...entry, fix: `${secret} was the issue` };
        const warnings = checkForSecrets(withSecret);
        expect(warnings.length).toBeGreaterThan(0);
        expect(warnings.some((w) => w.includes("fix"))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("should detect secrets injected into futurePromptHint field", () => {
    const secretArb = fc.constantFrom(...secretStrings);

    fc.assert(
      fc.property(baseEntryArb, secretArb, (entry, secret) => {
        const withSecret = { ...entry, futurePromptHint: `hint: ${secret}` };
        const warnings = checkForSecrets(withSecret);
        expect(warnings.length).toBeGreaterThan(0);
        expect(warnings.some((w) => w.includes("futurePromptHint"))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("should return empty warnings for entries without secret patterns", () => {
    // Generate entries that definitely don't contain secret patterns
    const safeStringArb = fc.stringMatching(/^[a-z ]+$/).filter(
      (s) => s.length > 0 && !SECRET_PATTERNS.some((p) => p.test(s)),
    );

    const safeEntryArb = fc.record({
      id: fc.uuid(),
      createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") }).map((d) => d.toISOString()),
      kind: fc.constantFrom(...VALID_KINDS) as fc.Arbitrary<DevMemoryKind>,
      summary: safeStringArb,
      trigger: safeStringArb,
      fix: safeStringArb,
      futurePromptHint: safeStringArb,
      relatedFiles: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 3 }),
      relatedSymbols: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 3 }),
      tags: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 3 }),
      severity: fc.constantFrom(...VALID_SEVERITIES) as fc.Arbitrary<Severity>,
      confidence: fc.constantFrom(...VALID_CONFIDENCES) as fc.Arbitrary<Confidence>,
      enabled: fc.boolean(),
    });

    fc.assert(
      fc.property(safeEntryArb, (entry) => {
        const warnings = checkForSecrets(entry);
        expect(warnings).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});
