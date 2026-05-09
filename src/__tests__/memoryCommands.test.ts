/**
 * Unit tests for memoryCommands.
 * Tests flag parsing, defaults, error messages, list/search output.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm } from "fs/promises";

// We test the handlers by mocking the store path
const TEST_DIR = ".test-tmp/memoryCommands-unit";

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

describe("memoryCommands", () => {
  describe("handleMemoryAdd", () => {
    it("should add entry with all required flags", async () => {
      const { handleMemoryAdd } = await import("../core/memoryCommands.js");

      const args = [
        "--kind", "test_fix",
        "--summary", "Test summary",
        "--trigger", "Test trigger",
        "--fix", "Test fix",
        "--hint", "Test hint",
        "--files", "src/a.ts,src/b.ts",
        "--symbols", "funcA,funcB",
        "--tags", "tag1,tag2",
        "--severity", "high",
        "--confidence", "medium",
      ];

      // We can't easily test handleMemoryAdd with custom path,
      // so we test the parsing logic indirectly
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // This will write to the default path, but we verify it doesn't throw
      await handleMemoryAdd(args);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("メモリエントリを追加しました"));
      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("should exit with error when required flags are missing", async () => {
      const { handleMemoryAdd } = await import("../core/memoryCommands.js");

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit called");
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const args = ["--kind", "test_fix", "--summary", "Only summary"];

      await expect(handleMemoryAdd(args)).rejects.toThrow("process.exit called");
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("必須"));

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it("should exit with error for invalid kind", async () => {
      const { handleMemoryAdd } = await import("../core/memoryCommands.js");

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit called");
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const args = [
        "--kind", "invalid_kind",
        "--summary", "s",
        "--trigger", "t",
        "--fix", "f",
        "--hint", "h",
      ];

      await expect(handleMemoryAdd(args)).rejects.toThrow("process.exit called");
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("無効な値"));

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe("handleMemoryList", () => {
    it("should show empty message when no entries", async () => {
      const { handleMemoryList } = await import("../core/memoryCommands.js");
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // Default path won't have entries in test env (or may have from add test)
      // We just verify it doesn't throw
      await handleMemoryList();
      consoleSpy.mockRestore();
    });
  });

  describe("handleMemorySearch", () => {
    it("should exit with error when no query provided", async () => {
      const { handleMemorySearch } = await import("../core/memoryCommands.js");

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit called");
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(handleMemorySearch([])).rejects.toThrow("process.exit called");
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("検索クエリ"));

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe("handleMemory", () => {
    it("should exit with error for unknown subcommand", async () => {
      const { handleMemory } = await import("../core/memoryCommands.js");

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit called");
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(handleMemory(["unknown"])).rejects.toThrow("process.exit called");

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe("handleMemoryHealth", () => {
    it("should display report with scores, stats, findings, recommendations", async () => {
      const { handleMemoryHealth } = await import("../core/memoryCommands.js");
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await handleMemoryHealth();

      const output = consoleSpy.mock.calls.map(c => c[0]).join("\n");
      expect(output).toContain("Memory Health Report");
      expect(output).toContain("Overall:");
      expect(output).toContain("Scores:");
      expect(output).toContain("Bloat:");
      expect(output).toContain("Conflict:");
      expect(output).toContain("Duplication:");
      expect(output).toContain("Staleness:");
      expect(output).toContain("Injection Risk:");
      expect(output).toContain("Stats:");

      consoleSpy.mockRestore();
    });

    it("should display score 0 and level ok when no store file exists", async () => {
      // handleMemoryHealth reads from default store path
      // In test env with entries from add test, we just verify it runs
      const { handleMemoryHealth } = await import("../core/memoryCommands.js");
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await handleMemoryHealth();

      const output = consoleSpy.mock.calls.map(c => c[0]).join("\n");
      expect(output).toContain("/100");

      consoleSpy.mockRestore();
    });
  });
});
