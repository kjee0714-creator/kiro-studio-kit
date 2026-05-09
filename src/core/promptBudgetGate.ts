/**
 * promptBudgetGate.ts
 * Controls prompt size by limiting memory count, handoff detail, and governance detail
 * based on budget mode and task risk. Applied AFTER Injection Policy.
 * Pure function — no I/O, no mutation.
 */

import type { DevMemoryEntry } from "./memoryValidator.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PromptBudgetMode = "minimal" | "compact" | "full" | "auto";
export type ResolvedPromptBudgetMode = "minimal" | "compact" | "full";
export type TaskRisk = "low" | "medium" | "high";

export type OmittedContextReason =
  | "budget_limit"
  | "mode_limit"
  | "handoff_summary"
  | "handoff_omitted"
  | "quality_gate_shortened"
  | "log_omitted";

export interface PromptBudgetGateInput {
  mode: PromptBudgetMode;
  estimatedTokens: number;
  memories: DevMemoryEntry[];
  taskText?: string;
  taskRisk?: TaskRisk;
  handoffText?: string;
  handoffSummary?: string;
  qualityGates?: string[];
}

export interface OmittedMemory {
  id: string;
  reason: "budget_limit" | "mode_limit";
}

export interface OmittedContext {
  kind: "memory" | "handoff" | "quality_gates" | "logs";
  id?: string;
  reason: OmittedContextReason;
  summary?: string;
}

export interface PromptBudgetGateResult {
  modeRequested: PromptBudgetMode;
  modeUsed: ResolvedPromptBudgetMode;
  taskRisk: TaskRisk;
  includedMemories: DevMemoryEntry[];
  omittedMemories: OmittedMemory[];
  includeFullHandoff: boolean;
  includeHandoffSummary: boolean;
  qualityGateDetail: "short" | "full";
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
  omittedContext: OmittedContext[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Defaults / Limits
// ---------------------------------------------------------------------------

export interface PromptBudgetModeLimits {
  maxMemories: number;
  includeFullHandoff: boolean;
  includeHandoffSummary: boolean;
  qualityGateDetail: "short" | "full";
}

export const PROMPT_BUDGET_LIMITS: Record<ResolvedPromptBudgetMode, PromptBudgetModeLimits> = {
  minimal: {
    maxMemories: 3,
    includeFullHandoff: false,
    includeHandoffSummary: true,
    qualityGateDetail: "short",
  },
  compact: {
    maxMemories: 6,
    includeFullHandoff: false,
    includeHandoffSummary: true,
    qualityGateDetail: "full",
  },
  full: {
    maxMemories: 12,
    includeFullHandoff: true,
    includeHandoffSummary: false,
    qualityGateDetail: "full",
  },
};

// ---------------------------------------------------------------------------
// Risk Keywords
// ---------------------------------------------------------------------------

const HIGH_RISK_KEYWORDS = [
  "schema", "validator", "public api", "export", "memory store", "persistence",
  "audit", "trust", "injection policy", "scope", "conflict", "duplicate",
  "decay", "repair", "doctor", "cli behavior", "security", "auth",
  "payment", "migration", "delete", "breaking change", "data loss",
];

const LOW_RISK_KEYWORDS = [
  "typo", "comment", "format", "small doc", "minor test", "text update",
  "readme", "changelog", "whitespace", "rename variable",
];

// ---------------------------------------------------------------------------
// Risk Inference
// ---------------------------------------------------------------------------

/**
 * Infer task risk from task text.
 * Pure function.
 */
export function inferTaskRisk(taskText: string): TaskRisk {
  const lower = taskText.toLowerCase();

  if (HIGH_RISK_KEYWORDS.some(kw => lower.includes(kw))) return "high";
  if (LOW_RISK_KEYWORDS.some(kw => lower.includes(kw))) return "low";
  return "medium";
}

/**
 * Resolve budget mode from requested mode and context.
 * Pure function.
 */
export function resolvePromptBudgetMode(
  mode: PromptBudgetMode,
  input: Pick<PromptBudgetGateInput, "taskText" | "taskRisk" | "estimatedTokens">,
): ResolvedPromptBudgetMode {
  if (mode === "minimal" || mode === "compact" || mode === "full") return mode;

  // Auto mode: resolve based on risk
  const risk = input.taskRisk ?? (input.taskText ? inferTaskRisk(input.taskText) : "medium");

  switch (risk) {
    case "high": return "full";
    case "low": return "minimal";
    default: return "compact";
  }
}

// ---------------------------------------------------------------------------
// Gate Function
// ---------------------------------------------------------------------------

/**
 * Apply prompt budget gate to post-policy memories.
 * Pure function — does NOT mutate input.
 */
export function applyPromptBudgetGate(
  input: PromptBudgetGateInput,
): PromptBudgetGateResult {
  const taskRisk = input.taskRisk ?? (input.taskText ? inferTaskRisk(input.taskText) : "medium");
  const modeUsed = resolvePromptBudgetMode(input.mode, { ...input, taskRisk });
  const limits = PROMPT_BUDGET_LIMITS[modeUsed];

  const omittedMemories: OmittedMemory[] = [];
  const omittedContext: OmittedContext[] = [];
  const warnings: string[] = [];

  // Limit memories
  const includedMemories = input.memories.slice(0, limits.maxMemories);
  const droppedMemories = input.memories.slice(limits.maxMemories);
  for (const mem of droppedMemories) {
    omittedMemories.push({ id: mem.id, reason: "mode_limit" });
    omittedContext.push({ kind: "memory", id: mem.id, reason: "mode_limit" });
  }

  // Handoff handling
  const includeFullHandoff = limits.includeFullHandoff && !!input.handoffText;
  const includeHandoffSummary = !includeFullHandoff && limits.includeHandoffSummary && !!input.handoffSummary;

  if (input.handoffText && !includeFullHandoff) {
    if (includeHandoffSummary) {
      omittedContext.push({ kind: "handoff", reason: "handoff_summary", summary: "Full handoff replaced with summary" });
    } else {
      omittedContext.push({ kind: "handoff", reason: "handoff_omitted" });
    }
  }

  // Quality gate detail
  const qualityGateDetail = limits.qualityGateDetail;
  if (qualityGateDetail === "short" && input.qualityGates && input.qualityGates.length > 0) {
    omittedContext.push({ kind: "quality_gates", reason: "quality_gate_shortened" });
  }

  // Estimate tokens after (rough: proportional to memory reduction)
  const memoryRatio = input.memories.length > 0 ? includedMemories.length / input.memories.length : 1;
  const estimatedTokensAfter = Math.round(input.estimatedTokens * memoryRatio);

  return {
    modeRequested: input.mode,
    modeUsed,
    taskRisk,
    includedMemories,
    omittedMemories,
    includeFullHandoff,
    includeHandoffSummary,
    qualityGateDetail,
    estimatedTokensBefore: input.estimatedTokens,
    estimatedTokensAfter: Math.min(estimatedTokensAfter, input.estimatedTokens),
    omittedContext,
    warnings,
  };
}
