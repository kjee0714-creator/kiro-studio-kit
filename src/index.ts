// kiro-studio-kit public API
export { parseTaskFile, assemblePrompt, assembleMinimalPrompt, generatePrompt, resolvePromptMode } from "./core/promptGenerator.js";
export type {
  PromptMode,
  RequestedPromptMode,
  ParsedTask,
  RoleTemplates,
  RuleTemplates,
  GenerateResult,
  ExperimentRecord,
  TokenLedgerRecord,
  GenerateOptions,
  TokenReduction,
  AutoModeDecision,
} from "./core/promptGenerator.js";
export {
  loadRoleTemplates,
  loadRuleTemplates,
  loadPublicLogTemplate,
  getTemplatesDir,
} from "./core/templateLoader.js";
export type { LoadRuleOptions } from "./core/templateLoader.js";
export { readTextFile, writeTextFile, fileExists } from "./core/fileUtils.js";
export { appendJsonlRecord, readJsonlFile } from "./core/jsonlLogger.js";
export { appendExperimentRecord } from "./core/experimentLogger.js";
export { appendTokenLedgerRecord, estimateTokensFromChars } from "./core/tokenLedger.js";
export { generateExperimentSummary, generateFullExperimentSummary, formatExperimentSummary, generateAutoModeSummary } from "./core/experimentSummary.js";
export type { ExperimentSummary, AutoModeSummary } from "./core/experimentSummary.js";
export { expandTemplate } from "./core/templateExpander.js";
export type { TemplateVariables } from "./core/templateExpander.js";
export { trimSection } from "./core/sectionTrimmer.js";
export { selectPromptModeFromTask } from "./core/autoModeResolver.js";
export { compactTransform } from "./core/compactTransformer.js";
export type { CompactOptions } from "./core/compactTransformer.js";
export { formatGateResults, determineSkippableGates } from "./core/qualityGateReporter.js";
export type { GateResult, QualityGateReport } from "./core/qualityGateReporter.js";
