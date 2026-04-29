import { describe, it, expect, afterEach, vi } from "vitest";
import { generateExperimentSummary, formatExperimentSummary } from "../core/experimentSummary.js";
import type { ExperimentSummary } from "../core/experimentSummary.js";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

describe("experimentSummary", () => {
  const tempDirs: string[] = [];

  async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "summary-test-"));
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

  function experimentLine(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      runId: "run-1",
      timestamp: "2026-04-29T00:00:00.000Z",
      taskFile: "./task.md",
      mode: "studio",
      promptPath: "outputs/kiro-prompt.md",
      publicLogPath: "outputs/public-log-template.md",
      tokenLedgerPath: ".studio/token-ledger.jsonl",
      estimatedTokens: 1000,
      features: { tokenEconomy: true, antiRunaway: true, qualityGates: true, publicLog: true, tokenLedger: true },
      estimated: { taskChars: 100, promptChars: 4000, contextMode: "economy" },
      ...overrides,
    });
  }

  function tokenLedgerLine(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      runId: "run-1",
      timestamp: "2026-04-29T00:00:00.000Z",
      taskFile: "./task.md",
      mode: "economy",
      files: { taskFileChars: 100, promptChars: 4000, publicLogTemplateChars: 500 },
      estimatedTokens: { taskFile: 25, prompt: 1000, publicLogTemplate: 125, total: 1200 },
      limits: { contextFileLimit: 5, changedFileLimit: 3, retryLimit: 2 },
      economyFeatures: { contextManifest: true, tokenEconomyRules: true, deltaReportOnly: true, stopOnRepeatedFailure: true },
      ...overrides,
    });
  }

  it("ログファイルが存在しない場合は runs: 0 を返す", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const summary = await generateExperimentSummary();

    expect(summary.runs).toBe(0);
    expect(summary.avgTokens).toBe(0);
    expect(summary.avgPromptSizeChars).toBe(0);
    expect(summary.economyUsagePercent).toBe(0);
  });

  it("正常な JSONL から統計を計算する", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const studioDir = join(tempDir, ".studio");
    await mkdir(studioDir, { recursive: true });

    await writeFile(
      join(studioDir, "experiments.jsonl"),
      experimentLine({ runId: "run-1", estimatedTokens: 1000 }) + "\n" +
      experimentLine({ runId: "run-2", estimatedTokens: 1400, estimated: { taskChars: 200, promptChars: 4200, contextMode: "economy" } }) + "\n",
    );

    await writeFile(
      join(studioDir, "token-ledger.jsonl"),
      tokenLedgerLine({ runId: "run-1", estimatedTokens: { taskFile: 25, prompt: 1000, publicLogTemplate: 125, total: 1200 } }) + "\n" +
      tokenLedgerLine({ runId: "run-2", estimatedTokens: { taskFile: 50, prompt: 1100, publicLogTemplate: 150, total: 1400 } }) + "\n",
    );

    const summary = await generateExperimentSummary();

    expect(summary.runs).toBe(2);
    // token ledger total: (1200 + 1400) / 2 = 1300
    expect(summary.avgTokens).toBe(1300);
    // prompt chars: (4000 + 4200) / 2 = 4100
    expect(summary.avgPromptSizeChars).toBe(4100);
    expect(summary.economyUsagePercent).toBe(100);
  });

  it("壊れた JSONL 行をスキップして残りを処理する", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const studioDir = join(tempDir, ".studio");
    await mkdir(studioDir, { recursive: true });

    await writeFile(
      join(studioDir, "experiments.jsonl"),
      experimentLine({ runId: "run-1" }) + "\n" +
      "THIS IS BROKEN JSON\n" +
      experimentLine({ runId: "run-2" }) + "\n",
    );

    await writeFile(
      join(studioDir, "token-ledger.jsonl"),
      tokenLedgerLine({ runId: "run-1" }) + "\n",
    );

    const summary = await generateExperimentSummary();

    // 壊れた行をスキップして2件処理
    expect(summary.runs).toBe(2);
  });

  it("token-ledger と experiments の runId で紐付けてトークン数を取得する", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const studioDir = join(tempDir, ".studio");
    await mkdir(studioDir, { recursive: true });

    await writeFile(
      join(studioDir, "experiments.jsonl"),
      experimentLine({ runId: "shared-id", estimatedTokens: 999 }) + "\n",
    );

    await writeFile(
      join(studioDir, "token-ledger.jsonl"),
      tokenLedgerLine({ runId: "shared-id", estimatedTokens: { taskFile: 50, prompt: 500, publicLogTemplate: 50, total: 2000 } }) + "\n",
    );

    const summary = await generateExperimentSummary();

    // token ledger の total (2000) が優先される（experiment の 999 ではない）
    expect(summary.avgTokens).toBe(2000);
  });

  it("economy usage 率を正しく算出する", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const studioDir = join(tempDir, ".studio");
    await mkdir(studioDir, { recursive: true });

    // 全て economy モード
    await writeFile(
      join(studioDir, "experiments.jsonl"),
      experimentLine({ runId: "r1" }) + "\n" +
      experimentLine({ runId: "r2" }) + "\n" +
      experimentLine({ runId: "r3" }) + "\n",
    );

    const summary = await generateExperimentSummary();

    expect(summary.economyUsagePercent).toBe(100);
  });

  describe("formatExperimentSummary", () => {
    it("サマリーを正しくフォーマットする", () => {
      const summary: ExperimentSummary = {
        runs: 12,
        avgTokens: 1400,
        avgPromptSizeChars: 4100,
        economyUsagePercent: 100,
      };

      const output = formatExperimentSummary(summary);

      expect(output).toContain("runs: 12");
      expect(output).toContain("avg tokens: 1400");
      expect(output).toContain("avg prompt size: 4100 chars");
      expect(output).toContain("economy usage: 100%");
    });
  });
});
