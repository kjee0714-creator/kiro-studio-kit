import { describe, it, expect, afterEach, vi } from "vitest";
import { generateExperimentSummary, generateFullExperimentSummary, formatExperimentSummary, generateAutoModeSummary } from "../core/experimentSummary.js";
import type { ExperimentSummary, AutoModeSummary } from "../core/experimentSummary.js";
import type { ExperimentRecord } from "../core/experimentLogger.js";
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
      promptMode: "full",
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
    expect(summary.avgTokens).toBe(1300);
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

    expect(summary.avgTokens).toBe(2000);
  });

  it("economy usage 率を正しく算出する", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const studioDir = join(tempDir, ".studio");
    await mkdir(studioDir, { recursive: true });

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
      expect(output).toContain("auto usage: none");
    });

    it("auto summary なしの場合 'auto usage: none' を表示する", () => {
      const summary: ExperimentSummary = { runs: 5, avgTokens: 1000, avgPromptSizeChars: 3000, economyUsagePercent: 100 };
      const output = formatExperimentSummary(summary);
      expect(output).toContain("auto usage: none");
    });

    it("auto summary ありの場合に auto usage を表示する", () => {
      const summary: ExperimentSummary = { runs: 10, avgTokens: 1500, avgPromptSizeChars: 4000, economyUsagePercent: 100 };
      const autoSummary: AutoModeSummary = {
        totalAutoRuns: 8,
        resolvedCounts: { minimal: 2, compact: 4, full: 2 },
        avgScore: 1.5,
        topReasons: [
          { reason: "Full_Keyword: schema (+1)", count: 3 },
          { reason: "Minimal_Keyword: README (-1)", count: 2 },
        ],
      };

      const output = formatExperimentSummary(summary, autoSummary);

      expect(output).toContain("auto usage:");
      expect(output).toContain("total: 8");
      expect(output).toContain("minimal: 2");
      expect(output).toContain("compact: 4");
      expect(output).toContain("full: 2");
      expect(output).toContain("avg score: 1.5");
      expect(output).toContain("top reasons:");
      expect(output).toContain("Full_Keyword: schema (+1): 3");
      expect(output).toContain("Minimal_Keyword: README (-1): 2");
    });

    it("auto totalAutoRuns が 0 の場合 'auto usage: none' を表示する", () => {
      const summary: ExperimentSummary = { runs: 5, avgTokens: 1000, avgPromptSizeChars: 3000, economyUsagePercent: 100 };
      const autoSummary: AutoModeSummary = {
        totalAutoRuns: 0,
        resolvedCounts: { minimal: 0, compact: 0, full: 0 },
        avgScore: 0,
        topReasons: [],
      };

      const output = formatExperimentSummary(summary, autoSummary);
      expect(output).toContain("auto usage: none");
    });
  });
});

describe("generateAutoModeSummary", () => {
  function makeRecord(overrides: Partial<ExperimentRecord> = {}): ExperimentRecord {
    return {
      runId: "run-1",
      timestamp: "2026-04-29T00:00:00.000Z",
      taskFile: "./task.md",
      mode: "studio",
      promptMode: "full",
      promptPath: "outputs/kiro-prompt.md",
      publicLogPath: "outputs/public-log-template.md",
      tokenLedgerPath: ".studio/token-ledger.jsonl",
      estimatedTokens: 1000,
      features: { tokenEconomy: true, antiRunaway: true, qualityGates: true, publicLog: true, tokenLedger: true },
      estimated: { taskChars: 100, promptChars: 4000, contextMode: "economy" },
      ...overrides,
    };
  }

  it("auto なしの場合 totalAutoRuns: 0 を返す", () => {
    const records = [
      makeRecord({ runId: "r1", promptMode: "full" }),
      makeRecord({ runId: "r2", promptMode: "compact" }),
    ];
    const result = generateAutoModeSummary(records);
    expect(result.totalAutoRuns).toBe(0);
    expect(result.resolvedCounts).toEqual({ minimal: 0, compact: 0, full: 0 });
    expect(result.avgScore).toBe(0);
    expect(result.topReasons).toEqual([]);
  });

  it("auto の件数を正しくカウントする", () => {
    const records = [
      makeRecord({ runId: "r1", requestedPromptMode: "auto", promptMode: "full", autoModeDecision: { score: 5, reasons: ["Full_Keyword: schema (+1)"] } }),
      makeRecord({ runId: "r2", promptMode: "compact" }),
      makeRecord({ runId: "r3", requestedPromptMode: "auto", promptMode: "minimal", autoModeDecision: { score: -2, reasons: ["Minimal_Keyword: typo (-1)"] } }),
    ];
    const result = generateAutoModeSummary(records);
    expect(result.totalAutoRuns).toBe(2);
  });

  it("resolvedMode 分布が正しい", () => {
    const records = [
      makeRecord({ runId: "r1", requestedPromptMode: "auto", promptMode: "full", autoModeDecision: { score: 5, reasons: ["a"] } }),
      makeRecord({ runId: "r2", requestedPromptMode: "auto", promptMode: "compact", autoModeDecision: { score: 2, reasons: ["b"] } }),
      makeRecord({ runId: "r3", requestedPromptMode: "auto", promptMode: "compact", autoModeDecision: { score: 1, reasons: ["c"] } }),
      makeRecord({ runId: "r4", requestedPromptMode: "auto", promptMode: "minimal", autoModeDecision: { score: -1, reasons: ["d"] } }),
    ];
    const result = generateAutoModeSummary(records);
    expect(result.resolvedCounts).toEqual({ minimal: 1, compact: 2, full: 1 });
  });

  it("avgScore が正しい", () => {
    const records = [
      makeRecord({ runId: "r1", requestedPromptMode: "auto", promptMode: "full", autoModeDecision: { score: 6, reasons: ["a"] } }),
      makeRecord({ runId: "r2", requestedPromptMode: "auto", promptMode: "compact", autoModeDecision: { score: 2, reasons: ["b"] } }),
    ];
    const result = generateAutoModeSummary(records);
    // (6 + 2) / 2 = 4.0
    expect(result.avgScore).toBe(4);
  });

  it("avgScore が小数点1桁に丸められる", () => {
    const records = [
      makeRecord({ runId: "r1", requestedPromptMode: "auto", promptMode: "compact", autoModeDecision: { score: 1, reasons: ["a"] } }),
      makeRecord({ runId: "r2", requestedPromptMode: "auto", promptMode: "compact", autoModeDecision: { score: 2, reasons: ["b"] } }),
      makeRecord({ runId: "r3", requestedPromptMode: "auto", promptMode: "compact", autoModeDecision: { score: 3, reasons: ["c"] } }),
    ];
    const result = generateAutoModeSummary(records);
    // (1 + 2 + 3) / 3 = 2.0
    expect(result.avgScore).toBe(2);
  });

  it("reasons の頻度集計が正しい", () => {
    const records = [
      makeRecord({ runId: "r1", requestedPromptMode: "auto", promptMode: "full", autoModeDecision: { score: 5, reasons: ["Full_Keyword: schema (+1)", "Full_Keyword: auth (+1)"] } }),
      makeRecord({ runId: "r2", requestedPromptMode: "auto", promptMode: "full", autoModeDecision: { score: 4, reasons: ["Full_Keyword: schema (+1)", "Full_Keyword: migration (+1)"] } }),
      makeRecord({ runId: "r3", requestedPromptMode: "auto", promptMode: "compact", autoModeDecision: { score: 1, reasons: ["Full_Keyword: auth (+1)"] } }),
    ];
    const result = generateAutoModeSummary(records);

    expect(result.topReasons[0]).toEqual({ reason: "Full_Keyword: schema (+1)", count: 2 });
    expect(result.topReasons[1]).toEqual({ reason: "Full_Keyword: auth (+1)", count: 2 });
  });

  it("top5 制限が効く", () => {
    const reasons = ["r1", "r2", "r3", "r4", "r5", "r6", "r7"];
    const records = reasons.map((r, i) =>
      makeRecord({
        runId: `run-${i}`,
        requestedPromptMode: "auto",
        promptMode: "compact",
        autoModeDecision: { score: 1, reasons: [r] },
      }),
    );
    // Add extra occurrences to make some reasons more frequent
    records.push(makeRecord({ runId: "extra-1", requestedPromptMode: "auto", promptMode: "compact", autoModeDecision: { score: 1, reasons: ["r1", "r2", "r3", "r4", "r5"] } }));

    const result = generateAutoModeSummary(records);
    expect(result.topReasons.length).toBeLessThanOrEqual(5);
  });

  it("空配列で totalAutoRuns: 0 を返す", () => {
    const result = generateAutoModeSummary([]);
    expect(result.totalAutoRuns).toBe(0);
  });
});

describe("generateFullExperimentSummary", () => {
  const tempDirs: string[] = [];

  async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "full-summary-test-"));
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

  it("summary と autoSummary の両方を返す", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const studioDir = join(tempDir, ".studio");
    await mkdir(studioDir, { recursive: true });

    await writeFile(
      join(studioDir, "experiments.jsonl"),
      JSON.stringify({
        runId: "r1", timestamp: "2026-04-29T00:00:00.000Z", taskFile: "./task.md",
        mode: "studio", promptMode: "compact", promptPath: "p", publicLogPath: "l",
        tokenLedgerPath: "t", estimatedTokens: 1000,
        features: { tokenEconomy: true, antiRunaway: true, qualityGates: true, publicLog: true, tokenLedger: true },
        estimated: { taskChars: 100, promptChars: 4000, contextMode: "economy" },
        requestedPromptMode: "auto",
        autoModeDecision: { score: 2, reasons: ["Full_Keyword: API (+1)"] },
      }) + "\n",
    );

    await writeFile(join(studioDir, "token-ledger.jsonl"), "");

    const { summary, autoSummary } = await generateFullExperimentSummary();

    expect(summary.runs).toBe(1);
    expect(autoSummary.totalAutoRuns).toBe(1);
    expect(autoSummary.resolvedCounts.compact).toBe(1);
  });
});
