/**
 * 品質ゲートの結果をトークン効率の高いフォーマットで報告するモジュール。
 * - 成功: 1行サマリー（ゲート名 + PASS + 所要時間）
 * - 失敗: 詳細（エラー内容・修正内容・再実行結果）
 * - スキップ: 1行（ゲート名 + SKIP + 理由）
 */

export interface GateResult {
  name: string;
  status: "pass" | "fail" | "skip";
  durationMs?: number;
  error?: string;
  fix?: string;
  retryResult?: "pass" | "fail";
  skipReason?: string;
}

export interface QualityGateReport {
  results: GateResult[];
  format: "compact" | "full";
}

/**
 * 品質ゲート結果を構造化フォーマット（Markdown テーブル）で出力する。
 * - 成功: | name | PASS | durationMs |
 * - 失敗: | name | FAIL | durationMs | に続けて Error/Fix/Retry 行
 * - スキップ: | name | SKIP | skipReason |
 */
export function formatGateResults(report: QualityGateReport): string {
  const lines: string[] = ["| Gate | Result | Duration |", "|---|---|---|"];

  for (const gate of report.results) {
    if (gate.status === "pass") {
      lines.push(`| ${gate.name} | PASS | ${gate.durationMs ?? "-"}ms |`);
    } else if (gate.status === "skip") {
      lines.push(`| ${gate.name} | SKIP | ${gate.skipReason ?? ""} |`);
    } else {
      lines.push(`| ${gate.name} | FAIL | ${gate.durationMs ?? "-"}ms |`);
      if (gate.error) lines.push(`  Error: ${gate.error}`);
      if (gate.fix) lines.push(`  Fix: ${gate.fix}`);
      if (gate.retryResult) lines.push(`  Retry: ${gate.retryResult.toUpperCase()}`);
    }
  }

  return lines.join("\n");
}

/**
 * 変更対象ファイルの拡張子が `.md` のみの場合、
 * typecheck・lint・build をスキップ対象として判定する。
 */
export function determineSkippableGates(changedFiles: string[]): string[] {
  if (changedFiles.length === 0) {
    return [];
  }

  const allMarkdown = changedFiles.every((f) => f.endsWith(".md"));
  if (allMarkdown) {
    return ["typecheck", "lint", "build"];
  }

  return [];
}
