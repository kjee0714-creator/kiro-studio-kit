/**
 * Integration tests for memory injection in prompt generation.
 * Tests end-to-end: generatePrompt with --memory modes.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile, readFile } from "fs/promises";
import path from "path";
import { generatePrompt } from "../core/promptGenerator.js";
import { appendMemoryEntry } from "../core/memoryStore.js";
import { readJsonlFile } from "../core/jsonlLogger.js";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import type { ExperimentRecord } from "../core/experimentLogger.js";

const TEST_DIR = ".test-tmp/memoryIntegration";
const TASK_FILE = path.join(TEST_DIR, "task.md");
const OUTPUT_DIR = path.join(TEST_DIR, "outputs");
const MEMORY_STORE = ".kiro/ksk/dev-memory.jsonl";

const testEntry: DevMemoryEntry = {
  id: "integration-test-001",
  createdAt: new Date().toISOString(),
  kind: "test_fix",
  summary: "Always check return values in integration tests",
  trigger: "Integration test failed silently",
  fix: "Added explicit assertions for return values",
  futurePromptHint: "Add assertions for all return values in integration tests",
  relatedFiles: ["src/__tests__/integration.test.ts"],
  relatedSymbols: ["generatePrompt"],
  tags: ["integration", "testing"],
  severity: "high",
  confidence: "high",
  enabled: true,
};

const taskContent = `# Task
## Goal
Fix the integration test for generatePrompt function.

## Scope
- src/__tests__/integration.test.ts
- testing improvements
`;

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
  await writeFile(TASK_FILE, taskContent, "utf-8");
  // Add a memory entry that should match the task
  await appendMemoryEntry(testEntry);
});

afterEach(async () => {
  try {
    await rm(TEST_DIR, { recursive: true, force: true });
    await rm(MEMORY_STORE, { force: true });
  } catch {
    // ignore
  }
});

describe("Memory injection integration", () => {
  it("should inject memory section with --memory auto when entries match", async () => {
    const result = await generatePrompt(TASK_FILE, OUTPUT_DIR, { memory: "auto" });
    const promptContent = await readFile(result.promptPath, "utf-8");
    expect(promptContent).toContain("## Development Memory / 再発防止メモ");
    expect(promptContent).toContain("Always check return values in integration tests");
  });

  it("should NOT inject memory section with --memory off", async () => {
    const result = await generatePrompt(TASK_FILE, OUTPUT_DIR, { memory: "off" });
    const promptContent = await readFile(result.promptPath, "utf-8");
    expect(promptContent).not.toContain("## Development Memory / 再発防止メモ");
  });

  it("should inject memory section with --memory full", async () => {
    const result = await generatePrompt(TASK_FILE, OUTPUT_DIR, { memory: "full" });
    const promptContent = await readFile(result.promptPath, "utf-8");
    expect(promptContent).toContain("## Development Memory / 再発防止メモ");
  });

  it("should record developmentMemory in experiment log", async () => {
    await generatePrompt(TASK_FILE, OUTPUT_DIR, { memory: "auto" });
    const logPath = path.join(process.cwd(), ".studio", "experiments.jsonl");
    const records = await readJsonlFile<ExperimentRecord>(logPath);
    const lastRecord = records[records.length - 1];
    expect(lastRecord.developmentMemory).toBeDefined();
    const devMem = lastRecord.developmentMemory as NonNullable<typeof lastRecord.developmentMemory>;
    expect(devMem.mode).toBe("auto");
    expect(devMem.selectedIds).toContain("integration-test-001");
    expect(devMem.selectedCount).toBeGreaterThan(0);
    expect(typeof devMem.totalAvailable).toBe("number");
  });

  it("should record developmentMemory with mode off in experiment log", async () => {
    await generatePrompt(TASK_FILE, OUTPUT_DIR, { memory: "off" });
    const logPath = path.join(process.cwd(), ".studio", "experiments.jsonl");
    const records = await readJsonlFile<ExperimentRecord>(logPath);
    const lastRecord = records[records.length - 1];
    expect(lastRecord.developmentMemory).toBeDefined();
    const devMem = lastRecord.developmentMemory as NonNullable<typeof lastRecord.developmentMemory>;
    expect(devMem.mode).toBe("off");
    expect(devMem.selectedCount).toBe(0);
    expect(devMem.selectedIds).toEqual([]);
  });
});
