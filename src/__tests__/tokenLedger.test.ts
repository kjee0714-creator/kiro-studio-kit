import { describe, it, expect, afterEach, vi } from "vitest";
import {
  estimateTokensFromChars,
  appendTokenLedgerRecord,
} from "../core/tokenLedger.js";
import type { TokenLedgerRecord } from "../core/tokenLedger.js";
import { mkdtemp, rm, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

describe("tokenLedger", () => {
  const tempDirs: string[] = [];

  async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "token-ledger-test-"));
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

  describe("estimateTokensFromChars", () => {
    it("空文字列は0トークン", () => {
      expect(estimateTokensFromChars("")).toBe(0);
    });

    it("ASCII 4文字は1トークン", () => {
      expect(estimateTokensFromChars("abcd")).toBe(1);
    });

    it("ASCII 5文字は2トークン", () => {
      expect(estimateTokensFromChars("abcde")).toBe(2);
    });

    it("日本語5文字は4トークン (5/1.5=3.33→ceil=4)", () => {
      expect(estimateTokensFromChars("あいうえお")).toBe(4);
    });

    it("ASCII/日本語混在: ascii3+jp3 → 0.75+2=2.75→ceil=3", () => {
      expect(estimateTokensFromChars("abcあいう")).toBe(3);
    });

    it("ASCII 1文字は1トークン", () => {
      expect(estimateTokensFromChars("a")).toBe(1);
    });

    it("長文でもクラッシュしない", () => {
      const longText = "あ".repeat(10000) + "a".repeat(10000);
      const result = estimateTokensFromChars(longText);
      expect(result).toBeGreaterThan(0);
      // 10000/1.5 + 10000/4 = 6667 + 2500 = 9167
      expect(result).toBe(Math.ceil(10000 / 1.5 + 10000 / 4));
    });
  });

  describe("appendTokenLedgerRecord", () => {
    function createSampleRecord(
      overrides?: Partial<TokenLedgerRecord>,
    ): TokenLedgerRecord {
      return {
        runId: "test-run-id-000",
        timestamp: "2026-04-29T00:00:00.000Z",
        taskFile: "./examples/task.md",
        mode: "economy",
        files: {
          taskFileChars: 100,
          promptChars: 4000,
          publicLogTemplateChars: 500,
        },
        estimatedTokens: {
          taskFile: 25,
          prompt: 1000,
          publicLogTemplate: 125,
          total: 1150,
        },
        limits: {
          contextFileLimit: 5,
          changedFileLimit: 3,
          retryLimit: 2,
        },
        economyFeatures: {
          contextManifest: true,
          tokenEconomyRules: true,
          deltaReportOnly: true,
          stopOnRepeatedFailure: true,
        },
        ...overrides,
      };
    }

    it("appendTokenLedgerRecord が .studio/token-ledger.jsonl に1行追記する", async () => {
      const tempDir = await createTempDir();
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      const record = createSampleRecord();
      const logPath = await appendTokenLedgerRecord(record);

      expect(logPath).toContain("token-ledger.jsonl");
      const content = await readFile(logPath, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines).toHaveLength(1);
    });

    it("複数回実行するとJSONLとして複数行になる", async () => {
      const tempDir = await createTempDir();
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      await appendTokenLedgerRecord(
        createSampleRecord({ timestamp: "2026-04-29T01:00:00.000Z" }),
      );
      await appendTokenLedgerRecord(
        createSampleRecord({ timestamp: "2026-04-29T02:00:00.000Z" }),
      );

      const logPath = join(tempDir, ".studio", "token-ledger.jsonl");
      const content = await readFile(logPath, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines).toHaveLength(2);
    });

    it("追記されたJSONが TokenLedgerRecord としてparseできる", async () => {
      const tempDir = await createTempDir();
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      const record = createSampleRecord();
      const logPath = await appendTokenLedgerRecord(record);

      const content = await readFile(logPath, "utf-8");
      const parsed = JSON.parse(content.trim()) as TokenLedgerRecord;
      expect(parsed.mode).toBe("economy");
      expect(parsed.files.taskFileChars).toBe(100);
      expect(parsed.estimatedTokens.total).toBe(1150);
      expect(parsed.limits.contextFileLimit).toBe(5);
      expect(parsed.economyFeatures.contextManifest).toBe(true);
    });

    it(".studio/ ディレクトリが存在しない場合に自動作成する", async () => {
      const tempDir = await createTempDir();
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      const record = createSampleRecord();
      const logPath = await appendTokenLedgerRecord(record);

      expect(logPath).toContain(".studio");
      const content = await readFile(logPath, "utf-8");
      expect(content.length).toBeGreaterThan(0);
    });

    it("runId が記録される", async () => {
      const tempDir = await createTempDir();
      vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      const record = createSampleRecord({ runId: "unique-run-id-xyz" });
      const logPath = await appendTokenLedgerRecord(record);

      const content = await readFile(logPath, "utf-8");
      const parsed = JSON.parse(content.trim()) as TokenLedgerRecord;
      expect(parsed.runId).toBe("unique-run-id-xyz");
    });
  });
});
