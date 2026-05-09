/**
 * memoryInjector.ts
 * Orchestrates memory selection → formatting → section string generation.
 */

import type { DevMemoryEntry, MemoryMode, DevMemoryKind } from "./memoryValidator.js";
import { readMemoryEntries } from "./memoryStore.js";
import { selectMemoryEntries } from "./memorySelector.js";
import type { MemoryMatchReason, ExcludedReasons } from "./memorySelector.js";
import { applyMemoryInjectionPolicy } from "./memoryInjectionPolicy.js";
import type { MemoryInjectionPolicyConfig } from "./memoryInjectionPolicy.js";
import { loadMemoryScopeContext } from "./memoryScope.js";
import { applyPromptBudgetGate } from "./promptBudgetGate.js";
import type { PromptBudgetMode } from "./promptBudgetGate.js";

/** Injection metadata for logging (backward-compatible extension) */
export interface MemoryInjectionMeta {
  mode: MemoryMode;
  selectedCount: number;
  selectedIds: string[];
  totalAvailable: number;
  // Phase 2 fields
  consideredCount?: number;
  excludedCount?: number;
  totalSelectedChars?: number;
  topScore?: number;
  selectedDetails?: Array<{
    id: string;
    summary: string;
    kind: DevMemoryKind;
    score: number;
    matchedReasons: MemoryMatchReason[];
    estimatedChars: number;
  }>;
  // Phase 3 fields
  excludedReasons?: ExcludedReasons;
  // Phase 4-I fields
  policy?: {
    inputCount: number;
    outputCount: number;
    excludedCount: number;
    probationIncludedCount: number;
    autoCapturedIncludedCount: number;
    highRejectionExcludedCount: number;
    supersededExcludedCount: number;
    conflictExcludedCount: number;
    duplicateExcludedCount: number;
    mergedExcludedCount: number;
    scopeExcludedCount: number;
    expiredExcludedCount: number;
  };
  // Phase 4-P fields
  budget?: {
    modeRequested: string;
    modeUsed: string;
    taskRisk: string;
    inputMemoryCount: number;
    outputMemoryCount: number;
    omittedMemoryCount: number;
    qualityGateDetail: "short" | "full";
    warningCount: number;
  };
}

/**
 * Format selected entries into a prompt section string.
 * Returns empty string when entries array is empty.
 */
export function formatMemorySection(entries: DevMemoryEntry[]): string {
  if (entries.length === 0) return "";

  const header = `## Development Memory / 再発防止メモ

> 以下は過去の修正から得た注意点です。今回の明示仕様と矛盾する場合は明示仕様を優先してください。
`;

  const formattedEntries = entries.map((entry, index) => {
    const related = [
      ...entry.tags,
      ...entry.relatedSymbols,
    ].filter(Boolean).join(", ") || entry.relatedFiles.join(", ") || "—";

    return `### ${index + 1}. ${entry.summary} (${entry.kind})
- **Related**: ${related}
- **Trigger**: ${entry.trigger}
- **Fix**: ${entry.fix}
- **Hint**: ${entry.futurePromptHint}`;
  });

  return header + "\n" + formattedEntries.join("\n\n") + "\n";
}

/**
 * Full injection pipeline: read store → select → apply policy → format.
 * Returns section string + metadata + selected entries for persistence.
 */
export async function injectMemorySection(
  taskText: string,
  mode: MemoryMode,
  storePath?: string,
  policyConfig?: Partial<MemoryInjectionPolicyConfig>,
  budgetMode?: PromptBudgetMode,
): Promise<{ section: string; meta: MemoryInjectionMeta; selectedEntries: DevMemoryEntry[] }> {
  const entries = await readMemoryEntries(storePath);
  const result = selectMemoryEntries(entries, taskText, mode);

  // Apply injection policy (post-selection filter)
  // Load scope context (non-blocking)
  let scopeContext: import("./memoryScope.js").MemoryScopeContext | undefined;
  try {
    const scopeResult = await loadMemoryScopeContext();
    scopeContext = scopeResult.context;
  } catch {
    // Scope loading failure must not block injection
  }

  const policyResult = applyMemoryInjectionPolicy(result.selected, {
    ...policyConfig,
    scopeContext,
  });

  // Apply prompt budget gate (after injection policy)
  const budgetResult = applyPromptBudgetGate({
    mode: budgetMode ?? "full",
    estimatedTokens: result.totalSelectedChars ?? 0,
    memories: policyResult.selectedEntries,
    taskText,
  });

  const finalEntries = budgetResult.includedMemories;
  const section = formatMemorySection(finalEntries);

  const selectedDetails = (result.selectedDetails ?? [])
    .filter(d => finalEntries.some(e => e.id === d.entry.id))
    .map((d) => ({
      id: d.entry.id,
      summary: d.entry.summary,
      kind: d.entry.kind,
      score: d.score,
      matchedReasons: d.reasons,
      estimatedChars: d.estimatedChars,
    }));

  const topScore = selectedDetails.length > 0
    ? Math.max(...selectedDetails.map((d) => d.score))
    : 0;

  const meta: MemoryInjectionMeta = {
    mode,
    selectedCount: finalEntries.length,
    selectedIds: finalEntries.map((e) => e.id),
    totalAvailable: result.totalAvailable,
    consideredCount: result.consideredCount ?? 0,
    excludedCount: result.excludedCount ?? 0,
    totalSelectedChars: result.totalSelectedChars ?? 0,
    topScore,
    selectedDetails,
    excludedReasons: result.excludedReasons,
    policy: policyResult.stats,
    budget: {
      modeRequested: budgetResult.modeRequested,
      modeUsed: budgetResult.modeUsed,
      taskRisk: budgetResult.taskRisk,
      inputMemoryCount: policyResult.selectedEntries.length,
      outputMemoryCount: finalEntries.length,
      omittedMemoryCount: budgetResult.omittedMemories.length,
      qualityGateDetail: budgetResult.qualityGateDetail,
      warningCount: budgetResult.warnings.length,
    },
  };

  return { section, meta, selectedEntries: finalEntries };
}
