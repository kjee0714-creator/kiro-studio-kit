/**
 * Unit tests for secretsGuard.
 * Tests specific pattern detection and advisory behavior.
 */
import { describe, it, expect } from "vitest";
import { checkForSecrets, SECRET_PATTERNS } from "../core/secretsGuard.js";
import type { DevMemoryEntry } from "../core/memoryValidator.js";

const cleanEntry: DevMemoryEntry = {
  id: "test-id-001",
  createdAt: "2024-01-15T10:30:00.000Z",
  kind: "test_fix",
  summary: "Fixed a test assertion",
  trigger: "Test was comparing wrong values",
  fix: "Changed expected value to match actual behavior",
  futurePromptHint: "Always verify expected values in assertions",
  relatedFiles: ["src/__tests__/example.test.ts"],
  relatedSymbols: ["assertEquals"],
  tags: ["testing"],
  severity: "medium",
  confidence: "high",
  enabled: true,
};

describe("secretsGuard", () => {
  describe("checkForSecrets", () => {
    it("should return empty array for clean entry", () => {
      const warnings = checkForSecrets(cleanEntry);
      expect(warnings).toEqual([]);
    });

    it("should detect sk- pattern", () => {
      const entry = { ...cleanEntry, summary: "Used sk-live-abc123 in config" };
      const warnings = checkForSecrets(entry);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain("summary");
      expect(warnings[0]).toContain("sk-");
    });

    it("should detect BEGIN PRIVATE KEY pattern", () => {
      const entry = { ...cleanEntry, fix: "Removed BEGIN PRIVATE KEY from file" };
      const warnings = checkForSecrets(entry);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain("fix");
    });

    it("should detect password= pattern", () => {
      const entry = { ...cleanEntry, trigger: "Found password=admin123 in logs" };
      const warnings = checkForSecrets(entry);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain("trigger");
    });

    it("should detect api_key pattern", () => {
      const entry = { ...cleanEntry, futurePromptHint: "Never hardcode api_key values" };
      const warnings = checkForSecrets(entry);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain("futurePromptHint");
    });

    it("should detect secret pattern", () => {
      const entry = { ...cleanEntry, summary: "The client_secret was exposed" };
      const warnings = checkForSecrets(entry);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain("summary");
    });

    it("should detect patterns case-insensitively", () => {
      const entry = { ...cleanEntry, summary: "Found BEGIN PRIVATE KEY in uppercase" };
      const warnings = checkForSecrets(entry);
      expect(warnings.length).toBeGreaterThan(0);
    });

    it("should detect multiple patterns in same field", () => {
      const entry = { ...cleanEntry, summary: "password=abc and api_key=xyz" };
      const warnings = checkForSecrets(entry);
      expect(warnings.length).toBeGreaterThanOrEqual(2);
    });

    it("should detect patterns across multiple fields", () => {
      const entry = {
        ...cleanEntry,
        summary: "sk-live-test",
        trigger: "password=leaked",
      };
      const warnings = checkForSecrets(entry);
      expect(warnings.length).toBeGreaterThanOrEqual(2);
      expect(warnings.some((w) => w.includes("summary"))).toBe(true);
      expect(warnings.some((w) => w.includes("trigger"))).toBe(true);
    });

    it("should not throw (advisory only)", () => {
      const entry = { ...cleanEntry, summary: "sk-live-secret password=api_key" };
      expect(() => checkForSecrets(entry)).not.toThrow();
    });
  });

  describe("SECRET_PATTERNS", () => {
    it("should export patterns array", () => {
      expect(SECRET_PATTERNS).toBeInstanceOf(Array);
      expect(SECRET_PATTERNS.length).toBe(5);
    });

    it("should contain RegExp instances", () => {
      for (const pattern of SECRET_PATTERNS) {
        expect(pattern).toBeInstanceOf(RegExp);
      }
    });
  });
});
