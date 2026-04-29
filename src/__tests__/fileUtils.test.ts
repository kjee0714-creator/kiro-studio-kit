import { describe, it, expect, afterEach } from "vitest";
import { readTextFile, writeTextFile, fileExists } from "../core/fileUtils.js";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

describe("fileUtils", () => {
  const tempDirs: string[] = [];

  /** テスト用の一時ディレクトリを作成する */
  async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "fileUtils-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  describe("readTextFile", () => {
    it("存在しないファイルを読み込むと「ファイルが見つかりません」を含むエラーをスローする", async () => {
      const nonExistentPath = join(tmpdir(), "no-such-file-abc123.txt");

      await expect(readTextFile(nonExistentPath)).rejects.toThrow(
        "ファイルが見つかりません",
      );
    });
  });

  describe("writeTextFile", () => {
    it("親ディレクトリが存在しない場合に自動作成する", async () => {
      const tempDir = await createTempDir();
      const nestedPath = join(tempDir, "a", "b", "c", "output.txt");

      await writeTextFile(nestedPath, "テスト内容");

      const exists = await fileExists(nestedPath);
      expect(exists).toBe(true);
    });

    it("書き込んだ内容を読み戻すと同じ内容が返る", async () => {
      const tempDir = await createTempDir();
      const filePath = join(tempDir, "roundtrip.txt");
      const content = "こんにちは世界\nHello World\n🎉";

      await writeTextFile(filePath, content);
      const result = await readTextFile(filePath);

      expect(result).toBe(content);
    });
  });

  describe("fileExists", () => {
    it("存在するファイルに対して true を返す", async () => {
      const tempDir = await createTempDir();
      const filePath = join(tempDir, "exists.txt");
      await writeTextFile(filePath, "content");

      const result = await fileExists(filePath);

      expect(result).toBe(true);
    });

    it("存在しないファイルに対して false を返す", async () => {
      const nonExistentPath = join(tmpdir(), "does-not-exist-xyz789.txt");

      const result = await fileExists(nonExistentPath);

      expect(result).toBe(false);
    });
  });
});
