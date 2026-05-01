import path from "path";
import { appendJsonlRecord } from "./jsonlLogger.js";

/** トークン台帳の1レコード */
export interface TokenLedgerRecord {
  runId: string;
  timestamp: string;
  taskFile: string;
  mode: "economy";
  files: {
    taskFileChars: number;
    promptChars: number;
    publicLogTemplateChars: number;
  };
  estimatedTokens: {
    taskFile: number;
    prompt: number;
    publicLogTemplate: number;
    total: number;
  };
  limits: {
    contextFileLimit: number;
    changedFileLimit: number;
    retryLimit: number;
  };
  economyFeatures: {
    contextManifest: boolean;
    tokenEconomyRules: boolean;
    deltaReportOnly: boolean;
    stopOnRepeatedFailure: boolean;
  };
  compactMode?: {
    enabled: boolean;
    tokensSaved: number;
    reductionPercent: number;
  };
}

/**
 * 文字列からトークン数を推定する（軽量推定）。
 * ASCII文字: 1トークン ≒ 4文字
 * 非ASCII文字（日本語等）: 1トークン ≒ 1.5文字
 */
export function estimateTokensFromChars(text: string): number {
  if (text.length === 0) return 0;

  let asciiCount = 0;
  let nonAsciiCount = 0;

  for (const char of text) {
    if (char.charCodeAt(0) <= 0x7f) {
      asciiCount++;
    } else {
      nonAsciiCount++;
    }
  }

  const asciiTokens = asciiCount / 4;
  const nonAsciiTokens = nonAsciiCount / 1.5;

  return Math.ceil(asciiTokens + nonAsciiTokens);
}

/**
 * トークン台帳を .studio/token-ledger.jsonl に追記する。
 * @returns ログファイルのパス
 */
export async function appendTokenLedgerRecord(
  record: TokenLedgerRecord,
): Promise<string> {
  const logPath = path.join(process.cwd(), ".studio", "token-ledger.jsonl");
  return appendJsonlRecord(logPath, record, "トークン台帳");
}
