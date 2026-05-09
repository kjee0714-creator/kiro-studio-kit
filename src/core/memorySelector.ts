/**
 * memorySelector.ts
 * Pure scoring + filtering + selection logic for DevMemoryEntries.
 * No side effects — all functions are deterministic given the same inputs.
 */

import type { DevMemoryEntry, MemoryMode } from "./memoryValidator.js";

/** Scored entry (internal, Phase 1 compat) */
export interface ScoredEntry {
  entry: DevMemoryEntry;
  score: number;
}

/** A single match reason explaining why points were awarded */
export interface MemoryMatchReason {
  type: "file" | "symbol" | "tag" | "kind" | "severity" | "recent" | "trust";
  value: string;
  points: number;
}

/** Detailed scoring result for a single entry */
export interface ScoredMemoryEntry {
  entry: DevMemoryEntry;
  score: number;
  reasons: MemoryMatchReason[];
  estimatedChars: number;
}

/** Breakdown of why entries were excluded from selection */
export interface ExcludedReasons {
  disabled: number;
  deleted: number;
  expired: number;
  superseded: number;
  lowConfidence: number;
}

/** Selection result (backward-compatible extension) */
export interface SelectionResult {
  selected: DevMemoryEntry[];
  totalAvailable: number;
  // Phase 2 fields
  selectedDetails?: ScoredMemoryEntry[];
  consideredCount?: number;
  excludedCount?: number;
  totalSelectedChars?: number;
  // Phase 3 fields
  excludedReasons?: ExcludedReasons;
}

/** Kind relevance keyword mapping */
const KIND_KEYWORDS: Record<string, string[]> = {
  test_fix: ["test", "spec", "vitest", "jest"],
  type_fix: ["type", "typescript", "tsc", "typecheck"],
  lint_fix: ["lint", "eslint", "prettier"],
  build_fix: ["build", "compile", "bundle", "dist"],
  schema_fix: ["schema", "validation", "zod", "parse"],
  behavior_change: ["behavior", "breaking", "api"],
  design_decision: ["design", "architecture", "pattern"],
  gotcha: [], // gotchas rely on other signals
};

/** Auto mode constraints */
const AUTO_MAX_ENTRIES = 5;
const AUTO_MAX_CHARS = 2000;

/** Full mode constraints */
const FULL_MAX_CHARS = 10000;

/** 30 days in milliseconds */
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Estimate the formatted character count for an entry.
 * Used for character budget enforcement.
 */
export function estimateEntryChars(entry: DevMemoryEntry): number {
  const parts = [
    entry.summary,
    entry.kind,
    entry.trigger,
    entry.fix,
    entry.futurePromptHint,
    entry.tags.join(", "),
    entry.relatedSymbols.join(", "),
    entry.relatedFiles.join(", "),
  ];
  // Add formatting overhead (~50 chars for labels/markdown)
  return parts.reduce((sum, p) => sum + p.length, 0) + 50;
}

/**
 * Check if an entry is superseded by any other entry in the set.
 */
function isSuperseded(entry: DevMemoryEntry, allEntries: DevMemoryEntry[]): boolean {
  return allEntries.some(
    (other) => other.supersedes?.includes(entry.id) ?? false,
  );
}

/**
 * Check if an entry is expired.
 */
function isExpired(entry: DevMemoryEntry, now: Date): boolean {
  if (!entry.expiresAt) return false;
  return new Date(entry.expiresAt).getTime() < now.getTime();
}

/**
 * Filter entries based on exclusion conditions.
 * Maintains backward compatibility — adds deleted check.
 */
export function filterEntries(
  entries: DevMemoryEntry[],
  now: Date = new Date(),
): DevMemoryEntry[] {
  return entries.filter((entry) => {
    if (entry.deleted === true) return false;
    if (!entry.enabled) return false;
    if (entry.confidence === "low") return false;
    if (isExpired(entry, now)) return false;
    if (isSuperseded(entry, entries)) return false;
    return true;
  });
}

/** Result of filtering with detailed exclusion reasons */
export interface FilterResult {
  filtered: DevMemoryEntry[];
  excludedReasons: ExcludedReasons;
}

/**
 * Filter entries with detailed exclusion reason breakdown.
 * Evaluation order: deleted → disabled → lowConfidence → expired → superseded
 * First matching condition wins (no double-counting).
 */
export function filterEntriesWithReasons(
  entries: DevMemoryEntry[],
  now: Date = new Date(),
): FilterResult {
  const reasons: ExcludedReasons = {
    disabled: 0,
    deleted: 0,
    expired: 0,
    superseded: 0,
    lowConfidence: 0,
  };
  const filtered: DevMemoryEntry[] = [];

  for (const entry of entries) {
    if (entry.deleted === true) {
      reasons.deleted++;
    } else if (!entry.enabled) {
      reasons.disabled++;
    } else if (entry.confidence === "low") {
      reasons.lowConfidence++;
    } else if (isExpired(entry, now)) {
      reasons.expired++;
    } else if (isSuperseded(entry, entries)) {
      reasons.superseded++;
    } else {
      filtered.push(entry);
    }
  }

  return { filtered, excludedReasons: reasons };
}

/**
 * Score a single entry against task text. Pure function.
 * Returns a non-negative integer score.
 */
export function scoreEntry(entry: DevMemoryEntry, taskText: string): number {
  const lowerTask = taskText.toLowerCase();
  let score = 0;

  // +5 per relatedFiles match
  for (const file of entry.relatedFiles) {
    if (lowerTask.includes(file.toLowerCase())) {
      score += 5;
    }
  }

  // +4 per relatedSymbols match
  for (const symbol of entry.relatedSymbols) {
    if (lowerTask.includes(symbol.toLowerCase())) {
      score += 4;
    }
  }

  // +3 per tags match
  for (const tag of entry.tags) {
    if (lowerTask.includes(tag.toLowerCase())) {
      score += 3;
    }
  }

  // +2 if kind keywords found in task text
  const keywords = KIND_KEYWORDS[entry.kind] ?? [];
  if (keywords.some((kw) => lowerTask.includes(kw))) {
    score += 2;
  }

  // +2 if severity high, +1 if medium
  if (entry.severity === "high") {
    score += 2;
  } else if (entry.severity === "medium") {
    score += 1;
  }

  // +1 if created within last 30 days
  const createdTime = new Date(entry.createdAt).getTime();
  const now = Date.now();
  if (now - createdTime <= THIRTY_DAYS_MS) {
    score += 1;
  }

  // Trust level bonus (additive)
  if (entry.trustLevel === "verified") {
    score += 15;
  } else if (entry.trustLevel === "trusted") {
    score += 8;
  }

  return score;
}

/**
 * Score a single entry against task text with detailed match reasons.
 * Produces the SAME numeric score as scoreEntry for identical inputs.
 * Pure function — no side effects.
 */
export function scoreEntryDetailed(
  entry: DevMemoryEntry,
  taskText: string,
): ScoredMemoryEntry {
  const lowerTask = taskText.toLowerCase();
  const reasons: MemoryMatchReason[] = [];

  // +5 per relatedFiles match
  for (const file of entry.relatedFiles) {
    if (lowerTask.includes(file.toLowerCase())) {
      reasons.push({ type: "file", value: file, points: 5 });
    }
  }

  // +4 per relatedSymbols match
  for (const symbol of entry.relatedSymbols) {
    if (lowerTask.includes(symbol.toLowerCase())) {
      reasons.push({ type: "symbol", value: symbol, points: 4 });
    }
  }

  // +3 per tags match
  for (const tag of entry.tags) {
    if (lowerTask.includes(tag.toLowerCase())) {
      reasons.push({ type: "tag", value: tag, points: 3 });
    }
  }

  // +2 if kind keywords found in task text
  const keywords = KIND_KEYWORDS[entry.kind] ?? [];
  if (keywords.some((kw) => lowerTask.includes(kw))) {
    reasons.push({ type: "kind", value: entry.kind, points: 2 });
  }

  // +2 if severity high, +1 if medium
  if (entry.severity === "high") {
    reasons.push({ type: "severity", value: "high", points: 2 });
  } else if (entry.severity === "medium") {
    reasons.push({ type: "severity", value: "medium", points: 1 });
  }

  // +1 if created within last 30 days
  const createdTime = new Date(entry.createdAt).getTime();
  const now = Date.now();
  if (now - createdTime <= THIRTY_DAYS_MS) {
    reasons.push({ type: "recent", value: "within_30d", points: 1 });
  }

  // Trust level bonus (additive)
  if (entry.trustLevel === "verified") {
    reasons.push({ type: "trust", value: "verified", points: 15 });
  } else if (entry.trustLevel === "trusted") {
    reasons.push({ type: "trust", value: "trusted", points: 8 });
  }

  const score = reasons.reduce((sum, r) => sum + r.points, 0);
  const estimatedChars = estimateEntryChars(entry);

  return { entry, score, reasons, estimatedChars };
}

/**
 * Select entries based on mode, task text, and constraints. Pure function.
 */
export function selectMemoryEntries(
  entries: DevMemoryEntry[],
  taskText: string,
  mode: MemoryMode,
): SelectionResult {
  if (mode === "off") {
    return {
      selected: [],
      totalAvailable: entries.length,
      selectedDetails: [],
      consideredCount: 0,
      excludedCount: 0,
      totalSelectedChars: 0,
      excludedReasons: { disabled: 0, deleted: 0, expired: 0, superseded: 0, lowConfidence: 0 },
    };
  }

  const { filtered, excludedReasons } = filterEntriesWithReasons(entries);
  const totalAvailable = filtered.length;
  const consideredCount = filtered.length;
  const excludedCount = entries.length - filtered.length;

  if (mode === "full") {
    // Full mode: all filtered entries within character budget
    let charCount = 0;
    const selected: DevMemoryEntry[] = [];
    const selectedDetails: ScoredMemoryEntry[] = [];
    for (const entry of filtered) {
      const detailed = scoreEntryDetailed(entry, taskText);
      if (charCount + detailed.estimatedChars > FULL_MAX_CHARS) break;
      selected.push(entry);
      selectedDetails.push(detailed);
      charCount += detailed.estimatedChars;
    }
    return {
      selected,
      totalAvailable,
      selectedDetails,
      consideredCount,
      excludedCount,
      totalSelectedChars: charCount,
      excludedReasons,
    };
  }

  // Auto mode: score, filter score > 0, top 5, within 2000 chars
  const scored: ScoredMemoryEntry[] = filtered
    .map((entry) => scoreEntryDetailed(entry, taskText))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  let charCount = 0;
  const selected: DevMemoryEntry[] = [];
  const selectedDetails: ScoredMemoryEntry[] = [];
  for (const detailed of scored) {
    if (selected.length >= AUTO_MAX_ENTRIES) break;
    if (charCount + detailed.estimatedChars > AUTO_MAX_CHARS) break;
    selected.push(detailed.entry);
    selectedDetails.push(detailed);
    charCount += detailed.estimatedChars;
  }

  return {
    selected,
    totalAvailable,
    selectedDetails,
    consideredCount,
    excludedCount,
    totalSelectedChars: charCount,
    excludedReasons,
  };
}
