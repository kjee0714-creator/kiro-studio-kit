import { describe, it, expect, afterEach, vi } from "vitest";
import { appendJsonlRecord, parseJsonlLines, readJsonlFile } from "../core/jsonlLogger.js";
import { mkdtemp, rm, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

describe("jsonlLogger", () => {
  const tempDirs: string[] = [];

  async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "jsonl-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  describe("appendJsonlRecord", () => {
    it("JSONL ファイルに1行追記する", async () => {
      const tempDir = await createTempDir();
      const filePath = join(tempDir, "sub", "test.jsonl");

      await appendJsonlRecord(filePath, { id: 1, name: "test" }, "テスト");

      const content = await readFile(filePath, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toEqual({ id: 1, name: "test" });
    });

    it("複数回追記で複数行になる", async () => {
      const tempDir = await createTempDir();
      const filePath = join(tempDir, "multi.jsonl");

      await appendJsonlRecord(filePath, { n: 1 }, "テスト");
      await appendJsonlRecord(filePath, { n: 2 }, "テスト");

      const content = await readFile(filePath, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines).toHaveLength(2);
    });

    it("親ディレクトリが存在しない場合に自動作成する", async () => {
      const tempDir = await createTempDir();
      const filePath = join(tempDir, "a", "b", "deep.jsonl");

      const result = await appendJsonlRecord(filePath, { ok: true }, "テスト");

      expect(result).toBe(filePath);
      const content = await readFile(filePath, "utf-8");
      expect(content.trim().length).toBeGreaterThan(0);
    });
  });

  describe("parseJsonlLines", () => {
    it("正常な JSONL をパースする", () => {
      const content = '{"a":1}\n{"a":2}\n';
      const result = parseJsonlLines<{ a: number }>(content);
      expect(result).toHaveLength(2);
      expect(result[0].a).toBe(1);
      expect(result[1].a).toBe(2);
    });

    it("壊れた行をスキップする", () => {
      const content = '{"a":1}\nBROKEN\n{"a":3}\n';
      const result = parseJsonlLines<{ a: number }>(content);
      expect(result).toHaveLength(2);
      expect(result[0].a).toBe(1);
      expect(result[1].a).toBe(3);
    });

    it("空文字列は空配列を返す", () => {
      expect(parseJsonlLines("")).toHaveLength(0);
    });

    it("空行のみは空配列を返す", () => {
      expect(parseJsonlLines("\n\n\n")).toHaveLength(0);
    });
  });

  describe("readJsonlFile", () => {
    it("存在するファイルを読み込む", async () => {
      const tempDir = await createTempDir();
      const filePath = join(tempDir, "read.jsonl");
      await writeFile(filePath, '{"x":1}\n{"x":2}\n');

      const result = await readJsonlFile<{ x: number }>(filePath);

      expect(result).toHaveLength(2);
      expect(result[0].x).toBe(1);
    });

    it("存在しないファイルは空配列を返す", async () => {
      const tempDir = await createTempDir();
      const filePath = join(tempDir, "nonexistent.jsonl");

      const result = await readJsonlFile<unknown>(filePath);

      expect(result).toHaveLength(0);
    });

    it("壊れた行を含むファイルでもスキップして読み込む", async () => {
      const tempDir = await createTempDir();
      const filePath = join(tempDir, "broken.jsonl");
      await writeFile(filePath, '{"ok":true}\nNOT JSON\n{"ok":false}\n');

      const result = await readJsonlFile<{ ok: boolean }>(filePath);

      expect(result).toHaveLength(2);
      expect(result[0].ok).toBe(true);
      expect(result[1].ok).toBe(false);
    });
  });
});
