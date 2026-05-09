/**
 * Unit tests for memoryStore.
 * Tests file I/O, auto-creation, corrupt line handling, validation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rm, mkdir, writeFile } from "fs/promises";
import path from "path";
import { appendMemoryEntry, readMemoryEntries, MEMORY_STORE_PATH } from "../core/memoryStore.js";
import type { DevMemoryEntry } from "../core/memoryValidator.js";

const TEST_DIR = ".test-tmp/memoryStore-unit";
let testFile: string;

const validEntry: DevMemoryEntry = {
  id: "test-id-001",
  createdAt: "2024-01-15T10:30:00.000Z",
  kind: "test_fix",
  summary: "Fixed test assertion",
  trigger: "Test was comparing wrong values",
  fix: "Changed expected value",
  futurePromptHint: "Verify expected values",
  relatedFiles: ["src/example.ts"],
  relatedSymbols: ["assertEquals"],
  tags: ["testing"],
  severity: "medium",
  confidence: "high",
  enabled: true,
};

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
  testFile = path.join(TEST_DIR, `test-${Date.now()}.jsonl`);
});

afterEach(async () => {
  try {
    await rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe("memoryStore", () => {
  describe("MEMORY_STORE_PATH", () => {
    it("should be .kiro/ksk/dev-memory.jsonl", () => {
      expect(MEMORY_STORE_PATH).toBe(".kiro/ksk/dev-memory.jsonl");
    });
  });

  describe("readMemoryEntries", () => {
    it("should return empty array for non-existent file", async () => {
      const entries = await readMemoryEntries(path.join(TEST_DIR, "nonexistent.jsonl"));
      expect(entries).toEqual([]);
    });

    it("should read valid entries from file", async () => {
      await writeFile(testFile, JSON.stringify(validEntry) + "\n", "utf-8");
      const entries = await readMemoryEntries(testFile);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(validEntry);
    });

    it("should read multiple entries", async () => {
      const entry2: DevMemoryEntry = { ...validEntry, id: "test-id-002", summary: "Second entry" };
      const content = JSON.stringify(validEntry) + "\n" + JSON.stringify(entry2) + "\n";
      await writeFile(testFile, content, "utf-8");
      const entries = await readMemoryEntries(testFile);
      expect(entries).toHaveLength(2);
    });

    it("should skip invalid JSON lines", async () => {
      const content = JSON.stringify(validEntry) + "\n" + "not valid json\n" + JSON.stringify({ ...validEntry, id: "test-id-002" }) + "\n";
      await writeFile(testFile, content, "utf-8");
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const entries = await readMemoryEntries(testFile);
      expect(entries).toHaveLength(2);
      warnSpy.mockRestore();
    });

    it("should skip entries that fail validation", async () => {
      const invalidEntry = { ...validEntry, kind: "invalid_kind" };
      const content = JSON.stringify(validEntry) + "\n" + JSON.stringify(invalidEntry) + "\n";
      await writeFile(testFile, content, "utf-8");
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const entries = await readMemoryEntries(testFile);
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe("test-id-001");
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("appendMemoryEntry", () => {
    it("should create file and parent directories if they don't exist", async () => {
      const deepPath = path.join(TEST_DIR, "deep", "nested", "store.jsonl");
      await appendMemoryEntry(validEntry, deepPath);
      const entries = await readMemoryEntries(deepPath);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(validEntry);
    });

    it("should append to existing file", async () => {
      await appendMemoryEntry(validEntry, testFile);
      const entry2: DevMemoryEntry = { ...validEntry, id: "test-id-002" };
      await appendMemoryEntry(entry2, testFile);
      const entries = await readMemoryEntries(testFile);
      expect(entries).toHaveLength(2);
    });

    it("should throw on validation failure", async () => {
      const invalidEntry = { ...validEntry, summary: "" } as DevMemoryEntry;
      await expect(appendMemoryEntry(invalidEntry, testFile)).rejects.toThrow(
        "DevMemoryEntry validation failed",
      );
    });

    it("should emit secrets warning but still write", async () => {
      const entryWithSecret: DevMemoryEntry = {
        ...validEntry,
        id: "secret-entry",
        summary: "Found sk-live-abc123 in config",
      };
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await appendMemoryEntry(entryWithSecret, testFile);
      expect(warnSpy).toHaveBeenCalled();
      const entries = await readMemoryEntries(testFile);
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe("secret-entry");
      warnSpy.mockRestore();
    });

    it("should return the file path", async () => {
      const result = await appendMemoryEntry(validEntry, testFile);
      expect(result).toBe(testFile);
    });
  });
});
