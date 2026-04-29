import { describe, it, expect, afterEach } from "vitest";
import { appendExperimentRecord } from "../core/experimentLogger.js";
import type { ExperimentRecord } from "../core/experimentLogger.js";
import { mkdtemp, rm, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { vi } from "vitest";

describe("experimentLogger", () => {
  const tempDirs: string[] = [];

  async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "experiment-test-"));
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

  function createSampleRecord(
    overrides?: Partial<ExperimentRecord>,
  ): ExperimentRecord {
    return {
      runId: "test-run-id-000",
      timestamp: "2026-04-29T00:00:00.000Z",
      taskFile: "./examples/task.md",
      mode: "studio",
      promptPath: "outputs/kiro-prompt.md",
      publicLogPath: "outputs/public-log-template.md",
      tokenLedgerPath: ".studio/token-ledger.jsonl",
      estimatedTokens: 1150,
      features: {
        tokenEconomy: true,
        antiRunaway: true,
        qualityGates: true,
        publicLog: true,
        tokenLedger: true,
      },
      estimated: {
        taskChars: 100,
        promptChars: 4000,
        contextMode: "economy",
      },
      ...overrides,
    };
  }

  it("appendExperimentRecord が .studio/experiments.jsonl に1行追記する", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const record = createSampleRecord();
    const logPath = await appendExperimentRecord(record);

    expect(logPath).toContain("experiments.jsonl");
    const content = await readFile(logPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(1);
  });

  it("複数回実行するとJSONLとして複数行になる", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const record1 = createSampleRecord({
      timestamp: "2026-04-29T01:00:00.000Z",
    });
    const record2 = createSampleRecord({
      timestamp: "2026-04-29T02:00:00.000Z",
    });
    await appendExperimentRecord(record1);
    await appendExperimentRecord(record2);

    const logPath = join(tempDir, ".studio", "experiments.jsonl");
    const content = await readFile(logPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
  });

  it("追記されたJSONが ExperimentRecord としてparseできる", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const record = createSampleRecord();
    const logPath = await appendExperimentRecord(record);

    const content = await readFile(logPath, "utf-8");
    const parsed = JSON.parse(content.trim()) as ExperimentRecord;
    expect(parsed.timestamp).toBe("2026-04-29T00:00:00.000Z");
    expect(parsed.mode).toBe("studio");
    expect(parsed.features.tokenEconomy).toBe(true);
    expect(parsed.estimated.contextMode).toBe("economy");
  });

  it(".studio/ ディレクトリが存在しない場合に自動作成する", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const record = createSampleRecord();
    const logPath = await appendExperimentRecord(record);

    expect(logPath).toContain(".studio");
    const content = await readFile(logPath, "utf-8");
    expect(content.length).toBeGreaterThan(0);
  });

  it("runId が記録される", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const record = createSampleRecord({ runId: "unique-run-id-abc" });
    const logPath = await appendExperimentRecord(record);

    const content = await readFile(logPath, "utf-8");
    const parsed = JSON.parse(content.trim()) as ExperimentRecord;
    expect(parsed.runId).toBe("unique-run-id-abc");
  });

  it("tokenLedgerPath が記録される", async () => {
    const tempDir = await createTempDir();
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const record = createSampleRecord({
      tokenLedgerPath: ".studio/token-ledger.jsonl",
    });
    const logPath = await appendExperimentRecord(record);

    const content = await readFile(logPath, "utf-8");
    const parsed = JSON.parse(content.trim()) as ExperimentRecord;
    expect(parsed.tokenLedgerPath).toBe(".studio/token-ledger.jsonl");
    expect(parsed.estimatedTokens).toBe(1150);
    expect(parsed.features.tokenLedger).toBe(true);
  });
});
