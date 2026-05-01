import path from "path";
import { appendJsonlRecord } from "./jsonlLogger.js";
import type { PromptMode } from "./promptGenerator.js";

/** 実験ログの1レコード */
export interface ExperimentRecord {
  runId: string;
  timestamp: string;
  taskFile: string;
  mode: "studio";
  promptMode: PromptMode;
  promptPath: string;
  publicLogPath: string;
  tokenLedgerPath: string;
  estimatedTokens: number;
  features: {
    tokenEconomy: boolean;
    antiRunaway: boolean;
    qualityGates: boolean;
    publicLog: boolean;
    tokenLedger: boolean;
  };
  estimated: {
    taskChars: number;
    promptChars: number;
    contextMode: "economy";
  };
}

/**
 * 実験ログを .studio/experiments.jsonl に追記する。
 * @returns ログファイルのパス
 */
export async function appendExperimentRecord(
  record: ExperimentRecord,
): Promise<string> {
  const logPath = path.join(process.cwd(), ".studio", "experiments.jsonl");
  return appendJsonlRecord(logPath, record, "実験ログ");
}
