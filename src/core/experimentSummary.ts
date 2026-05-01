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

/** auto モード集計結果 */
export interface AutoModeSummary {
  totalAutoRuns: number;
  resolvedCounts: {
    minimal: number;
    compact: number;
    full: number;
  };
  avgScore: number;
  topReasons: Array<{ reason: string; count: number }>;
}

/**
 * .studio/ 配下のログファイルを読み込み、サマリーを生成する。
 * 公開API: ExperimentSummary を返す。
 */
export async function generateExperimentSummary(): Promise<ExperimentSummary> {
  const { summary } = await generateFullExperimentSummary();
  return summary;
}

/**
 * .studio/ 配下のログファイルを読み込み、サマリーと auto モード集計を生成する。
 * CLI 向け: ExperimentSummary と AutoModeSummary の両方を返す。
 */
export async function generateFullExperimentSummary(): Promise<{ summary: ExperimentSummary; autoSummary: AutoModeSummary }> {
  const studioDir = path.join(process.cwd(), ".studio");
  const experimentsPath = path.join(studioDir, "experiments.jsonl");
  const tokenLedgerPath = path.join(studioDir, "token-ledger.jsonl");

  const experiments = await readJsonlFile<ExperimentRecord>(experimentsPath);
  const tokenLedgers = await readJsonlFile<TokenLedgerRecord>(tokenLedgerPath);

  const runs = experiments.length;

  if (runs === 0) {
    return {
      summary: { runs: 0, avgTokens: 0, avgPromptSizeChars: 0, economyUsagePercent: 0 },
      autoSummary: generateAutoModeSummary([]),
    };
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
    summary: {
      runs,
      avgTokens: Math.round(totalTokens / runs),
      avgPromptSizeChars: Math.round(totalPromptChars / runs),
      economyUsagePercent: Math.round((economyCount / runs) * 100),
    },
    autoSummary: generateAutoModeSummary(experiments),
  };
}

/**
 * サマリーをフォーマットして文字列で返す。
 */
export function formatExperimentSummary(summary: ExperimentSummary, autoSummary?: AutoModeSummary): string {
  const lines = [
    `runs: ${summary.runs}`,
    `avg tokens: ${summary.avgTokens}`,
    `avg prompt size: ${summary.avgPromptSizeChars} chars`,
    `economy usage: ${summary.economyUsagePercent}%`,
  ];

  if (!autoSummary || autoSummary.totalAutoRuns === 0) {
    lines.push("", "auto usage: none");
  } else {
    lines.push(
      "",
      "auto usage:",
      `  total: ${autoSummary.totalAutoRuns}`,
      `  minimal: ${autoSummary.resolvedCounts.minimal}`,
      `  compact: ${autoSummary.resolvedCounts.compact}`,
      `  full: ${autoSummary.resolvedCounts.full}`,
      `  avg score: ${autoSummary.avgScore}`,
    );

    if (autoSummary.topReasons.length > 0) {
      lines.push("", "top reasons:");
      for (const { reason, count } of autoSummary.topReasons) {
        lines.push(`  ${reason}: ${count}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * ExperimentRecord 配列から auto モードの集計を生成する。
 */
export function generateAutoModeSummary(records: ExperimentRecord[]): AutoModeSummary {
  const autoRecords = records.filter((r) => r.requestedPromptMode === "auto");

  if (autoRecords.length === 0) {
    return {
      totalAutoRuns: 0,
      resolvedCounts: { minimal: 0, compact: 0, full: 0 },
      avgScore: 0,
      topReasons: [],
    };
  }

  const resolvedCounts = { minimal: 0, compact: 0, full: 0 };
  let totalScore = 0;
  const reasonFrequency = new Map<string, number>();

  for (const record of autoRecords) {
    // Count resolved modes
    const mode = record.promptMode;
    if (mode === "minimal" || mode === "compact" || mode === "full") {
      resolvedCounts[mode]++;
    }

    // Accumulate score
    if (record.autoModeDecision) {
      totalScore += record.autoModeDecision.score;

      // Count reasons
      for (const reason of record.autoModeDecision.reasons) {
        reasonFrequency.set(reason, (reasonFrequency.get(reason) ?? 0) + 1);
      }
    }
  }

  // Sort by frequency descending, take top 5
  const topReasons = Array.from(reasonFrequency.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const avgScore = Math.round((totalScore / autoRecords.length) * 10) / 10;

  return {
    totalAutoRuns: autoRecords.length,
    resolvedCounts,
    avgScore,
    topReasons,
  };
}
