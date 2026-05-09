/**
 * Unit tests for memoryInjector.
 * Tests format output structure, section header, disclaimer.
 */
import { describe, it, expect } from "vitest";
import { formatMemorySection } from "../core/memoryInjector.js";
import type { DevMemoryEntry } from "../core/memoryValidator.js";

function makeEntry(overrides: Partial<DevMemoryEntry> = {}): DevMemoryEntry {
  return {
    id: "entry-001",
    createdAt: "2024-01-15T10:30:00.000Z",
    kind: "test_fix",
    summary: "vitest mock must be hoisted",
    trigger: "vi.mock() called after import",
    fix: "Move vi.mock() to top of file",
    futurePromptHint: "Always place vi.mock() before imports",
    relatedFiles: ["src/__tests__/cli.test.ts"],
    relatedSymbols: ["vi.mock"],
    tags: ["testing", "vitest"],
    severity: "medium",
    confidence: "high",
    enabled: true,
    ...overrides,
  };
}

describe("memoryInjector", () => {
  describe("formatMemorySection", () => {
    it("should return empty string for empty entries", () => {
      expect(formatMemorySection([])).toBe("");
    });

    it("should include the section header", () => {
      const section = formatMemorySection([makeEntry()]);
      expect(section).toContain("## Development Memory / 再発防止メモ");
    });

    it("should include the disclaimer", () => {
      const section = formatMemorySection([makeEntry()]);
      expect(section).toContain("今回の明示仕様と矛盾する場合は明示仕様を優先");
    });

    it("should number entries starting from 1", () => {
      const entries = [
        makeEntry({ id: "e1", summary: "First entry" }),
        makeEntry({ id: "e2", summary: "Second entry" }),
      ];
      const section = formatMemorySection(entries);
      expect(section).toContain("### 1. First entry");
      expect(section).toContain("### 2. Second entry");
    });

    it("should include kind in parentheses", () => {
      const section = formatMemorySection([makeEntry({ kind: "lint_fix" })]);
      expect(section).toContain("(lint_fix)");
    });

    it("should include trigger, fix, and hint labels", () => {
      const section = formatMemorySection([makeEntry()]);
      expect(section).toContain("- **Trigger**: vi.mock() called after import");
      expect(section).toContain("- **Fix**: Move vi.mock() to top of file");
      expect(section).toContain("- **Hint**: Always place vi.mock() before imports");
    });

    it("should include related tags and symbols", () => {
      const section = formatMemorySection([makeEntry()]);
      expect(section).toContain("- **Related**:");
      expect(section).toContain("testing");
      expect(section).toContain("vi.mock");
    });

    it("should use relatedFiles as fallback when tags and symbols are empty", () => {
      const entry = makeEntry({ tags: [], relatedSymbols: [], relatedFiles: ["src/foo.ts"] });
      const section = formatMemorySection([entry]);
      expect(section).toContain("src/foo.ts");
    });

    it("should show dash when no related info available", () => {
      const entry = makeEntry({ tags: [], relatedSymbols: [], relatedFiles: [] });
      const section = formatMemorySection([entry]);
      expect(section).toContain("- **Related**: —");
    });
  });
});
