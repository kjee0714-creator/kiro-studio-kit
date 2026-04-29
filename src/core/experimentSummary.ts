import path from "path";
import { readJsonlFile } from "./jsonlLogger.js";
import type { ExperimentRecord } from "./experimentLogger.js";
import type { TokenLedgerRecord } from "./tokenLedger.js";

/** サマリー結果 */
export interface ExperimentSummary {
  runs: number;
  avgTokens: number;
  avgPromptSizeChars: number;
  economyUsagePercent: number;
}

/**
 * .studio/ 配下のログファイルを読み込み、サマリーを生成する。
 */
export async function generateExperimentSummary(): Promise<ExperimentSummary> {
  const studioDir = path.join(process.cwd(), ".studio");
  const experimentsPath = path.join(studioDir, "experiments.jsonl");
  const tokenLedgerPath = path.join(studioDir, "token-ledger.jsonl");

  const experiments = await readJsonlFile<ExperimentRecord>(experimentsPath);
  const tokenLedgers = await readJsonlFile<TokenLedgerRecord>(tokenLedgerPath);

  const runs = experiments.length;

  if (runs === 0) {
    return { runs: 0, avgTokens: 0, avgPromptSizeChars: 0, economyUsagePercent: 0 };
  }

  // runId で token ledger を索引化
  const ledgerByRunId = new Map<string, TokenLedgerRecord>();
  for (const tl of tokenLedgers) {
    if (tl.runId) {
      ledgerByRunId.set(tl.runId, tl);
    }
  }

  // 統計計算
  let totalTokens = 0;
  let totalPromptChars = 0;
  let economyCount = 0;

  for (const exp of experiments) {
    const ledger = exp.runId ? ledgerByRunId.get(exp.runId) : undefined;
    if (ledger) {
      totalTokens += ledger.estimatedTokens.total;
    } else {
      totalTokens += exp.estimatedTokens;
    }

    totalPromptChars += exp.estimated.promptChars;

    if (exp.estimated.contextMode === "economy") {
      economyCount++;
    }
  }

  return {
    runs,
    avgTokens: Math.round(totalTokens / runs),
    avgPromptSizeChars: Math.round(totalPromptChars / runs),
    economyUsagePercent: Math.round((economyCount / runs) * 100),
  };
}

/**
 * サマリーをフォーマットして文字列で返す。
 */
export function formatExperimentSummary(summary: ExperimentSummary): string {
  return [
    `runs: ${summary.runs}`,
    `avg tokens: ${summary.avgTokens}`,
    `avg prompt size: ${summary.avgPromptSizeChars} chars`,
    `economy usage: ${summary.economyUsagePercent}%`,
  ].join("\n");
}
