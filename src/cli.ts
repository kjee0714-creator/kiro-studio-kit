#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";
import { generatePrompt } from "./core/promptGenerator.js";
import type { RequestedPromptMode } from "./core/promptGenerator.js";
import { generateFullExperimentSummary, formatExperimentSummary } from "./core/experimentSummary.js";

const VALID_MODES: RequestedPromptMode[] = ["full", "compact", "minimal", "auto"];

function showUsage(): void {
  console.error(`Usage:
  kiro-studio-kit prompt <task-file> [--out <output-dir>] [--mode <full|compact|minimal|auto>] [--compact]
  kiro-studio-kit summary

Options:
  --out <dir>                              出力ディレクトリを指定する（デフォルト: outputs）
  --mode <full|compact|minimal|auto>       プロンプト生成モードを指定する（デフォルト: full）
  --compact                                コンパクトモードでプロンプトを生成する（後方互換、--mode compact と同等）

Development:
  npm run studio:prompt -- <task-file> [--out <output-dir>] [--mode <full|compact|minimal|auto>] [--compact]
  npm run studio:summary`);
}

/** CLI引数から --compact フラグを判定する */
export function parseCompactFlag(args: string[]): boolean {
  return args.includes("--compact");
}

/** CLI引数から --mode <value> を抽出する */
export function parseMode(args: string[]): { mode: RequestedPromptMode | null; invalid: string | null } {
  const modeIndex = args.indexOf("--mode");
  if (modeIndex === -1) {
    return { mode: null, invalid: null };
  }
  const value = args[modeIndex + 1];
  if (!value || value.startsWith("--")) {
    return { mode: null, invalid: "" };
  }
  if (VALID_MODES.includes(value as RequestedPromptMode)) {
    return { mode: value as RequestedPromptMode, invalid: null };
  }
  return { mode: null, invalid: value };
}

/** CLI引数から --out <dir> を抽出する */
function parseOutputDir(args: string[]): string | undefined {
  const outIndex = args.indexOf("--out");
  if (outIndex === -1) {
    return undefined;
  }
  const outDir = args[outIndex + 1];
  if (!outDir || outDir.startsWith("--")) {
    return undefined;
  }
  return outDir;
}

async function handlePrompt(args: string[]): Promise<void> {
  // Filter out known flags to find the task file path
  const positionalArgs = args.filter(
    (arg, i) =>
      i === 0 || // subcommand "prompt"
      (arg !== "--compact" &&
        arg !== "--out" &&
        !(i > 0 && args[i - 1] === "--out") &&
        arg !== "--mode" &&
        !(i > 0 && args[i - 1] === "--mode")),
  );
  const taskFilePath = positionalArgs[1];

  if (!taskFilePath || taskFilePath.startsWith("--")) {
    showUsage();
    process.exit(1);
  }

  const outputDir = parseOutputDir(args);
  const compact = parseCompactFlag(args);
  const { mode, invalid } = parseMode(args);

  if (invalid !== null) {
    console.error(`エラー: --mode に無効な値 "${invalid}" が指定されました。\n有効な値: full, compact, minimal, auto`);
    process.exit(1);
  }

  if (compact && mode !== null) {
    console.error(`警告: --compact と --mode が同時に指定されました。--mode "${mode}" を優先します。`);
  }

  const result = await generatePrompt(taskFilePath, outputDir, { compact, mode: mode ?? undefined });
  console.log(`✅ プロンプト: ${result.promptPath}`);
  console.log(`✅ 公開ログテンプレ: ${result.publicLogPath}`);
  if (result.tokenLedgerPath) {
    console.log(`✅ トークン台帳: ${result.tokenLedgerPath}`);
  }
  if (result.experimentLogPath) {
    console.log(`✅ 実験ログ: ${result.experimentLogPath}`);
  }
  if (result.autoModeDecision) {
    const { resolvedMode, reasons } = result.autoModeDecision;
    console.log(`🤖 auto mode: ${resolvedMode} selected 理由: ${reasons.join(", ")}`);
  }
  if (result.tokenReduction) {
    const { before, after, reductionPercent } = result.tokenReduction;
    console.log(
      `📊 トークン削減: ${before} → ${after} (${reductionPercent.toFixed(1)}% 削減)`,
    );
  }
}

async function handleSummary(): Promise<void> {
  const { summary, autoSummary } = await generateFullExperimentSummary();
  console.log(formatExperimentSummary(summary, autoSummary));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const subcommand = args[0];

  if (!subcommand) {
    showUsage();
    process.exit(1);
  }

  switch (subcommand) {
    case "prompt":
      await handlePrompt(args);
      break;
    case "summary":
      await handleSummary();
      break;
    default:
      showUsage();
      process.exit(1);
  }
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error: unknown) => {
    console.error(
      `予期しないエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
