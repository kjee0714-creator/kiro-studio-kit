import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { ExperimentRecord } from "../core/experimentLogger.js";
import type { TokenLedgerRecord } from "../core/tokenLedger.js";

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
