#!/usr/bin/env node
import { generatePrompt } from "./core/promptGenerator.js";
import { generateExperimentSummary, formatExperimentSummary } from "./core/experimentSummary.js";

function showUsage(): void {
  console.error(`Usage:
  kiro-studio-kit prompt <task-file> [--out <output-dir>] [--compact]
  kiro-studio-kit summary

Options:
  --out <dir>   出力ディレクトリを指定する（デフォルト: outputs）
  --compact     コンパクトモードでプロンプトを生成し、トークン消費量を削減する

Development:
  npm run studio:prompt -- <task-file> [--out <output-dir>] [--compact]
  npm run studio:summary`);
}

/** CLI引数から --compact フラグを判定する */
export function parseCompactFlag(args: string[]): boolean {
  return args.includes("--compact");
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
        !(i > 0 && args[i - 1] === "--out")),
  );
  const taskFilePath = positionalArgs[1];

  if (!taskFilePath || taskFilePath.startsWith("--")) {
    showUsage();
    process.exit(1);
  }

  const outputDir = parseOutputDir(args);
  const compact = parseCompactFlag(args);

  const result = await generatePrompt(taskFilePath, outputDir, { compact });
  console.log(`✅ プロンプト: ${result.promptPath}`);
  console.log(`✅ 公開ログテンプレ: ${result.publicLogPath}`);
  if (result.tokenLedgerPath) {
    console.log(`✅ トークン台帳: ${result.tokenLedgerPath}`);
  }
  if (result.experimentLogPath) {
    console.log(`✅ 実験ログ: ${result.experimentLogPath}`);
  }
  if (result.tokenReduction) {
    const { before, after, reductionPercent } = result.tokenReduction;
    console.log(
      `📊 トークン削減: ${before} → ${after} (${reductionPercent.toFixed(1)}% 削減)`,
    );
  }
}

async function handleSummary(): Promise<void> {
  const summary = await generateExperimentSummary();
  console.log(formatExperimentSummary(summary));
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

main().catch((error: unknown) => {
  console.error(
    `予期しないエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
