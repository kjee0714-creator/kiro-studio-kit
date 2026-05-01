import path from "path";
import { randomUUID } from "crypto";
import type { RoleTemplates, RuleTemplates } from "./templateLoader.js";
import { readTextFile, writeTextFile } from "./fileUtils.js";
import {
  loadRoleTemplates,
  loadRuleTemplates,
  loadPublicLogTemplate,
} from "./templateLoader.js";
import { appendExperimentRecord } from "./experimentLogger.js";
import type { ExperimentRecord } from "./experimentLogger.js";
import { appendTokenLedgerRecord, estimateTokensFromChars } from "./tokenLedger.js";
import type { TokenLedgerRecord } from "./tokenLedger.js";
import { expandTemplate } from "./templateExpander.js";
import type { TemplateVariables } from "./templateExpander.js";
import { compactTransform } from "./compactTransformer.js";
import { trimSection } from "./sectionTrimmer.js";

export type { RoleTemplates, RuleTemplates } from "./templateLoader.js";
export type { ExperimentRecord } from "./experimentLogger.js";
export type { TokenLedgerRecord } from "./tokenLedger.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** generatePrompt のオプション */
export interface GenerateOptions {
  compact?: boolean;
}

/** コンパクトモード時のトークン削減情報 */
export interface TokenReduction {
  before: number;
  after: number;
  saved: number;
  reductionPercent: number;
}

/** generatePrompt の戻り値 */
export interface GenerateResult {
  promptPath: string;
  publicLogPath: string;
  experimentLogPath?: string;
  tokenLedgerPath?: string;
  tokenReduction?: TokenReduction;
}

/** task.md から抽出されたセクション */
export interface ParsedTask {
  goal: string;
  scope: string;
  nonGoals: string;
}

// ---------------------------------------------------------------------------
// Internal types (generation pipeline)
// ---------------------------------------------------------------------------

/** loadGenerationInputs の戻り値 */
interface GenerationInputs {
  taskFilePath: string;
  taskContent: string;
  parsedTask: ParsedTask;
  roles: RoleTemplates;
  rules: RuleTemplates;
  publicLogTemplate: string;
}

/** buildGenerationContents の戻り値 */
interface GenerationContents {
  promptContent: string;
  publicLogTemplate: string;
}

/** writeGenerationLogs のパラメータ */
interface GenerationLogParams {
  runId: string;
  timestamp: string;
  taskFilePath: string;
  taskContent: string;
  promptContent: string;
  publicLogTemplate: string;
  outputPaths: {
    promptPath: string;
    publicLogPath: string;
  };
  tokenReduction?: TokenReduction;
}

/** writeGenerationLogs の戻り値 */
interface GenerationLogPaths {
  tokenLedgerPath: string;
  experimentLogPath: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SCOPE =
  "（Scope は task.md に記載されていません。必要に応じて定義してください。）";

const DEFAULT_NON_GOALS =
  "（Non-goals は task.md に記載されていません。必要に応じて定義してください。）";

// ---------------------------------------------------------------------------
// Utility: regex escape
// ---------------------------------------------------------------------------

/**
 * 正規表現の特殊文字をエスケープする。
 */
export function escapeRegExp(str: string): string {
  return str.split("").map((ch) => {
    if (".*+?^${}()|[]\\".includes(ch)) {
      return "\\" + ch;
    }
    return ch;
  }).join("");
}

// ---------------------------------------------------------------------------
// Section extraction
// ---------------------------------------------------------------------------

function extractSection(
  content: string,
  sectionName: string,
): string | undefined {
  const escaped = escapeRegExp(sectionName);
  const pattern = new RegExp(
    `^## ${escaped}\\s*\\n([\\s\\S]*?)(?=^## |$)`,
    "m",
  );
  const match = pattern.exec(content);
  if (!match) {
    return undefined;
  }
  return match[1].trim();
}

export function parseTaskFile(content: string): ParsedTask {
  const goal = extractSection(content, "Goal") ?? "";
  const scope = extractSection(content, "Scope") ?? DEFAULT_SCOPE;
  const nonGoals = extractSection(content, "Non-goals") ?? DEFAULT_NON_GOALS;
  return { goal, scope, nonGoals };
}

// ---------------------------------------------------------------------------
// Prompt assembly (pure function)
// ---------------------------------------------------------------------------

export function assemblePrompt(
  task: ParsedTask,
  roles: RoleTemplates,
  rules?: RuleTemplates,
): string {
  let output = `# Kiro Prompt

## Goal
${task.goal}

## Scope
${task.scope}

## Non-goals
${task.nonGoals}

## Context Manifest
- Start by reading only files directly relevant to this task.
- If additional files are needed, explain why in one line before reading them.
- Do not read unrelated large files.
- Prefer summaries and local relevant sections over full-file inspection.

## Role Sequence

### 1. Director
${roles.director}

### 2. Architect
${roles.architect}

### 3. Implementer
${roles.implementer}

### 4. QA
${roles.qa}

## Implementation Rules
- Work in small steps.
- Do not rewrite unrelated code.
- Preserve existing public APIs unless explicitly requested.
- Prefer type-safe implementation.
- Do not trust LLM-generated outputs without validation.
- Add schema validation where external or ambiguous data crosses boundaries.
`;

  if (rules) {
    output += `
## Token Economy Rules
${rules.tokenEconomy}

## Anti-Runaway Rules
${rules.antiRunaway}

## Quality Gates
${rules.qualityGates}

## Completion Criteria
${rules.completionCriteria}

## Required Final Report
- Summary
- Changed files
- Tests executed
- Quality gate results
- Issues encountered
- Remaining risks
`;
  }

  return output;
}

// ---------------------------------------------------------------------------
// Generation pipeline: step functions
// ---------------------------------------------------------------------------

/**
 * Step 1: task.md と全テンプレートを読み込む。
 */
async function loadGenerationInputs(
  taskFilePath: string,
  options?: GenerateOptions,
): Promise<GenerationInputs> {
  const taskContent = await readTextFile(taskFilePath);
  const parsedTask = parseTaskFile(taskContent);
  const roles = await loadRoleTemplates();
  const rules = await loadRuleTemplates({ compact: options?.compact });
  const publicLogTemplate = await loadPublicLogTemplate();
  return { taskFilePath, taskContent, parsedTask, roles, rules, publicLogTemplate };
}

/**
 * Step 2: 入力からプロンプト本文を組み立てる（純粋関数）。
 * テンプレート内の {{variable}} を task.md の内容で展開する。
 */
function buildGenerationContents(inputs: GenerationInputs): GenerationContents {
  const variables: TemplateVariables = {
    goal: inputs.parsedTask.goal,
    scope: inputs.parsedTask.scope,
    nonGoals: inputs.parsedTask.nonGoals,
    qualityGates: inputs.rules.qualityGates,
    completionCriteria: inputs.rules.completionCriteria,
  };

  // ロールテンプレート内の変数を展開
  const expandedRoles: RoleTemplates = {
    director: expandTemplate(inputs.roles.director, variables),
    architect: expandTemplate(inputs.roles.architect, variables),
    implementer: expandTemplate(inputs.roles.implementer, variables),
    qa: expandTemplate(inputs.roles.qa, variables),
  };

  // ルールテンプレート内の変数を展開
  const expandedRules: RuleTemplates = {
    tokenEconomy: expandTemplate(inputs.rules.tokenEconomy, variables),
    antiRunaway: expandTemplate(inputs.rules.antiRunaway, variables),
    qualityGates: expandTemplate(inputs.rules.qualityGates, variables),
    completionCriteria: expandTemplate(inputs.rules.completionCriteria, variables),
  };

  const promptContent = assemblePrompt(inputs.parsedTask, expandedRoles, expandedRules);
  return { promptContent, publicLogTemplate: inputs.publicLogTemplate };
}

/**
 * Step 4: トークン台帳と実験ログを記録する。
 */
async function writeGenerationLogs(
  params: GenerationLogParams,
): Promise<GenerationLogPaths> {
  const taskFileChars = params.taskContent.length;
  const promptChars = params.promptContent.length;
  const publicLogTemplateChars = params.publicLogTemplate.length;
  const totalEstimatedTokens = estimateTokensFromChars(
    params.taskContent + params.promptContent + params.publicLogTemplate,
  );

  const tokenLedgerRecord: TokenLedgerRecord = {
    runId: params.runId,
    timestamp: params.timestamp,
    taskFile: params.taskFilePath,
    mode: "economy",
    files: { taskFileChars, promptChars, publicLogTemplateChars },
    estimatedTokens: {
      taskFile: estimateTokensFromChars(params.taskContent),
      prompt: estimateTokensFromChars(params.promptContent),
      publicLogTemplate: estimateTokensFromChars(params.publicLogTemplate),
      total: totalEstimatedTokens,
    },
    limits: { contextFileLimit: 5, changedFileLimit: 3, retryLimit: 2 },
    economyFeatures: {
      contextManifest: true,
      tokenEconomyRules: true,
      deltaReportOnly: true,
      stopOnRepeatedFailure: true,
    },
    ...(params.tokenReduction
      ? {
          compactMode: {
            enabled: true,
            tokensSaved: params.tokenReduction.saved,
            reductionPercent: params.tokenReduction.reductionPercent,
          },
        }
      : {}),
  };
  const tokenLedgerPath = await appendTokenLedgerRecord(tokenLedgerRecord);

  const experimentRecord: ExperimentRecord = {
    runId: params.runId,
    timestamp: params.timestamp,
    taskFile: params.taskFilePath,
    mode: "studio",
    promptPath: params.outputPaths.promptPath,
    publicLogPath: params.outputPaths.publicLogPath,
    tokenLedgerPath,
    estimatedTokens: totalEstimatedTokens,
    features: {
      tokenEconomy: true,
      antiRunaway: true,
      qualityGates: true,
      publicLog: true,
      tokenLedger: true,
    },
    estimated: {
      taskChars: taskFileChars,
      promptChars: promptChars,
      contextMode: "economy",
    },
  };
  const experimentLogPath = await appendExperimentRecord(experimentRecord);

  return { tokenLedgerPath, experimentLogPath };
}

// ---------------------------------------------------------------------------
// Output writing helpers
// ---------------------------------------------------------------------------

/**
 * プロンプトファイルを書き出す。
 */
async function writePromptFile(
  outputDir: string,
  content: string,
): Promise<string> {
  const promptPath = path.join(outputDir, "kiro-prompt.md");
  await writeTextFile(promptPath, content);
  return promptPath;
}

/**
 * 公開ログテンプレートを変数展開して書き出す。
 */
async function writePublicLogFile(
  outputDir: string,
  template: string,
  variables: TemplateVariables,
): Promise<string> {
  const expanded = expandTemplate(template, variables);
  const publicLogPath = path.join(outputDir, "public-log-template.md");
  await writeTextFile(publicLogPath, expanded);
  return publicLogPath;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** デフォルトの出力ディレクトリ */
const DEFAULT_OUTPUT_DIR = "outputs";

/**
 * メインのプロンプト生成フロー。
 *
 * @param taskFilePath - task.md のパス
 * @param outputDir - 出力ディレクトリ（省略時は "outputs"）
 * @param options - 生成オプション（省略時は通常モード）
 */
export async function generatePrompt(
  taskFilePath: string,
  outputDir?: string,
  options?: GenerateOptions,
): Promise<GenerateResult> {
  const resolvedOutputDir = path.resolve(outputDir ?? DEFAULT_OUTPUT_DIR);
  const inputs = await loadGenerationInputs(taskFilePath, options);
  const contents = buildGenerationContents(inputs);

  // コンパクトモード時: compactTransform → trimSection の順で圧縮し、トークン削減量を計算
  let finalPromptContent = contents.promptContent;
  let tokenReduction: TokenReduction | undefined;

  if (options?.compact) {
    const beforeTokens = estimateTokensFromChars(finalPromptContent);
    finalPromptContent = compactTransform(finalPromptContent);
    finalPromptContent = trimSection(finalPromptContent);
    const afterTokens = estimateTokensFromChars(finalPromptContent);
    const saved = beforeTokens - afterTokens;
    tokenReduction = {
      before: beforeTokens,
      after: afterTokens,
      saved,
      reductionPercent: beforeTokens > 0 ? (saved / beforeTokens) * 100 : 0,
    };
  }

  const promptPath = await writePromptFile(resolvedOutputDir, finalPromptContent);

  const runId = randomUUID();
  const timestamp = new Date().toISOString();

  const logPaths = await writeGenerationLogs({
    runId,
    timestamp,
    taskFilePath: inputs.taskFilePath,
    taskContent: inputs.taskContent,
    promptContent: finalPromptContent,
    publicLogTemplate: contents.publicLogTemplate,
    outputPaths: { promptPath, publicLogPath: "" },
    tokenReduction,
  });

  const publicLogPath = await writePublicLogFile(
    resolvedOutputDir,
    contents.publicLogTemplate,
    {
      runId,
      timestamp,
      taskFile: inputs.taskFilePath,
      goal: inputs.parsedTask.goal,
      scope: inputs.parsedTask.scope,
      nonGoals: inputs.parsedTask.nonGoals,
      promptPath,
      tokenLedgerPath: logPaths.tokenLedgerPath,
      experimentLogPath: logPaths.experimentLogPath,
    },
  );

  return {
    promptPath,
    publicLogPath,
    experimentLogPath: logPaths.experimentLogPath,
    tokenLedgerPath: logPaths.tokenLedgerPath,
    tokenReduction,
  };
}
