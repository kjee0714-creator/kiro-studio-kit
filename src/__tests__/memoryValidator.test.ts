/**
 * Unit tests for memoryValidator.
 * Tests specific valid/invalid examples and edge cases.
 */
import { describe, it, expect } from "vitest";
import {
  validateDevMemoryEntry,
  isValidDevMemoryEntry,
  VALID_KINDS,
  VALID_SEVERITIES,
  VALID_CONFIDENCES,
} from "../core/memoryValidator.js";
import type { DevMemoryEntry } from "../core/memoryValidator.js";

/** A valid entry for testing */
const validEntry: DevMemoryEntry = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  createdAt: "2024-01-15T10:30:00.000Z",
  kind: "test_fix",
  summary: "vitest mock must be hoisted above imports",
  trigger: "vi.mock() called after import statement",
  fix: "Move vi.mock() to top of file",
  futurePromptHint: "Always place vi.mock() calls before import statements",
  relatedFiles: ["src/__tests__/cli.test.ts"],
  relatedSymbols: ["vi.mock"],
  tags: ["testing", "vitest"],
  severity: "medium",
  confidence: "high",
  enabled: true,
};

describe("memoryValidator", () => {
  describe("validateDevMemoryEntry", () => {
    it("should accept a valid entry", () => {
      const result = validateDevMemoryEntry(validEntry);
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("should accept a valid entry with optional fields", () => {
      const entryWithOptionals: DevMemoryEntry = {
        ...validEntry,
        project: "kiro-studio-kit",
        phase: "implementation",
        taskName: "fix-cli-tests",
        supersedes: ["old-entry-id"],
        expiresAt: "2025-12-31T23:59:59.000Z",
      };
      const result = validateDevMemoryEntry(entryWithOptionals);
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("should reject empty summary", () => {
      const invalid = { ...validEntry, summary: "" };
      const result = validateDevMemoryEntry(invalid);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("summary must not be empty");
    });

    it("should reject empty id", () => {
      const invalid = { ...validEntry, id: "" };
      const result = validateDevMemoryEntry(invalid);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("id must not be empty");
    });

    it("should reject empty createdAt", () => {
      const invalid = { ...validEntry, createdAt: "" };
      const result = validateDevMemoryEntry(invalid);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("createdAt must not be empty");
    });

    it("should reject empty trigger", () => {
      const invalid = { ...validEntry, trigger: "" };
      const result = validateDevMemoryEntry(invalid);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("trigger must not be empty");
    });

    it("should reject empty fix", () => {
      const invalid = { ...validEntry, fix: "" };
      const result = validateDevMemoryEntry(invalid);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("fix must not be empty");
    });

    it("should reject empty futurePromptHint", () => {
      const invalid = { ...validEntry, futurePromptHint: "" };
      const result = validateDevMemoryEntry(invalid);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("futurePromptHint must not be empty");
    });

    it("should reject invalid kind value", () => {
      const invalid = { ...validEntry, kind: "invalid_kind" };
      const result = validateDevMemoryEntry(invalid);
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes("kind"))).toBe(true);
    });

    it("should reject missing enabled field", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { enabled: _, ...noEnabled } = validEntry;
      const result = validateDevMemoryEntry(noEnabled);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("enabled must be a boolean");
    });

    it("should reject non-array relatedFiles", () => {
      const invalid = { ...validEntry, relatedFiles: "not-an-array" };
      const result = validateDevMemoryEntry(invalid);
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes("relatedFiles"))).toBe(true);
    });

    it("should reject relatedFiles with non-string elements", () => {
      const invalid = { ...validEntry, relatedFiles: [123, true] };
      const result = validateDevMemoryEntry(invalid);
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes("relatedFiles"))).toBe(true);
    });

    it("should reject non-array relatedSymbols", () => {
      const invalid = { ...validEntry, relatedSymbols: 42 };
      const result = validateDevMemoryEntry(invalid);
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes("relatedSymbols"))).toBe(true);
    });

    it("should reject non-array tags", () => {
      const invalid = { ...validEntry, tags: null };
      const result = validateDevMemoryEntry(invalid);
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes("tags"))).toBe(true);
    });

    it("should reject invalid severity", () => {
      const invalid = { ...validEntry, severity: "critical" };
      const result = validateDevMemoryEntry(invalid);
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes("severity"))).toBe(true);
    });

    it("should reject invalid confidence", () => {
      const invalid = { ...validEntry, confidence: "very_high" };
      const result = validateDevMemoryEntry(invalid);
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes("confidence"))).toBe(true);
    });

    it("should reject null input", () => {
      const result = validateDevMemoryEntry(null);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("input must be a non-null object");
    });

    it("should reject undefined input", () => {
      const result = validateDevMemoryEntry(undefined);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("input must be a non-null object");
    });

    it("should reject non-object input", () => {
      const result = validateDevMemoryEntry("string");
      expect(result.success).toBe(false);
      expect(result.errors).toContain("input must be a non-null object");
    });

    it("should collect multiple errors", () => {
      const invalid = { ...validEntry, summary: "", kind: "bad", enabled: "yes" };
      const result = validateDevMemoryEntry(invalid);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it("should reject invalid optional supersedes (non-array)", () => {
      const invalid = { ...validEntry, supersedes: "not-array" };
      const result = validateDevMemoryEntry(invalid);
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes("supersedes"))).toBe(true);
    });

    it("should reject invalid optional expiresAt (non-string)", () => {
      const invalid = { ...validEntry, expiresAt: 12345 };
      const result = validateDevMemoryEntry(invalid);
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes("expiresAt"))).toBe(true);
    });

    it("should accept valid autoCaptured boolean", () => {
      const entry = { ...validEntry, autoCaptured: true };
      const result = validateDevMemoryEntry(entry);
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("should accept autoCaptured as false", () => {
      const entry = { ...validEntry, autoCaptured: false };
      const result = validateDevMemoryEntry(entry);
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("should reject non-boolean autoCaptured", () => {
      const invalid = { ...validEntry, autoCaptured: "yes" };
      const result = validateDevMemoryEntry(invalid);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("autoCaptured must be a boolean if provided");
    });

    it("should accept valid conflictKey string", () => {
      const entry = { ...validEntry, conflictKey: "formatting-style" };
      const result = validateDevMemoryEntry(entry);
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("should reject non-string conflictKey", () => {
      const invalid = { ...validEntry, conflictKey: 123 };
      const result = validateDevMemoryEntry(invalid);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("conflictKey must be a string if provided");
    });

    it("should accept entry without autoCaptured and conflictKey (backward compat)", () => {
      const result = validateDevMemoryEntry(validEntry);
      expect(result.success).toBe(true);
    });
  });

  describe("isValidDevMemoryEntry", () => {
    it("should return true for valid entry", () => {
      expect(isValidDevMemoryEntry(validEntry)).toBe(true);
    });

    it("should return false for invalid entry", () => {
      expect(isValidDevMemoryEntry({ summary: "" })).toBe(false);
    });
  });

  describe("constants", () => {
    it("should export 8 valid kinds", () => {
      expect(VALID_KINDS).toHaveLength(8);
    });

    it("should export 3 valid severities", () => {
      expect(VALID_SEVERITIES).toHaveLength(3);
    });

    it("should export 3 valid confidences", () => {
      expect(VALID_CONFIDENCES).toHaveLength(3);
    });
  });
});
