#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { generatePrompt } from "./core/promptGenerator.js";
import type { RequestedPromptMode } from "./core/promptGenerator.js";
import type { MemoryMode } from "./core/memoryValidator.js";
import { VALID_MEMORY_MODES } from "./core/memoryValidator.js";
import { generateFullExperimentSummary, formatExperimentSummary } from "./core/experimentSummary.js";
import { handleMemory } from "./core/memoryCommands.js";
import { loadExecutionGovernance } from "./core/executionGovernance.js";
import { PROMPT_BUDGET_LIMITS } from "./core/promptBudgetGate.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const VALID_MODES: RequestedPromptMode[] = ["full", "compact", "minimal", "auto"];

function showUsage(): void {
  console.error(`Usage:
  kiro-studio-kit prompt <task-file> [--out <output-dir>] [--mode <full|compact|minimal|auto>] [--memory <auto|off|full>] [--memory-report] [--compact]
  kiro-studio-kit memory add --kind <kind> --summary <text> --trigger <text> --fix <text> --hint <text> [options]
  kiro-studio-kit memory list
  kiro-studio-kit memory search <query>
  kiro-studio-kit memory health
  kiro-studio-kit governance inspect
  kiro-studio-kit summary

Options:
  --out <dir>                         Output directory (default: outputs)
  --mode <full|compact|minimal|auto>  Prompt generation mode (default: full)
  --memory <auto|off|full>            Memory injection mode (default: auto)
  --memory-report                     Show memory usage report after generation
  --compact                           Backward-compatible alias for --mode compact

Other:
  --help, -h                          Show help
  --version, -v                       Show version

Development:
  npm run studio:prompt -- <task-file> [--out <output-dir>] [--mode <full|compact|minimal|auto>] [--memory <auto|off|full>] [--compact]
  npm run studio:summary`);
}

/** CLI引数から --version / -v フラグを判定する */
export function parseVersionFlag(args: string[]): boolean {
  return args.includes("--version") || args.includes("-v");
}

/** CLI引数から --help / -h フラグを判定する */
export function parseHelpFlag(args: string[]): boolean {
  return args.includes("--help") || args.includes("-h");
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

/** CLI引数から --memory <value> を抽出する */
export function parseMemoryMode(args: string[]): { memory: MemoryMode | null; invalid: string | null } {
  const memoryIndex = args.indexOf("--memory");
  if (memoryIndex === -1) {
    return { memory: null, invalid: null };
  }
  const value = args[memoryIndex + 1];
  if (!value || value.startsWith("--")) {
    return { memory: null, invalid: "" };
  }
  if (VALID_MEMORY_MODES.includes(value as MemoryMode)) {
    return { memory: value as MemoryMode, invalid: null };
  }
  return { memory: null, invalid: value };
}

/** CLI引数から --memory-report フラグを判定する */
export function parseMemoryReportFlag(args: string[]): boolean {
  return args.includes("--memory-report");
}

async function handlePrompt(args: string[]): Promise<void> {
  // Filter out known flags to find the task file path
  const positionalArgs = args.filter(
    (arg, i) =>
      i === 0 || // subcommand "prompt"
      (arg !== "--compact" &&
        arg !== "--memory-report" &&
        arg !== "--out" &&
        !(i > 0 && args[i - 1] === "--out") &&
        arg !== "--mode" &&
        !(i > 0 && args[i - 1] === "--mode") &&
        arg !== "--memory" &&
        !(i > 0 && args[i - 1] === "--memory")),
  );
  const taskFilePath = positionalArgs[1];

  if (!taskFilePath || taskFilePath.startsWith("--")) {
    showUsage();
    process.exit(1);
  }

  const outputDir = parseOutputDir(args);
  const compact = parseCompactFlag(args);
  const { mode, invalid } = parseMode(args);
  const { memory, invalid: memoryInvalid } = parseMemoryMode(args);
  const memoryReport = parseMemoryReportFlag(args);

  if (invalid !== null) {
    console.error(`エラー: --mode に無効な値 "${invalid}" が指定されました。\n有効な値: full, compact, minimal, auto`);
    process.exit(1);
  }

  if (memoryInvalid !== null) {
    console.error(`エラー: --memory に無効な値 "${memoryInvalid}" が指定されました。\n有効な値: auto, off, full`);
    process.exit(1);
  }

  if (compact && mode !== null) {
    console.error(`警告: --compact と --mode が同時に指定されました。--mode "${mode}" を優先します。`);
  }

  const result = await generatePrompt(taskFilePath, outputDir, {
    compact,
    mode: mode ?? undefined,
    memory: memory ?? undefined,
  });
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

  // Memory report
  if (memoryReport && result.memoryMeta) {
    const meta = result.memoryMeta;
    console.log(`\n📊 Memory Report`);
    console.log(`  Mode: ${meta.mode} | Selected: ${meta.selectedCount} / ${meta.totalAvailable} available`);
    console.log(`  Injected chars: ${meta.totalSelectedChars ?? 0} | Top score: ${meta.topScore ?? 0}`);
    if (meta.selectedDetails && meta.selectedDetails.length > 0) {
      console.log("");
      for (let i = 0; i < meta.selectedDetails.length; i++) {
        const d = meta.selectedDetails[i];
        console.log(`  #${i + 1} [${d.kind}] ${d.summary} (score: ${d.score})`);
        const reasons = d.matchedReasons.map((r) => `${r.type}:${r.value}(${r.points > 0 ? "+" : ""}${r.points})`).join(", ");
        if (reasons) {
          console.log(`     Reasons: ${reasons}`);
        }
      }
    }
  }
}

async function handleSummary(): Promise<void> {
  const { summary, autoSummary } = await generateFullExperimentSummary();
  console.log(formatExperimentSummary(summary, autoSummary));
}

function handleBudgetInspect(): void {
  console.log("📊 Prompt Budget Gate\n");
  console.log("Modes:");
  for (const [mode, limits] of Object.entries(PROMPT_BUDGET_LIMITS)) {
    console.log(`  ${mode}:`);
    console.log(`    maxMemories: ${limits.maxMemories}`);
    console.log(`    includeFullHandoff: ${limits.includeFullHandoff}`);
    console.log(`    includeHandoffSummary: ${limits.includeHandoffSummary}`);
    console.log(`    qualityGateDetail: ${limits.qualityGateDetail}`);
  }
  console.log("\nAuto Risk Resolution:");
  console.log("  high risk → full");
  console.log("  medium risk → compact");
  console.log("  low risk → minimal");
  console.log("\nHigh-risk keywords: schema, validator, public api, persistence, audit, trust, security, migration, delete...");
  console.log("Low-risk keywords: typo, comment, format, small doc, minor test, readme...");
}

async function handleGovernanceInspect(): Promise<void> {
  const config = await loadExecutionGovernance();

  console.log("🏛️  Execution Governance\n");

  console.log(`Quality Gates (source: ${config.source.qualityGates}):`);
  console.log("  Required:");
  for (const gate of config.qualityGates.required) {
    console.log(`    - ${gate}`);
  }
  if (config.qualityGates.optional.length > 0) {
    console.log("  Optional:");
    for (const gate of config.qualityGates.optional) {
      console.log(`    - ${gate}`);
    }
  }
  console.log(`  Policy:`);
  console.log(`    allRequiredMustPass: ${config.qualityGates.policy.allRequiredMustPass}`);
  console.log(`    stopOnTypecheckFailure: ${config.qualityGates.policy.stopOnTypecheckFailure}`);
  console.log(`    stopOnLintFailure: ${config.qualityGates.policy.stopOnLintFailure}`);
  console.log(`    testFailureRequiresSummary: ${config.qualityGates.policy.testFailureRequiresSummary}`);

  console.log(`\nStop Conditions (source: ${config.source.stopConditions}):`);
  console.log(`  maxConsecutiveFailures: ${config.stopConditions.maxConsecutiveFailures}`);
  console.log(`  maxSameErrorRetries: ${config.stopConditions.maxSameErrorRetries}`);
  console.log(`  stopOnSpecAmbiguity: ${config.stopConditions.stopOnSpecAmbiguity}`);
  console.log(`  stopOnSchemaBreakingChange: ${config.stopConditions.stopOnSchemaBreakingChange}`);
  console.log(`  stopOnDataLossRisk: ${config.stopConditions.stopOnDataLossRisk}`);
  console.log(`  stopOnPublicApiBreakingChange: ${config.stopConditions.stopOnPublicApiBreakingChange}`);

  console.log(`\nEscalation Rules (source: ${config.source.escalationRules}):`);
  for (const line of config.escalationRules.split("\n")) {
    console.log(`  ${line}`);
  }

  if (config.warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${config.warnings.length}):`);
    for (const w of config.warnings) {
      console.log(`  - ${w}`);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // --version / -v takes priority
  if (parseVersionFlag(args)) {
    console.log(`kiro-studio-kit v${pkg.version}`);
    return;
  }

  // --help / -h
  if (parseHelpFlag(args)) {
    showUsage();
    return;
  }

  const subcommand = args[0];

  if (!subcommand) {
    showUsage();
    process.exit(1);
  }

  switch (subcommand) {
    case "prompt":
      await handlePrompt(args);
      break;
    case "memory":
      await handleMemory(args.slice(1));
      break;
    case "governance":
      await handleGovernanceInspect();
      break;
    case "budget":
      handleBudgetInspect();
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
