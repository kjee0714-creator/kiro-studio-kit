import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile, writeFile, stat, cp } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import type { ExperimentRecord } from "../core/experimentLogger.js";
import type { TokenLedgerRecord } from "../core/tokenLedger.js";
import { generatePrompt } from "../core/promptGenerator.js";
import type { GenerateResult } from "../core/promptGenerator.js";

describe("Integration: Experiment Logger + Token Ledger", () => {
  // These tests verify the runId linkage by directly calling appendExperimentRecord
  // and appendTokenLedgerRecord with the same runId, then verifying both logs contain it.

  const tempDirs: string[] = [];

  async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "integration-test-"));
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

  it("同一 runId が両ログに存在する", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { appendExperimentRecord } = await import("../core/experimentLogger.js");
    const { appendTokenLedgerRecord } = await import("../core/tokenLedger.js");

    const runId = "test-run-id-123";
    const timestamp = "2026-04-29T00:00:00.000Z";

    await appendTokenLedgerRecord({
      runId,
      timestamp,
      taskFile: "./task.md",
      mode: "economy",
      promptMode: "full",
      files: { taskFileChars: 100, promptChars: 4000, publicLogTemplateChars: 500 },
      estimatedTokens: { taskFile: 25, prompt: 1000, publicLogTemplate: 125, total: 1150 },
      limits: { contextFileLimit: 5, changedFileLimit: 3, retryLimit: 2 },
      economyFeatures: { contextManifest: true, tokenEconomyRules: true, deltaReportOnly: true, stopOnRepeatedFailure: true },
    });

    await appendExperimentRecord({
      runId,
      timestamp,
      taskFile: "./task.md",
      mode: "studio",
      promptMode: "full",
      promptPath: "outputs/kiro-prompt.md",
      publicLogPath: "outputs/public-log-template.md",
      tokenLedgerPath: ".studio/token-ledger.jsonl",
      estimatedTokens: 1150,
      features: { tokenEconomy: true, antiRunaway: true, qualityGates: true, publicLog: true, tokenLedger: true },
      estimated: { taskChars: 100, promptChars: 4000, contextMode: "economy" },
    });

    const expContent = await readFile(join(tempDir, ".studio", "experiments.jsonl"), "utf-8");
    const tlContent = await readFile(join(tempDir, ".studio", "token-ledger.jsonl"), "utf-8");

    const expRecord = JSON.parse(expContent.trim()) as ExperimentRecord;
    const tlRecord = JSON.parse(tlContent.trim()) as TokenLedgerRecord;

    expect(expRecord.runId).toBe(runId);
    expect(tlRecord.runId).toBe(runId);
    expect(expRecord.runId).toBe(tlRecord.runId);
  });

  it("2回実行で runId が異なる", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { appendExperimentRecord } = await import("../core/experimentLogger.js");

    await appendExperimentRecord({
      runId: "run-1",
      timestamp: "2026-04-29T01:00:00.000Z",
      taskFile: "./task.md",
      mode: "studio",
      promptMode: "full",
      promptPath: "outputs/kiro-prompt.md",
      publicLogPath: "outputs/public-log-template.md",
      tokenLedgerPath: ".studio/token-ledger.jsonl",
      estimatedTokens: 1000,
      features: { tokenEconomy: true, antiRunaway: true, qualityGates: true, publicLog: true, tokenLedger: true },
      estimated: { taskChars: 100, promptChars: 4000, contextMode: "economy" },
    });

    await appendExperimentRecord({
      runId: "run-2",
      timestamp: "2026-04-29T02:00:00.000Z",
      taskFile: "./task.md",
      mode: "studio",
      promptMode: "full",
      promptPath: "outputs/kiro-prompt.md",
      publicLogPath: "outputs/public-log-template.md",
      tokenLedgerPath: ".studio/token-ledger.jsonl",
      estimatedTokens: 1200,
      features: { tokenEconomy: true, antiRunaway: true, qualityGates: true, publicLog: true, tokenLedger: true },
      estimated: { taskChars: 100, promptChars: 4000, contextMode: "economy" },
    });

    const content = await readFile(join(tempDir, ".studio", "experiments.jsonl"), "utf-8");
    const lines = content.trim().split("\n");
    const record1 = JSON.parse(lines[0]) as ExperimentRecord;
    const record2 = JSON.parse(lines[1]) as ExperimentRecord;

    expect(record1.runId).not.toBe(record2.runId);
  });

  it("experiment が tokenLedgerPath を参照できる", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { appendExperimentRecord } = await import("../core/experimentLogger.js");

    await appendExperimentRecord({
      runId: "ref-test",
      timestamp: "2026-04-29T00:00:00.000Z",
      taskFile: "./task.md",
      mode: "studio",
      promptMode: "full",
      promptPath: "outputs/kiro-prompt.md",
      publicLogPath: "outputs/public-log-template.md",
      tokenLedgerPath: ".studio/token-ledger.jsonl",
      estimatedTokens: 1150,
      features: { tokenEconomy: true, antiRunaway: true, qualityGates: true, publicLog: true, tokenLedger: true },
      estimated: { taskChars: 100, promptChars: 4000, contextMode: "economy" },
    });

    const content = await readFile(join(tempDir, ".studio", "experiments.jsonl"), "utf-8");
    const record = JSON.parse(content.trim()) as ExperimentRecord;

    expect(record.tokenLedgerPath).toContain("token-ledger.jsonl");
    expect(record.estimatedTokens).toBe(1150);
    expect(record.features.tokenLedger).toBe(true);
  });
});


describe("Integration: Compact Mode", () => {
  const tempDirs: string[] = [];
  const taskFilePath = resolve("examples/task.md");
  const templatesDir = resolve("templates");

  async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "compact-integration-"));
    tempDirs.push(dir);
    // Copy templates into temp dir so templateLoader can find them
    await cp(templatesDir, join(dir, "templates"), { recursive: true });
    return dir;
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("compact: true で出力ファイルが生成される", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const outputDir = join(tempDir, "outputs");
    const result: GenerateResult = await generatePrompt(taskFilePath, outputDir, { compact: true });

    // プロンプトファイルが存在する
    const promptStat = await stat(result.promptPath);
    expect(promptStat.isFile()).toBe(true);

    // 公開ログファイルが存在する
    const publicLogStat = await stat(result.publicLogPath);
    expect(publicLogStat.isFile()).toBe(true);

    // トークン台帳ファイルが存在する
    expect(result.tokenLedgerPath).toBeDefined();
    const ledgerPath = result.tokenLedgerPath ?? "";
    const ledgerStat = await stat(ledgerPath);
    expect(ledgerStat.isFile()).toBe(true);
  });

  it("compact: true で生成されたプロンプトに見出し行が含まれない", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const outputDir = join(tempDir, "outputs");
    const result = await generatePrompt(taskFilePath, outputDir, { compact: true });

    const promptContent = await readFile(result.promptPath, "utf-8");
    const lines = promptContent.split("\n");
    const headingLines = lines.filter((line) => /^#+\s/.test(line));

    expect(headingLines).toHaveLength(0);
  });

  it("compact: true で TokenReduction が正しく返される", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const outputDir = join(tempDir, "outputs");
    const result = await generatePrompt(taskFilePath, outputDir, { compact: true });

    expect(result.tokenReduction).toBeDefined();
    const reduction = result.tokenReduction ?? { before: 0, after: 0, saved: 0, reductionPercent: 0 };

    expect(reduction.before).toBeGreaterThan(0);
    expect(reduction.after).toBeGreaterThan(0);
    expect(reduction.saved).toBeGreaterThanOrEqual(0);
    expect(reduction.before).toBe(reduction.after + reduction.saved);
    expect(reduction.reductionPercent).toBeGreaterThanOrEqual(0);
    expect(reduction.reductionPercent).toBeLessThanOrEqual(100);
  });

  it("compact: true で Token Ledger に compactMode 情報が記録される", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const outputDir = join(tempDir, "outputs");
    const result = await generatePrompt(taskFilePath, outputDir, { compact: true });

    const ledgerContent = await readFile(result.tokenLedgerPath ?? "", "utf-8");
    const lastLine = ledgerContent.trim().split("\n").pop() ?? "";
    const ledgerRecord = JSON.parse(lastLine) as TokenLedgerRecord;

    expect(ledgerRecord.compactMode).toBeDefined();
    const compactMode = ledgerRecord.compactMode ?? { enabled: false, tokensSaved: 0, reductionPercent: 0 };
    expect(compactMode.enabled).toBe(true);
    expect(compactMode.tokensSaved).toBeGreaterThanOrEqual(0);
    expect(compactMode.reductionPercent).toBeGreaterThanOrEqual(0);
    expect(compactMode.reductionPercent).toBeLessThanOrEqual(100);

    // TokenReduction と Token Ledger の値が一致する
    const tokenReduction = result.tokenReduction ?? { saved: 0, reductionPercent: 0, before: 0, after: 0 };
    expect(compactMode.tokensSaved).toBe(tokenReduction.saved);
    expect(compactMode.reductionPercent).toBe(tokenReduction.reductionPercent);
  });

  it("compact 省略時に従来通りの動作である", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const outputDir = join(tempDir, "outputs");
    const result = await generatePrompt(taskFilePath, outputDir);

    // 出力ファイルが生成される
    const promptStat = await stat(result.promptPath);
    expect(promptStat.isFile()).toBe(true);

    // tokenReduction は undefined
    expect(result.tokenReduction).toBeUndefined();

    // プロンプトに見出し行が保持されている
    const promptContent = await readFile(result.promptPath, "utf-8");
    expect(promptContent).toContain("## Goal");
    expect(promptContent).toContain("## Scope");
    expect(promptContent).toContain("### 1. Director");
    expect(promptContent).toContain("## Token Economy Rules");
    expect(promptContent).toContain("## Quality Gates");

    // Token Ledger に compactMode が記録されていない
    const ledgerContent = await readFile(result.tokenLedgerPath ?? "", "utf-8");
    const lastLine = ledgerContent.trim().split("\n").pop() ?? "";
    const ledgerRecord = JSON.parse(lastLine) as TokenLedgerRecord;
    expect(ledgerRecord.compactMode).toBeUndefined();
  });
});


describe("Integration: Auto Mode", () => {
  const tempDirs: string[] = [];
  const templatesDir = resolve("templates");

  async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "auto-integration-"));
    tempDirs.push(dir);
    // Copy templates into temp dir so templateLoader can find them
    await cp(templatesDir, join(dir, "templates"), { recursive: true });
    return dir;
  }

  async function createTaskFile(dir: string, content: string): Promise<string> {
    const taskPath = join(dir, "task.md");
    await writeFile(taskPath, content, "utf-8");
    return taskPath;
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("--mode auto でのプロンプト生成テスト", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const taskPath = await createTaskFile(tempDir, `# Task

## Goal
Implement a new feature with API integration and schema migration.

## Scope
Update the auth module and DB schema.

## Non-goals
Do not change the UI.
`);

    const outputDir = join(tempDir, "outputs");
    const result: GenerateResult = await generatePrompt(taskPath, outputDir, { mode: "auto" });

    // autoModeDecision が存在する
    expect(result.autoModeDecision).toBeDefined();
    const decision = result.autoModeDecision ?? { resolvedMode: "", score: 0, reasons: [], requestedMode: "auto" as const };

    // resolvedMode が有効な PromptMode である
    expect(["full", "compact", "minimal"]).toContain(decision.resolvedMode);

    // score が数値である
    expect(typeof decision.score).toBe("number");

    // reasons が空でない
    expect(decision.reasons.length).toBeGreaterThanOrEqual(1);

    // プロンプトファイルが生成される
    const promptStat = await stat(result.promptPath);
    expect(promptStat.isFile()).toBe(true);
  });

  it("auto モード時の実験ログに requestedPromptMode と autoModeDecision が記録されること", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const taskPath = await createTaskFile(tempDir, `# Task

## Goal
Refactor the architecture for better design.

## Scope
Multiple files need changes.

## Non-goals
No breaking changes.
`);

    const outputDir = join(tempDir, "outputs");
    await generatePrompt(taskPath, outputDir, { mode: "auto" });

    // 実験ログを読み込む
    const expContent = await readFile(join(tempDir, ".studio", "experiments.jsonl"), "utf-8");
    const lines = expContent.trim().split("\n");
    const lastRecord = JSON.parse(lines[lines.length - 1]) as ExperimentRecord;

    // requestedPromptMode が "auto" である
    expect(lastRecord.requestedPromptMode).toBe("auto");

    // autoModeDecision が記録されている
    expect(lastRecord.autoModeDecision).toBeDefined();
    const autoDecision = lastRecord.autoModeDecision ?? { score: 0, reasons: [] };

    // score が数値である
    expect(typeof autoDecision.score).toBe("number");

    // reasons が空でない配列である
    expect(Array.isArray(autoDecision.reasons)).toBe(true);
    expect(autoDecision.reasons.length).toBeGreaterThanOrEqual(1);
  });

  it("auto モード時のトークン台帳に requestedPromptMode が記録されること", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const taskPath = await createTaskFile(tempDir, `# Task

## Goal
Fix a typo in the README.

## Scope
Single file change.

## Non-goals
Nothing else.
`);

    const outputDir = join(tempDir, "outputs");
    await generatePrompt(taskPath, outputDir, { mode: "auto" });

    // トークン台帳を読み込む
    const tlContent = await readFile(join(tempDir, ".studio", "token-ledger.jsonl"), "utf-8");
    const lines = tlContent.trim().split("\n");
    const lastRecord = JSON.parse(lines[lines.length - 1]) as TokenLedgerRecord;

    // requestedPromptMode が "auto" である
    expect(lastRecord.requestedPromptMode).toBe("auto");
  });
});
