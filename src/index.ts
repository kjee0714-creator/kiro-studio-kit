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

// Development Memory
export { validateDevMemoryEntry, isValidDevMemoryEntry, VALID_KINDS, VALID_SEVERITIES, VALID_CONFIDENCES, VALID_MEMORY_MODES } from "./core/memoryValidator.js";
export type { DevMemoryEntry, DevMemoryKind, Severity, Confidence, MemoryMode, ValidationResult, MemoryUsageStats } from "./core/memoryValidator.js";
export { checkForSecrets, SECRET_PATTERNS } from "./core/secretsGuard.js";
export { readMemoryEntries, appendMemoryEntry, rewriteMemoryEntries, backupMemoryStore, MEMORY_STORE_PATH } from "./core/memoryStore.js";
export { scoreEntry, scoreEntryDetailed, selectMemoryEntries, filterEntries, estimateEntryChars } from "./core/memorySelector.js";
export type { ScoredEntry, SelectionResult, MemoryMatchReason, ScoredMemoryEntry, ExcludedReasons } from "./core/memorySelector.js";
export { formatMemorySection, injectMemorySection } from "./core/memoryInjector.js";
export type { MemoryInjectionMeta } from "./core/memoryInjector.js";
export { handleMemoryInspect, handleMemoryStats, handleMemoryDisable, handleMemoryEnable, handleMemoryDelete, handleMemorySupersede, handleMemoryPrune, handleMemoryCompact, handleMemoryHistory, handleMemoryHealth } from "./core/memoryCommands.js";
export { classifyPruneCandidates, deriveHistory } from "./core/memoryLifecycle.js";
export type { PruneClassification, LifecycleEvent } from "./core/memoryLifecycle.js";

// Memory Health Monitor
export { calculateMemoryHealth, findDuplicateClusters } from "./core/memoryHealth.js";
export type { MemoryHealthLevel, MemoryHealthFindingType, MemoryHealthFindingSeverity, MemoryHealthFinding, MemoryHealthReport } from "./core/memoryHealth.js";

// Auto Capture Governance
export { extractCaptureSignals, generateCaptureCandidates, assessCaptureCandidate, decideCaptureStatus, findSimilarMemory, redactCaptureText, isAllowedCaptureKind, ALLOWED_CAPTURE_KINDS } from "./core/memoryCapture.js";
export type { CaptureSignals, MemoryCaptureCandidate, CaptureDecision } from "./core/memoryCapture.js";
export type { MemorySource, CaptureStatus, TrustLevel, MemoryAuthority, CaptureEvidence, CaptureAssessment } from "./core/memoryValidator.js";
export { VALID_SOURCES, VALID_CAPTURE_STATUSES, VALID_TRUST_LEVELS, VALID_AUTHORITIES } from "./core/memoryValidator.js";
export { readPendingMemoryEntries, appendPendingMemoryEntry, clearPendingStore, rewritePendingMemoryEntries, PENDING_STORE_PATH } from "./core/memoryStore.js";
export { handleMemoryCapture, handleMemoryPending, handlePendingPromote, handlePendingInspect, handlePendingPromoteAll, handlePendingDiscard, handlePendingPrune, handlePendingStats, handleTrustUpgrade, handleTrustDegrade, handleTrustAudit, handleTrustLifecycle, handleTrustVerify } from "./core/memoryCommands.js";

// Trust Assessment (Phase 4-C)
export { assessMemoryTrust, recordMemorySelection, recordMemorySelectionSuccess, recordMemorySelectionRejection } from "./core/memoryTrust.js";
export type { TrustAssessment, TrustContext } from "./core/memoryTrust.js";

// Trust Lifecycle (Phase 4-H)
export { assessTrustLifecycleAction, applyTrustLifecycleDecision } from "./core/memoryTrust.js";
export type { TrustLifecycleAction, TrustLifecycleDecision } from "./core/memoryTrust.js";

// Usage Stats Persistence (Phase 4-D)
export { persistMemorySelections, markMemorySelectionSuccess, markMemorySelectionRejected } from "./core/memoryUsagePersistence.js";
export type { UsagePersistenceResult, MemoryFeedbackResult } from "./core/memoryUsagePersistence.js";
export { handleMemoryUsageStats, handleMemoryUsageReset, handleMemoryUsageMarkSuccess, handleMemoryUsageMarkRejected } from "./core/memoryCommands.js";

// Memory Audit Trail (Phase 4-E)
export { appendMemoryAuditEvent, readMemoryAuditEvents, findMemoryAuditEvents, AUDIT_LOG_PATH, VALID_AUDIT_EVENT_TYPES, VALID_AUDIT_ACTORS } from "./core/memoryAuditLog.js";
export type { MemoryAuditEvent, MemoryAuditEventType, MemoryAuditActor } from "./core/memoryAuditLog.js";
export { handleMemoryAuditLog, handleMemoryAuditInspect } from "./core/memoryCommands.js";

// Pending Operations (Phase 4-F)
export { isPendingEntry, promotePendingEntry, promoteAllPendingEntries, discardPendingEntry, classifyPrunePendingCandidates, applyPrunePendingEntries, computePendingStats } from "./core/pendingOperations.js";
export type { PendingPromoteResult, PendingDiscardResult, PendingPruneCandidate, PendingStatsResult } from "./core/pendingOperations.js";

// Memory Injection Policy (Phase 4-I)
export { applyMemoryInjectionPolicy, isHighRejectionMemory, isAutoCapturedMemory, getTrustPriority, DEFAULT_MEMORY_INJECTION_POLICY } from "./core/memoryInjectionPolicy.js";
export type { MemoryInjectionPolicyConfig, MemoryInjectionPolicyDecision, MemoryInjectionPolicyResult } from "./core/memoryInjectionPolicy.js";

// Memory Conflict Management (Phase 4-K)
export { isSupersededMemory, groupByConflictGroup, selectConflictWinners, supersedeMemory, setMemoryConflictGroup } from "./core/memoryConflict.js";
export type { SupersedeResult, SetConflictGroupResult } from "./core/memoryConflict.js";
export { handleMemoryConflict } from "./core/memoryCommands.js";

// Memory Duplicate Management (Phase 4-L)
export { isDuplicateMemory, isMergedMemory, getCanonicalMemoryId, listDuplicateGroups, findDuplicateInfo, markMemoryDuplicate, clearMemoryDuplicate } from "./core/memoryDuplicate.js";
export type { MarkDuplicateResult, ClearDuplicateResult } from "./core/memoryDuplicate.js";
export { handleMemoryDuplicate } from "./core/memoryCommands.js";

// Memory Scope / Project Separation (Phase 4-M)
export { isMemoryInScope, getScopeExclusionReason, loadMemoryScopeContext, setMemoryScope, DEFAULT_MEMORY_SCOPE_CONTEXT, MEMORY_SCOPE_PATH } from "./core/memoryScope.js";
export type { MemoryScope, MemoryScopeContext, MemoryScopeUpdateResult } from "./core/memoryScope.js";
export { handleMemoryScope } from "./core/memoryCommands.js";

// Memory Decay / Expiry (Phase 4-N)
export { isExpiredMemory, isStaleMemory, isReviewDueMemory, getMemoryDecayStatus, markMemoryReviewed, setMemoryExpiry, disableExpiredMemories, DEFAULT_MEMORY_DECAY_CONFIG } from "./core/memoryDecay.js";
export type { MemoryDecayStatus, MemoryDecayConfig, MemoryDecayOperationResult } from "./core/memoryDecay.js";
export { handleMemoryDecay } from "./core/memoryCommands.js";

// Memory Repair / Doctor (Phase 4-O)
export { detectMemoryIssues, applyMemoryRepairs, repairMemoryStore } from "./core/memoryDoctor.js";
export type { MemoryIssueSeverity, MemoryIssueType, MemoryDoctorIssue, MemoryDoctorReport, MemoryRepairResult } from "./core/memoryDoctor.js";
export { handleMemoryDoctor, handleMemoryRepair } from "./core/memoryCommands.js";

// Prompt Budget Gate (Phase 4-P)
export { applyPromptBudgetGate, inferTaskRisk, resolvePromptBudgetMode, PROMPT_BUDGET_LIMITS } from "./core/promptBudgetGate.js";
export type { PromptBudgetMode, ResolvedPromptBudgetMode, TaskRisk, PromptBudgetGateInput, PromptBudgetGateResult, OmittedMemory, OmittedContext, PromptBudgetModeLimits } from "./core/promptBudgetGate.js";

// Execution Governance (Phase 4-J)
export { loadExecutionGovernance, renderExecutionGovernanceSection, DEFAULT_QUALITY_GATE_MANIFEST, DEFAULT_STOP_CONDITIONS, DEFAULT_ESCALATION_RULES, QUALITY_GATES_PATH, STOP_CONDITIONS_PATH, ESCALATION_RULES_PATH } from "./core/executionGovernance.js";
export type { QualityGateManifest, StopConditions, ExecutionGovernanceConfig } from "./core/executionGovernance.js";
