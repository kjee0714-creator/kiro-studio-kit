/**
 * memoryCommands.ts
 * CLI handlers for `memory add/list/search` subcommands.
 */

import crypto from "node:crypto";
import { readMemoryEntries, appendMemoryEntry, rewriteMemoryEntries, backupMemoryStore, MEMORY_STORE_PATH, readPendingMemoryEntries, appendPendingMemoryEntry, clearPendingStore, rewritePendingMemoryEntries } from "./memoryStore.js";
import { VALID_KINDS, isValidDevMemoryEntry } from "./memoryValidator.js";
import type { DevMemoryEntry, DevMemoryKind, Severity, Confidence } from "./memoryValidator.js";
import { classifyPruneCandidates, deriveHistory } from "./memoryLifecycle.js";
import { calculateMemoryHealth } from "./memoryHealth.js";
import { fileExists, readTextFile } from "./fileUtils.js";
import { stat } from "fs/promises";
import { extractCaptureSignals, generateCaptureCandidates, assessCaptureCandidate, decideCaptureStatus, findSimilarMemory, redactCaptureText } from "./memoryCapture.js";
import { assessMemoryTrust, assessTrustLifecycleAction, applyTrustLifecycleDecision } from "./memoryTrust.js";
import type { TrustLifecycleAction } from "./memoryTrust.js";
import { appendMemoryAuditEvent, readMemoryAuditEvents, findMemoryAuditEvents } from "./memoryAuditLog.js";
import { markMemorySelectionSuccess, markMemorySelectionRejected } from "./memoryUsagePersistence.js";
import { promoteAllPendingEntries, discardPendingEntry, classifyPrunePendingCandidates, applyPrunePendingEntries, computePendingStats } from "./pendingOperations.js";
import { supersedeMemory, setMemoryConflictGroup, groupByConflictGroup } from "./memoryConflict.js";
import { markMemoryDuplicate, clearMemoryDuplicate, listDuplicateGroups, findDuplicateInfo } from "./memoryDuplicate.js";
import { loadMemoryScopeContext, setMemoryScope } from "./memoryScope.js";
import type { MemoryScope } from "./memoryScope.js";
import { getMemoryDecayStatus, isExpiredMemory, isStaleMemory, isReviewDueMemory, markMemoryReviewed, setMemoryExpiry, disableExpiredMemories } from "./memoryDecay.js";
import { detectMemoryIssues, repairMemoryStore } from "./memoryDoctor.js";

/** Parse a named option value from args (e.g., --kind test_fix) */
function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

/** Parse a comma-separated option into an array */
function getArrayOption(args: string[], name: string): string[] {
  const value = getOption(args, name);
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function showMemoryUsage(): void {
  console.error(`Usage:
  kiro-studio-kit memory add --kind <kind> --summary <text> --trigger <text> --fix <text> --hint <text> [options]
  kiro-studio-kit memory list
  kiro-studio-kit memory search <query>
  kiro-studio-kit memory inspect <id>
  kiro-studio-kit memory stats
  kiro-studio-kit memory health
  kiro-studio-kit memory disable <id>
  kiro-studio-kit memory enable <id>
  kiro-studio-kit memory delete <id>
  kiro-studio-kit memory supersede <oldId> <newId>
  kiro-studio-kit memory prune [--apply]
  kiro-studio-kit memory compact
  kiro-studio-kit memory history <id>
  kiro-studio-kit memory capture <log-file> [--apply]
  kiro-studio-kit memory pending list
  kiro-studio-kit memory pending clear [--apply]
  kiro-studio-kit memory pending promote <id>
  kiro-studio-kit memory trust upgrade <id>
  kiro-studio-kit memory trust degrade <id> [--reason <text>]
  kiro-studio-kit memory trust audit [--apply]
  kiro-studio-kit memory trust lifecycle [--dry-run]
  kiro-studio-kit memory trust verify <id> [--reason <text>]
  kiro-studio-kit memory usage stats
  kiro-studio-kit memory usage reset <id>
  kiro-studio-kit memory usage mark-success <id> [--reason <text>]
  kiro-studio-kit memory usage mark-rejected <id> [--reason <text>]
  kiro-studio-kit memory audit log [--limit N]
  kiro-studio-kit memory audit inspect <memoryId>

memory add options:
  --kind <kind>         Entry kind (${VALID_KINDS.join(", ")})
  --summary <text>      Short summary of the lesson
  --trigger <text>      What triggered the issue
  --fix <text>          How it was fixed
  --hint <text>         Future prompt hint (futurePromptHint)
  --files <f1,f2>       Related files (comma-separated)
  --symbols <s1,s2>     Related symbols (comma-separated)
  --tags <t1,t2>        Tags (comma-separated)
  --severity <level>    low | medium | high (default: medium)
  --confidence <level>  low | medium | high (default: high)

memory capture options:
  <log-file>            Path to CI/build log file (required)
  --apply               Write results to stores (default: dry-run)

memory pending subcommands:
  list                  Show quarantined entries
  clear [--apply]       Clear pending store (--apply to actually clear)
  promote <id>          Promote a pending entry to active store
  promote --all         Promote all promotable pending entries
  inspect <id>          Show full details of a pending entry
  discard <id>          Discard a pending entry (set captureStatus=discarded)
  prune [--dry-run] [--older-than-days N]  Discard old pending entries
  stats                 Show pending store statistics

memory trust subcommands:
  upgrade <id>          Upgrade entry trust level based on assessment
  degrade <id>          Downgrade entry trust level by one step
  audit [--apply]       Audit all entries for trust level changes`);
}

/** Handle `memory add` subcommand */
export async function handleMemoryAdd(args: string[]): Promise<void> {
  const kind = getOption(args, "kind");
  const summary = getOption(args, "summary");
  const trigger = getOption(args, "trigger");
  const fix = getOption(args, "fix");
  const hint = getOption(args, "hint");

  // Validate required options
  if (!kind || !summary || !trigger || !fix || !hint) {
    console.error("エラー: --kind, --summary, --trigger, --fix, --hint は必須です。");
    showMemoryUsage();
    process.exit(1);
  }

  if (!VALID_KINDS.includes(kind as DevMemoryKind)) {
    console.error(`エラー: --kind に無効な値 "${kind}" が指定されました。\n有効な値: ${VALID_KINDS.join(", ")}`);
    process.exit(1);
  }

  const severity = (getOption(args, "severity") ?? "medium") as Severity;
  const confidence = (getOption(args, "confidence") ?? "high") as Confidence;
  const relatedFiles = getArrayOption(args, "files");
  const relatedSymbols = getArrayOption(args, "symbols");
  const tags = getArrayOption(args, "tags");

  const entry: DevMemoryEntry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    kind: kind as DevMemoryKind,
    summary,
    trigger,
    fix,
    futurePromptHint: hint,
    relatedFiles,
    relatedSymbols,
    tags,
    severity,
    confidence,
    enabled: true,
  };

  const filePath = await appendMemoryEntry(entry);
  console.log(`✅ メモリエントリを追加しました: ${entry.id}`);
  console.log(`   保存先: ${filePath}`);
}

/** Handle `memory list` subcommand */
export async function handleMemoryList(): Promise<void> {
  const entries = await readMemoryEntries();
  const enabled = entries.filter((e) => e.enabled && e.deleted !== true);

  if (enabled.length === 0) {
    console.log("📭 メモリエントリはありません。");
    return;
  }

  // Sort by createdAt descending (newest first)
  const sorted = enabled.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  console.log(`📋 Development Memory (${sorted.length} entries):\n`);
  for (const entry of sorted) {
    console.log(`  [${entry.kind}] ${entry.summary}`);
    console.log(`    ID: ${entry.id} | Created: ${entry.createdAt}`);
    console.log("");
  }
}

/** Handle `memory search` subcommand */
export async function handleMemorySearch(args: string[]): Promise<void> {
  // The query is the first positional arg after "search"
  const query = args[0];
  if (!query) {
    console.error("エラー: 検索クエリを指定してください。");
    console.error("Usage: kiro-studio-kit memory search <query>");
    process.exit(1);
  }

  const entries = await readMemoryEntries();
  const lowerQuery = query.toLowerCase();

  const matches = entries.filter((entry) => {
    if (entry.deleted === true) return false;
    const searchableFields = [
      entry.summary,
      entry.trigger,
      entry.fix,
      entry.futurePromptHint,
      ...entry.tags,
      ...entry.relatedSymbols,
      ...entry.relatedFiles,
    ];
    return searchableFields.some((field) => field.toLowerCase().includes(lowerQuery));
  });

  if (matches.length === 0) {
    console.log(`🔍 "${query}" に一致するメモリエントリはありません。`);
    return;
  }

  // Sort by createdAt descending
  const sorted = matches.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  console.log(`🔍 "${query}" の検索結果 (${sorted.length} 件):\n`);
  for (const entry of sorted) {
    console.log(`  [${entry.kind}] ${entry.summary}`);
    console.log(`    ID: ${entry.id} | Created: ${entry.createdAt}`);
    console.log("");
  }
}

/** Handle `memory inspect <id>` subcommand */
export async function handleMemoryInspect(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("エラー: IDを指定してください。");
    console.error("Usage: kiro-studio-kit memory inspect <id>");
    process.exit(1);
  }

  const entries = await readMemoryEntries();
  const entry = entries.find((e) => e.id === id);

  if (!entry) {
    console.error(`エラー: ID "${id}" に一致するメモリエントリが見つかりません。`);
    process.exit(1);
  }

  console.log(`ID: ${entry.id}`);
  console.log(`Kind: ${entry.kind}`);
  console.log(`Severity: ${entry.severity}`);
  console.log(`Confidence: ${entry.confidence}`);
  console.log(`Enabled: ${entry.enabled}`);
  if (entry.deleted === true) {
    console.log(`Deleted: true`);
    if (entry.deletedAt) console.log(`DeletedAt: ${entry.deletedAt}`);
  }
  console.log(`CreatedAt: ${entry.createdAt}`);
  if (entry.expiresAt) console.log(`ExpiresAt: ${entry.expiresAt}`);
  if (entry.project) console.log(`Project: ${entry.project}`);
  if (entry.phase) console.log(`Phase: ${entry.phase}`);
  if (entry.taskName) console.log(`TaskName: ${entry.taskName}`);
  if (entry.supersedes && entry.supersedes.length > 0) {
    console.log(`Supersedes: ${entry.supersedes.join(", ")}`);
  }
  // Show if this entry is superseded by another
  const supersededBy = entries.find((e) => e.supersedes?.includes(entry.id));
  if (supersededBy) {
    console.log(`Superseded by: ${supersededBy.id}`);
  }
  console.log(`\nSummary:\n  ${entry.summary}`);
  console.log(`\nTrigger:\n  ${entry.trigger}`);
  console.log(`\nFix:\n  ${entry.fix}`);
  console.log(`\nFuture Hint:\n  ${entry.futurePromptHint}`);
  if (entry.relatedFiles.length > 0) {
    console.log(`\nRelated Files:`);
    for (const f of entry.relatedFiles) console.log(`  - ${f}`);
  }
  if (entry.relatedSymbols.length > 0) {
    console.log(`\nRelated Symbols:`);
    for (const s of entry.relatedSymbols) console.log(`  - ${s}`);
  }
  if (entry.tags.length > 0) {
    console.log(`\nTags:`);
    for (const t of entry.tags) console.log(`  - ${t}`);
  }
}

/** Handle `memory stats` subcommand */
export async function handleMemoryStats(): Promise<void> {
  const entries = await readMemoryEntries();

  const now = new Date();
  const enabled = entries.filter((e) => e.enabled && e.deleted !== true);
  const disabled = entries.filter((e) => !e.enabled);
  const deleted = entries.filter((e) => e.deleted === true);
  const lowConfidence = entries.filter((e) => e.confidence === "low");
  const expired = entries.filter((e) => {
    if (!e.expiresAt) return false;
    return new Date(e.expiresAt).getTime() < now.getTime();
  });
  const superseded = entries.filter((e) =>
    entries.some((other) => other.supersedes?.includes(e.id) ?? false),
  );

  console.log("Development Memory Stats\n");
  console.log(`Total entries: ${entries.length}`);
  console.log(`Enabled: ${enabled.length}`);
  console.log(`Disabled: ${disabled.length}`);
  console.log(`Deleted: ${deleted.length}`);
  console.log(`Superseded: ${superseded.length}`);
  console.log(`Low confidence: ${lowConfidence.length}`);
  console.log(`Expired: ${expired.length}`);

  // Average age of active entries
  if (enabled.length > 0) {
    const totalAgeDays = enabled.reduce((sum, e) => {
      const ageMs = now.getTime() - new Date(e.createdAt).getTime();
      return sum + ageMs / (1000 * 60 * 60 * 24);
    }, 0);
    const avgAge = Math.round(totalAgeDays / enabled.length);
    console.log(`\nAverage age (active): ${avgAge} days`);
  }

  // By kind
  const kindCounts: Record<string, number> = {};
  for (const entry of entries) {
    kindCounts[entry.kind] = (kindCounts[entry.kind] ?? 0) + 1;
  }
  console.log("\nBy kind:");
  for (const [kind, count] of Object.entries(kindCounts)) {
    console.log(`  ${kind}: ${count}`);
  }

  // By severity
  const severityCounts: Record<string, number> = {};
  for (const entry of entries) {
    severityCounts[entry.severity] = (severityCounts[entry.severity] ?? 0) + 1;
  }
  console.log("\nBy severity:");
  for (const [severity, count] of Object.entries(severityCounts)) {
    console.log(`  ${severity}: ${count}`);
  }

  // Newest and oldest (active entries)
  if (enabled.length > 0) {
    const sorted = [...enabled].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const newest = sorted[0];
    const oldest = sorted[sorted.length - 1];
    console.log(`\nNewest:\n  ${newest.createdAt.slice(0, 10)} ${newest.kind} ${newest.summary}`);
    console.log(`\nOldest:\n  ${oldest.createdAt.slice(0, 10)} ${oldest.kind} ${oldest.summary}`);
  }

  // Store file size
  const storePath = MEMORY_STORE_PATH;
  if (await fileExists(storePath)) {
    const stats = await stat(storePath);
    const sizeKB = (stats.size / 1024).toFixed(1);
    console.log(`\nStore size: ${sizeKB} KB`);
  }
}

/** Handle `memory disable <id>` subcommand */
export async function handleMemoryDisable(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("エラー: IDを指定してください。");
    console.error("Usage: kiro-studio-kit memory disable <id>");
    process.exit(1);
  }

  const entries = await readMemoryEntries();
  const entry = entries.find((e) => e.id === id);

  if (!entry) {
    console.error(`エラー: ID "${id}" に一致するメモリエントリが見つかりません。`);
    process.exit(1);
  }

  if (entry.enabled === false) {
    console.error(`警告: ID "${id}" は既に無効化されています。`);
    return;
  }

  entry.enabled = false;
  await rewriteMemoryEntries(entries);
  console.log(`✅ メモリエントリを無効化しました: ${id}`);
}

/** Handle `memory enable <id>` subcommand */
export async function handleMemoryEnable(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("エラー: IDを指定してください。");
    console.error("Usage: kiro-studio-kit memory enable <id>");
    process.exit(1);
  }

  const entries = await readMemoryEntries();
  const entry = entries.find((e) => e.id === id);

  if (!entry) {
    console.error(`エラー: ID "${id}" に一致するメモリエントリが見つかりません。`);
    process.exit(1);
  }

  if (entry.enabled === true) {
    console.error(`警告: ID "${id}" は既に有効化されています。`);
    return;
  }

  entry.enabled = true;
  await rewriteMemoryEntries(entries);
  console.log(`✅ メモリエントリを有効化しました: ${id}`);
}

/** Handle `memory delete <id>` subcommand */
export async function handleMemoryDelete(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("エラー: IDを指定してください。");
    console.error("Usage: kiro-studio-kit memory delete <id>");
    process.exit(1);
  }

  const entries = await readMemoryEntries();
  const entry = entries.find((e) => e.id === id);

  if (!entry) {
    console.error(`エラー: ID "${id}" に一致するメモリエントリが見つかりません。`);
    process.exit(1);
  }

  entry.deleted = true;
  entry.deletedAt = new Date().toISOString();
  await rewriteMemoryEntries(entries);
  console.log(`✅ メモリエントリを削除しました: ${id}`);
}

/** Handle `memory supersede <oldId> <newId>` subcommand */
export async function handleMemorySupersede(args: string[]): Promise<void> {
  const oldId = args[0];
  const newId = args[1];
  if (!oldId || !newId) {
    console.error("エラー: oldId と newId を指定してください。");
    console.error("Usage: kiro-studio-kit memory supersede <oldId> <newId>");
    process.exit(1);
  }

  const entries = await readMemoryEntries();
  const oldEntry = entries.find((e) => e.id === oldId);
  const newEntry = entries.find((e) => e.id === newId);

  if (!oldEntry) {
    console.error(`エラー: oldId "${oldId}" に一致するメモリエントリが見つかりません。`);
    process.exit(1);
  }
  if (!newEntry) {
    console.error(`エラー: newId "${newId}" に一致するメモリエントリが見つかりません。`);
    process.exit(1);
  }

  if (!newEntry.supersedes) {
    newEntry.supersedes = [];
  }
  if (!newEntry.supersedes.includes(oldId)) {
    newEntry.supersedes.push(oldId);
  }
  await rewriteMemoryEntries(entries);
  console.log(`✅ メモリエントリ "${oldId}" を "${newId}" で置き換えました。`);
}

/** Handle `memory prune [--apply]` subcommand */
export async function handleMemoryPrune(args: string[]): Promise<void> {
  const applyMode = args.includes("--apply");
  const entries = await readMemoryEntries();
  const candidates = classifyPruneCandidates(entries);

  if (candidates.length === 0) {
    console.log("✅ プルーニング候補はありません。");
    return;
  }

  // Count by category
  const counts: Record<string, number> = {};
  for (const c of candidates) {
    counts[c.reason] = (counts[c.reason] ?? 0) + 1;
  }

  if (!applyMode) {
    // Dry-run: report only
    console.log(`🔍 プルーニング候補 (${candidates.length} 件):\n`);
    for (const [reason, count] of Object.entries(counts)) {
      console.log(`  ${reason}: ${count}`);
    }
    console.log("\n--apply を指定すると実際に削除されます。");
    return;
  }

  // Apply mode: backup then remove candidates
  const backupPath = await backupMemoryStore();
  const candidateIds = new Set(candidates.map((c) => c.entry.id));
  const remaining = entries.filter((e) => !candidateIds.has(e.id));
  await rewriteMemoryEntries(remaining);

  console.log(`✅ ${candidates.length} 件のエントリを削除しました。`);
  console.log(`   バックアップ: ${backupPath}`);
}

/** Handle `memory compact` subcommand */
export async function handleMemoryCompact(_args: string[]): Promise<void> {
  const entries = await readMemoryEntries();
  const beforeCount = entries.length;

  // Create backup before modification
  const backupPath = await backupMemoryStore();

  // Filter to non-deleted entries
  const active = entries.filter((e) => e.deleted !== true);

  // Validate each remaining entry (skip invalid with warning)
  const validated: DevMemoryEntry[] = [];
  for (const entry of active) {
    if (isValidDevMemoryEntry(entry as unknown)) {
      validated.push(entry);
    } else {
      console.warn(`⚠️  Invalid entry skipped during compact: ${(entry as DevMemoryEntry).id}`);
    }
  }

  await rewriteMemoryEntries(validated);
  const afterCount = validated.length;

  console.log(`✅ コンパクト完了: ${beforeCount} → ${afterCount} エントリ`);
  console.log(`   バックアップ: ${backupPath}`);
}

/** Handle `memory history <id>` subcommand */
export async function handleMemoryHistory(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("エラー: IDを指定してください。");
    console.error("Usage: kiro-studio-kit memory history <id>");
    process.exit(1);
  }

  const entries = await readMemoryEntries();
  const entry = entries.find((e) => e.id === id);

  if (!entry) {
    console.error(`エラー: ID "${id}" に一致するメモリエントリが見つかりません。`);
    process.exit(1);
  }

  const events = deriveHistory(entry, entries);

  console.log(`📜 Lifecycle History for ${id}:\n`);
  for (const event of events) {
    const detail = event.detail ? ` (${event.detail})` : "";
    console.log(`  ${event.timestamp} — ${event.event}${detail}`);
  }
}

/** Handle `memory health` subcommand */
export async function handleMemoryHealth(): Promise<void> {
  const entries = await readMemoryEntries();
  let storeSizeKb: number | undefined;
  if (await fileExists(MEMORY_STORE_PATH)) {
    const stats = await stat(MEMORY_STORE_PATH);
    storeSizeKb = Math.round(stats.size / 1024);
  }
  const report = calculateMemoryHealth(entries, { storeSizeKb });

  // Format level display
  const levelDisplay = report.level.charAt(0).toUpperCase() + report.level.slice(1);

  console.log("🏥 Memory Health Report\n");
  console.log(`Overall: ${levelDisplay} (${report.overallScore}/100)\n`);
  console.log("Scores:");
  console.log(`  Bloat:          ${report.bloatScore}/100`);
  console.log(`  Conflict:       ${report.conflictScore}/100`);
  console.log(`  Duplication:    ${report.duplicationScore}/100`);
  console.log(`  Staleness:      ${report.stalenessScore}/100`);
  console.log(`  Injection Risk: ${report.injectionRiskScore}/100`);

  console.log("\nStats:");
  console.log(`  Total: ${report.stats.totalEntries} | Active: ${report.stats.activeEntries} | Deleted: ${report.stats.deletedEntries} | Disabled: ${report.stats.disabledEntries}`);
  console.log(`  Superseded: ${report.stats.supersededEntries} | Expired: ${report.stats.expiredEntries} | Low confidence: ${report.stats.lowConfidenceEntries} | Auto-captured: ${report.stats.autoCapturedEntries}`);
  if (report.stats.storeSizeKb !== undefined) {
    console.log(`  Store size: ${report.stats.storeSizeKb} KB`);
  }

  if (report.findings.length > 0) {
    console.log("\nFindings:");
    for (const finding of report.findings) {
      const icon = finding.severity === "critical" ? "🚨" : finding.severity === "warning" ? "⚠️" : "ℹ️";
      console.log(`  ${icon}  [${finding.type}] ${finding.message}`);
    }
  }

  if (report.recommendations.length > 0) {
    console.log("\nRecommendations:");
    for (const rec of report.recommendations) {
      console.log(`  • ${rec}`);
    }
  }
}

/** Handle `memory capture <log-file> [--apply]` subcommand */
export async function handleMemoryCapture(args: string[]): Promise<void> {
  const logFile = args.find((a) => !a.startsWith("--"));
  const applyMode = args.includes("--apply");

  if (!logFile) {
    console.error("エラー: ログファイルのパスを指定してください。");
    console.error("Usage: kiro-studio-kit memory capture <log-file> [--apply]");
    process.exit(1);
  }

  if (!(await fileExists(logFile))) {
    console.error(`エラー: ファイルが見つかりません: ${logFile}`);
    process.exit(1);
  }

  const logText = await readTextFile(logFile);
  const signals = extractCaptureSignals(logText);
  const candidates = generateCaptureCandidates(signals, logText);

  if (candidates.length === 0) {
    console.log("📭 キャプチャ候補はありません。");
    return;
  }

  const existingEntries = await readMemoryEntries();

  const results: Array<{
    candidate: typeof candidates[0];
    assessment: ReturnType<typeof assessCaptureCandidate>;
    decision: ReturnType<typeof decideCaptureStatus>;
    duplicate: DevMemoryEntry | undefined;
  }> = [];

  for (const candidate of candidates) {
    // Redact text fields
    candidate.summary = redactCaptureText(candidate.summary);
    candidate.trigger = redactCaptureText(candidate.trigger);
    candidate.fix = redactCaptureText(candidate.fix);
    candidate.futurePromptHint = redactCaptureText(candidate.futurePromptHint);

    const assessment = assessCaptureCandidate(candidate, signals);
    const decision = decideCaptureStatus(assessment);
    const duplicate = findSimilarMemory(candidate, existingEntries);

    results.push({ candidate, assessment, decision, duplicate });
  }

  // Display report
  console.log(`\n📋 Capture Report (${applyMode ? "--apply" : "--dry-run"}):\n`);
  for (const { candidate, assessment, decision, duplicate } of results) {
    console.log(`  [${candidate.kind}] ${candidate.summary}`);
    console.log(`    Score: ${assessment.totalScore} | Risk: ${assessment.riskScore} | Decision: ${decision.status}`);
    if (duplicate) {
      console.log(`    Duplicate of: ${duplicate.id}`);
    }
    console.log("");
  }

  if (!applyMode) {
    console.log("ℹ️  --apply を指定すると実際に保存されます。");
    return;
  }

  // Apply mode: write to stores
  let activeCount = 0;
  let quarantinedCount = 0;

  for (const { candidate, assessment, decision, duplicate } of results) {
    if (duplicate) {
      // Update existing entry: increment occurrences, update lastSeenAt
      duplicate.occurrences = (duplicate.occurrences ?? 1) + 1;
      duplicate.lastSeenAt = new Date().toISOString();
      await rewriteMemoryEntries(existingEntries);
      continue;
    }

    const entry: DevMemoryEntry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      kind: candidate.kind,
      summary: candidate.summary,
      trigger: candidate.trigger,
      fix: candidate.fix,
      futurePromptHint: candidate.futurePromptHint,
      relatedFiles: candidate.relatedFiles,
      relatedSymbols: candidate.relatedSymbols,
      tags: candidate.tags,
      severity: candidate.severity,
      confidence: candidate.confidence,
      enabled: decision.status !== "quarantined",
      source: candidate.source,
      captureStatus: decision.status,
      trustLevel: candidate.trustLevel,
      authority: candidate.authority,
      autoCaptured: candidate.autoCaptured,
      evidence: candidate.evidence,
      captureAssessment: assessment,
    };

    if (decision.status === "active") {
      await appendMemoryEntry(entry);
      activeCount++;
    } else if (decision.status === "quarantined") {
      await appendPendingMemoryEntry(entry);
      quarantinedCount++;
    }
    // discarded entries are not saved

    try {
      await appendMemoryAuditEvent({
        eventType: "capture_decision",
        actor: "auto_capture",
        memoryId: entry.id,
        source: "memoryCommands.handleMemoryCapture",
        metadata: {
          decision: decision.status,
          totalScore: assessment.totalScore,
          kind: candidate.kind,
        },
      });
    } catch {
      // Audit failure must not stop capture
    }
  }

  console.log(`✅ Active: ${activeCount} | Quarantined: ${quarantinedCount}`);

  // Run health check post-apply
  const updatedEntries = await readMemoryEntries();
  let storeSizeKb: number | undefined;
  if (await fileExists(MEMORY_STORE_PATH)) {
    const stats = await stat(MEMORY_STORE_PATH);
    storeSizeKb = Math.round(stats.size / 1024);
  }
  const report = calculateMemoryHealth(updatedEntries, { storeSizeKb });
  if (report.level === "warning" || report.level === "critical") {
    console.warn(`⚠️  Health: ${report.level} (score: ${report.overallScore}/100)`);
    if (report.findings.length > 0) {
      console.warn(`   ${report.findings[0].message}`);
    }
  }
}

/** Handle `memory pending list|clear|promote|inspect|discard|prune|stats` subcommand */
export async function handleMemoryPending(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (subcommand === "promote") {
    if (args.includes("--all")) {
      await handlePendingPromoteAll();
    } else {
      await handlePendingPromote(args.slice(1));
    }
    return;
  }

  if (subcommand === "inspect") {
    await handlePendingInspect(args.slice(1));
    return;
  }

  if (subcommand === "discard") {
    await handlePendingDiscard(args.slice(1));
    return;
  }

  if (subcommand === "prune") {
    await handlePendingPrune(args.slice(1));
    return;
  }

  if (subcommand === "stats") {
    await handlePendingStats();
    return;
  }

  if (subcommand === "list" || !subcommand) {
    const entries = await readPendingMemoryEntries();
    if (entries.length === 0) {
      console.log("📭 Pending entries: 0");
      return;
    }
    console.log(`📋 Pending entries (${entries.length}):\n`);
    for (const entry of entries) {
      const score = entry.captureAssessment?.totalScore ?? "?";
      console.log(`  [${entry.kind}] ${entry.summary}`);
      console.log(`    ID: ${entry.id} | Score: ${score}`);
      console.log("");
    }
    return;
  }

  if (subcommand === "clear") {
    const applyMode = args.includes("--apply");
    const entries = await readPendingMemoryEntries();

    if (!applyMode) {
      console.log(`ℹ️  ${entries.length} entries would be cleared. Use --apply to confirm.`);
      return;
    }

    await clearPendingStore();
    console.log(`✅ Pending store cleared (${entries.length} entries removed).`);
    return;
  }

  console.error(`エラー: 不明なサブコマンド "${subcommand}"`);
  console.error("Usage: kiro-studio-kit memory pending list|clear [--apply]|promote <id>|promote --all|inspect <id>|discard <id>|prune [--dry-run]|stats");
  process.exit(1);
}

/** Handle `memory pending promote <id>` subcommand */
export async function handlePendingPromote(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("エラー: IDを指定してください。");
    console.error("Usage: kiro-studio-kit memory pending promote <id>");
    process.exit(1);
  }

  const pendingEntries = await readPendingMemoryEntries();
  const entry = pendingEntries.find((e) => e.id === id);

  if (!entry) {
    console.error(`エラー: ID "${id}" に一致するPendingエントリが見つかりません。`);
    process.exit(1);
  }

  if (entry.deleted === true) {
    console.error(`エラー: ID "${id}" は削除済みです。`);
    process.exit(1);
  }

  if (entry.captureStatus === "discarded") {
    console.error(`エラー: ID "${id}" は既にdiscardされています。`);
    process.exit(1);
  }

  // Capture before state for audit
  const beforeState = { captureStatus: entry.captureStatus ?? "quarantined", enabled: entry.enabled, trustLevel: entry.trustLevel ?? "probation", authority: entry.authority ?? "hint" };

  // Promote: set fields
  entry.trustLevel = "probation";
  entry.enabled = true;
  entry.authority = "hint";
  entry.captureStatus = "active";
  entry.promotedAt = new Date().toISOString();

  // Append to active store
  await appendMemoryEntry(entry);

  // Remove from pending store
  const remaining = pendingEntries.filter((e) => e.id !== id);
  await rewritePendingMemoryEntries(remaining);

  // Record audit event (non-blocking)
  try {
    await appendMemoryAuditEvent({
      eventType: "promote",
      actor: "cli",
      memoryId: id,
      source: "memoryCommands.handlePendingPromote",
      reason: "Manual single promote",
      before: beforeState,
      after: { captureStatus: "active", enabled: true, trustLevel: "probation", authority: "hint" },
    });
  } catch {
    // Audit failure does not block promotion
  }

  console.log(`✅ エントリをPromoteしました: ${id}`);
  console.log(`   trustLevel: probation | authority: hint | captureStatus: active`);
}

/** Handle `memory pending inspect <id>` subcommand */
export async function handlePendingInspect(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("エラー: IDを指定してください。");
    console.error("Usage: kiro-studio-kit memory pending inspect <id>");
    process.exit(1);
  }

  const entries = await readPendingMemoryEntries();
  const entry = entries.find((e) => e.id === id);

  if (!entry) {
    console.error(`エラー: ID "${id}" に一致するPendingエントリが見つかりません。`);
    process.exit(1);
  }

  if (entry.deleted === true) {
    console.error(`エラー: ID "${id}" は削除済みです。`);
    process.exit(1);
  }

  console.log(`ID: ${entry.id}`);
  console.log(`Kind: ${entry.kind}`);
  console.log(`Summary: ${entry.summary}`);
  console.log(`Trigger: ${entry.trigger}`);
  console.log(`Fix: ${entry.fix}`);
  console.log(`FuturePromptHint: ${entry.futurePromptHint}`);
  console.log(`CreatedAt: ${entry.createdAt}`);
  console.log(`CaptureStatus: ${entry.captureStatus ?? "unknown"}`);
  console.log(`TrustLevel: ${entry.trustLevel ?? "unknown"}`);
  console.log(`Authority: ${entry.authority ?? "unknown"}`);
  if (entry.captureAssessment) {
    console.log(`CaptureAssessment: totalScore=${entry.captureAssessment.totalScore}`);
  }
  if (entry.tags.length > 0) {
    console.log(`Tags: ${entry.tags.join(", ")}`);
  }
}

/** Handle `memory pending promote --all` subcommand */
export async function handlePendingPromoteAll(): Promise<void> {
  const pendingEntries = await readPendingMemoryEntries();

  // Capture before states for audit (keyed by id)
  const beforeStates = new Map<string, Record<string, unknown>>();
  for (const entry of pendingEntries) {
    beforeStates.set(entry.id, { captureStatus: entry.captureStatus ?? "quarantined", enabled: entry.enabled, trustLevel: entry.trustLevel ?? "probation", authority: entry.authority ?? "hint" });
  }

  const { promoted, remaining } = promoteAllPendingEntries(pendingEntries);

  if (promoted.length === 0) {
    console.log("📭 No promotable pending entries found.");
    return;
  }

  // Append each promoted entry to active store
  for (const entry of promoted) {
    await appendMemoryEntry(entry);
  }

  // Rewrite pending store with only remaining (deleted/discarded) entries
  await rewritePendingMemoryEntries(remaining);

  // Record audit events (non-blocking)
  for (const entry of promoted) {
    try {
      await appendMemoryAuditEvent({
        eventType: "promote",
        actor: "cli",
        memoryId: entry.id,
        source: "memoryCommands.handlePendingPromoteAll",
        reason: "Bulk promote --all",
        before: beforeStates.get(entry.id) ?? { captureStatus: "quarantined", enabled: false, trustLevel: "probation", authority: "hint" },
        after: { captureStatus: "active", enabled: true, trustLevel: "probation", authority: "hint" },
      });
    } catch {
      // Audit failure does not block promotion
    }
  }

  console.log(`✅ Promoted ${promoted.length} entries to active store.`);
}

/** Handle `memory pending discard <id>` subcommand */
export async function handlePendingDiscard(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("エラー: IDを指定してください。");
    console.error("Usage: kiro-studio-kit memory pending discard <id>");
    process.exit(1);
  }

  const pendingEntries = await readPendingMemoryEntries();

  let result: { updated: DevMemoryEntry[]; discardedEntry: DevMemoryEntry };
  try {
    result = discardPendingEntry(pendingEntries, id);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "not_found") {
      console.error(`エラー: ID "${id}" に一致するPendingエントリが見つかりません。`);
    } else if (msg === "entry_deleted") {
      console.error(`エラー: ID "${id}" は削除済みです。`);
    } else if (msg === "already_discarded") {
      console.error(`エラー: ID "${id}" は既にdiscardされています。`);
    } else {
      console.error(`エラー: ${msg}`);
    }
    process.exit(1);
  }

  await rewritePendingMemoryEntries(result.updated);

  // Record audit event (non-blocking)
  const original = pendingEntries.find(e => e.id === id);
  try {
    await appendMemoryAuditEvent({
      eventType: "discard",
      actor: "cli",
      memoryId: id,
      source: "memoryCommands.handlePendingDiscard",
      reason: "Manual discard",
      before: { captureStatus: original?.captureStatus ?? "quarantined", enabled: original?.enabled ?? false, trustLevel: original?.trustLevel ?? "probation", authority: original?.authority ?? "hint" },
      after: { captureStatus: "discarded", enabled: result.discardedEntry.enabled, trustLevel: result.discardedEntry.trustLevel ?? "probation", authority: result.discardedEntry.authority ?? "hint" },
    });
  } catch {
    // Audit failure does not block discard
  }

  console.log(`✅ エントリをDiscardしました: ${id}`);
}

/** Handle `memory pending prune` subcommand */
export async function handlePendingPrune(args: string[]): Promise<void> {
  const dryRun = args.includes("--dry-run");
  const olderThanIndex = args.indexOf("--older-than-days");
  const thresholdDays = olderThanIndex !== -1 && args[olderThanIndex + 1]
    ? parseInt(args[olderThanIndex + 1], 10)
    : undefined;

  const pendingEntries = await readPendingMemoryEntries();
  const candidates = classifyPrunePendingCandidates(pendingEntries, thresholdDays);

  if (candidates.length === 0) {
    console.log("✅ No prune candidates found.");
    return;
  }

  if (dryRun) {
    console.log(`🔍 Prune candidates (${candidates.length}):\n`);
    for (const c of candidates) {
      console.log(`  [${c.entry.kind}] ${c.entry.summary} (${c.ageInDays} days old)`);
      console.log(`    ID: ${c.entry.id}`);
    }
    console.log("\nUse without --dry-run to apply.");
    return;
  }

  // Apply prune
  const candidateIds = candidates.map(c => c.entry.id);
  const updated = applyPrunePendingEntries(pendingEntries, candidateIds);
  await rewritePendingMemoryEntries(updated);

  // Record audit events (non-blocking)
  for (const c of candidates) {
    try {
      await appendMemoryAuditEvent({
        eventType: "discard",
        actor: "cli",
        memoryId: c.entry.id,
        source: "memoryCommands.handlePendingPrune",
        reason: `Pruned: ${c.ageInDays} days old (threshold: ${thresholdDays ?? 30})`,
        before: { captureStatus: c.entry.captureStatus ?? "quarantined", enabled: c.entry.enabled, trustLevel: c.entry.trustLevel ?? "probation", authority: c.entry.authority ?? "hint" },
        after: { captureStatus: "discarded", enabled: c.entry.enabled, trustLevel: c.entry.trustLevel ?? "probation", authority: c.entry.authority ?? "hint" },
      });
    } catch {
      // Audit failure does not block prune
    }
  }

  console.log(`✅ Pruned ${candidates.length} entries.`);
}

/** Handle `memory pending stats` subcommand */
export async function handlePendingStats(): Promise<void> {
  const pendingEntries = await readPendingMemoryEntries();
  const stats = computePendingStats(pendingEntries);

  console.log("📊 Pending Store Stats\n");
  console.log(`Pending count: ${stats.pendingCount}`);
  console.log(`Old pending (>30d): ${stats.oldPendingCount}`);
  if (stats.oldestPendingAt) {
    console.log(`Oldest pending: ${stats.oldestPendingAt}`);
  }
}

/** Handle `memory trust upgrade <id>` subcommand */
export async function handleTrustUpgrade(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("エラー: IDを指定してください。");
    console.error("Usage: kiro-studio-kit memory trust upgrade <id>");
    process.exit(1);
  }

  const entries = await readMemoryEntries();
  const entry = entries.find((e) => e.id === id);

  if (!entry) {
    console.error(`エラー: ID "${id}" に一致するメモリエントリが見つかりません。`);
    process.exit(1);
  }

  const assessment = assessMemoryTrust(entry);
  const currentLevel = entry.trustLevel ?? "probation";
  const recommended = assessment.recommendedTrustLevel;

  const levelOrder: Record<string, number> = { probation: 0, trusted: 1, verified: 2 };

  if (levelOrder[recommended] <= levelOrder[currentLevel]) {
    console.log(`ℹ️  ID "${id}" は既に推奨レベル以上です (current: ${currentLevel}, recommended: ${recommended})`);
    return;
  }

  // Apply upgrade
  entry.trustLevel = recommended;
  entry.trustScore = assessment.trustScore;

  if (recommended === "trusted") {
    entry.promotedAt = new Date().toISOString();
  } else if (recommended === "verified") {
    entry.verifiedAt = new Date().toISOString();
  }

  await rewriteMemoryEntries(entries);
  console.log(`✅ Trust upgrade: ${id}`);
  console.log(`   ${currentLevel} → ${recommended} (score: ${assessment.trustScore})`);
}

/** Handle `memory trust degrade <id>` subcommand */
export async function handleTrustDegrade(args: string[]): Promise<void> {
  const id = args.find(a => !a.startsWith("--"));
  if (!id) {
    console.error("エラー: IDを指定してください。");
    console.error("Usage: kiro-studio-kit memory trust degrade <id> [--reason <text>]");
    process.exit(1);
  }

  const reason = getOption(args, "reason");

  const entries = await readMemoryEntries();
  const entry = entries.find((e) => e.id === id);

  if (!entry) {
    console.error(`エラー: ID "${id}" に一致するメモリエントリが見つかりません。`);
    process.exit(1);
  }

  if (entry.deleted === true) {
    console.error(`エラー: ID "${id}" は削除済みです。`);
    process.exit(1);
  }

  const currentLevel = entry.trustLevel ?? "probation";

  if (currentLevel === "probation") {
    console.log(`ℹ️  ID "${id}" は既にprobationレベルです。これ以上降格できません。`);
    return;
  }

  const beforeLevel = currentLevel;
  entry.trustLevel = "probation";
  entry.degradedAt = new Date().toISOString();

  await rewriteMemoryEntries(entries);

  // Record audit event (non-blocking)
  try {
    await appendMemoryAuditEvent({
      eventType: "trust_update",
      actor: "cli",
      memoryId: id,
      source: "memoryCommands.handleTrustDegrade",
      reason: reason ?? `Manual degrade: ${beforeLevel} → probation`,
      before: { trustLevel: beforeLevel, trustScore: entry.trustScore },
      after: { trustLevel: "probation", trustScore: entry.trustScore },
      metadata: { operation: "manual_degrade" },
    });
  } catch {
    // Audit failure does not block degrade
  }

  console.log(`✅ Trust degrade: ${id}`);
  console.log(`   ${beforeLevel} → probation`);
}

/** Handle `memory trust lifecycle [--dry-run]` subcommand */
export async function handleTrustLifecycle(args: string[]): Promise<void> {
  const dryRun = args.includes("--dry-run");
  const entries = await readMemoryEntries();

  const decisions: Array<{ id: string; action: TrustLifecycleAction; reason: string; entry: DevMemoryEntry }> = [];

  for (const entry of entries) {
    const decision = assessTrustLifecycleAction(entry);
    if (decision.action !== "none") {
      decisions.push({ id: entry.id, action: decision.action, reason: decision.reason, entry });
    }
  }

  if (decisions.length === 0) {
    console.log("✅ Trust lifecycle: no candidates found.");
    return;
  }

  if (dryRun) {
    console.log(`🔍 Trust lifecycle candidates (${decisions.length}):\n`);
    for (const d of decisions) {
      console.log(`  ${d.id.slice(0, 8)}... ${d.action} — ${d.reason}`);
    }
    console.log("\nUse without --dry-run to apply.");
    return;
  }

  // Apply decisions
  const updatedIds: string[] = [];
  for (const d of decisions) {
    const decision = assessTrustLifecycleAction(d.entry);
    const updated = applyTrustLifecycleDecision(d.entry, decision);
    // Apply changes to the entry in-place for rewrite
    const idx = entries.findIndex(e => e.id === d.id);
    if (idx !== -1) {
      entries[idx] = updated;
      updatedIds.push(d.id);
    }
  }

  await rewriteMemoryEntries(entries);

  // Record audit events (non-blocking)
  for (const d of decisions) {
    try {
      await appendMemoryAuditEvent({
        eventType: "trust_update",
        actor: "cli",
        memoryId: d.id,
        source: "memoryCommands.handleTrustLifecycle",
        reason: d.reason,
        before: { trustLevel: d.entry.trustLevel ?? "probation", trustScore: d.entry.trustScore },
        after: { trustLevel: d.action === "upgrade_to_trusted" ? "trusted" : "probation", trustScore: d.action === "upgrade_to_trusted" ? Math.max(d.entry.trustScore ?? 0, 50) : Math.min(d.entry.trustScore ?? 50, 30) },
        metadata: { operation: "lifecycle" },
      });
    } catch {
      // Audit failure does not block lifecycle
    }
  }

  console.log(`✅ Trust lifecycle: ${updatedIds.length} entries updated.`);
}

/** Handle `memory trust verify <id> [--reason <text>]` subcommand */
export async function handleTrustVerify(args: string[]): Promise<void> {
  const id = args.find(a => !a.startsWith("--"));
  if (!id) {
    console.error("エラー: IDを指定してください。");
    console.error("Usage: kiro-studio-kit memory trust verify <id> [--reason <text>]");
    process.exit(1);
  }

  const reason = getOption(args, "reason");

  const entries = await readMemoryEntries();
  const entry = entries.find((e) => e.id === id);

  if (!entry) {
    console.error(`エラー: ID "${id}" に一致するメモリエントリが見つかりません。`);
    process.exit(1);
  }

  if (entry.deleted === true) {
    console.error(`エラー: ID "${id}" は削除済みです。`);
    process.exit(1);
  }

  if (entry.enabled === false) {
    console.error(`エラー: ID "${id}" は無効化されています。`);
    process.exit(1);
  }

  const beforeLevel = entry.trustLevel ?? "probation";
  const beforeScore = entry.trustScore;

  // Apply manual_verify decision
  const decision = {
    action: "manual_verify" as const,
    reason: reason ?? "Manual verification",
    beforeTrustLevel: beforeLevel,
    afterTrustLevel: "verified" as const,
  };
  const updated = applyTrustLifecycleDecision(entry, decision);

  // Replace in entries array
  const idx = entries.findIndex(e => e.id === id);
  entries[idx] = updated;

  await rewriteMemoryEntries(entries);

  // Record audit event (non-blocking)
  try {
    await appendMemoryAuditEvent({
      eventType: "trust_update",
      actor: "cli",
      memoryId: id,
      source: "memoryCommands.handleTrustVerify",
      reason: reason ?? "Manual verification",
      before: { trustLevel: beforeLevel, trustScore: beforeScore },
      after: { trustLevel: "verified", trustScore: 100 },
      metadata: { operation: "manual_verify" },
    });
  } catch {
    // Audit failure does not block verify
  }

  console.log(`✅ Trust verify: ${id}`);
  console.log(`   ${beforeLevel} → verified (score: 100)`);
}

/** Handle `memory trust audit [--apply]` subcommand */
export async function handleTrustAudit(args: string[]): Promise<void> {
  const applyMode = args.includes("--apply");
  const entries = await readMemoryEntries();

  const activeEntries = entries.filter((e) => e.enabled && e.deleted !== true);

  const candidates: Array<{
    entry: DevMemoryEntry;
    currentLevel: string;
    recommendedLevel: string;
    score: number;
  }> = [];

  for (const entry of activeEntries) {
    const assessment = assessMemoryTrust(entry);
    const currentLevel = entry.trustLevel ?? "probation";
    if (assessment.recommendedTrustLevel !== currentLevel) {
      candidates.push({
        entry,
        currentLevel,
        recommendedLevel: assessment.recommendedTrustLevel,
        score: assessment.trustScore,
      });
    }
  }

  if (candidates.length === 0) {
    console.log("✅ Trust audit: すべてのエントリが推奨レベルと一致しています。");
    return;
  }

  const upgrades = candidates.filter((c) => {
    const levelOrder: Record<string, number> = { probation: 0, trusted: 1, verified: 2 };
    return levelOrder[c.recommendedLevel] > levelOrder[c.currentLevel];
  });
  const downgrades = candidates.filter((c) => {
    const levelOrder: Record<string, number> = { probation: 0, trusted: 1, verified: 2 };
    return levelOrder[c.recommendedLevel] < levelOrder[c.currentLevel];
  });

  console.log(`📋 Trust Audit (${applyMode ? "--apply" : "dry-run"}):\n`);
  console.log(`  Candidates: ${candidates.length} (upgrades: ${upgrades.length}, downgrades: ${downgrades.length})\n`);

  for (const c of candidates) {
    console.log(`  ${c.entry.id.slice(0, 8)}... ${c.currentLevel} → ${c.recommendedLevel} (score: ${c.score})`);
  }

  if (!applyMode) {
    console.log("\n  --apply を指定すると実際に変更されます。");
    return;
  }

  // Apply changes
  for (const c of candidates) {
    const levelOrder: Record<string, number> = { probation: 0, trusted: 1, verified: 2 };
    c.entry.trustLevel = c.recommendedLevel as "probation" | "trusted" | "verified";
    c.entry.trustScore = c.score;

    if (levelOrder[c.recommendedLevel] > levelOrder[c.currentLevel]) {
      if (c.recommendedLevel === "trusted") {
        c.entry.promotedAt = new Date().toISOString();
      } else if (c.recommendedLevel === "verified") {
        c.entry.verifiedAt = new Date().toISOString();
      }
    } else {
      c.entry.degradedAt = new Date().toISOString();
    }
  }

  await rewriteMemoryEntries(entries);
  console.log(`\n✅ ${candidates.length} 件の変更を適用しました。`);
}

/** Handle `memory usage stats` subcommand */
export async function handleMemoryUsageStats(): Promise<void> {
  const entries = await readMemoryEntries();
  const active = entries.filter((e) => e.enabled && e.deleted !== true);

  const neverSelected = active.filter((e) => !e.usageStats || e.usageStats.selectedCount === 0).length;
  const selected5Plus = active.filter((e) => (e.usageStats?.selectedCount ?? 0) >= 5).length;
  const selected20Plus = active.filter((e) => (e.usageStats?.selectedCount ?? 0) >= 20).length;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentlyActive = active.filter((e) => {
    if (!e.usageStats?.lastSelectedAt) return false;
    return new Date(e.usageStats.lastSelectedAt).getTime() > thirtyDaysAgo.getTime();
  }).length;

  console.log("📊 Memory Usage Stats\n");
  console.log(`Total tracked: ${active.length}`);
  console.log(`Never selected: ${neverSelected}`);
  console.log(`Selected >= 5: ${selected5Plus}`);
  console.log(`Selected >= 20: ${selected20Plus}`);
  console.log(`Recently selected (30d): ${recentlyActive}`);

  // Top selected
  const sorted = active
    .filter((e) => (e.usageStats?.selectedCount ?? 0) > 0)
    .sort((a, b) => (b.usageStats?.selectedCount ?? 0) - (a.usageStats?.selectedCount ?? 0))
    .slice(0, 5);

  if (sorted.length > 0) {
    console.log("\nTop selected:");
    for (const e of sorted) {
      console.log(`  ${e.id} (${e.usageStats?.selectedCount ?? 0})`);
    }
  }

  // Feedback stats
  const totalSuccessful = active.reduce((sum, e) => sum + (e.usageStats?.successfulSelections ?? 0), 0);
  const totalRejected = active.reduce((sum, e) => sum + (e.usageStats?.rejectedSelections ?? 0), 0);
  const denominator = totalSuccessful + totalRejected;
  const successRate = denominator > 0
    ? (totalSuccessful / denominator).toFixed(2)
    : "n/a";

  console.log(`\nFeedback:`);
  console.log(`  Successful selections: ${totalSuccessful}`);
  console.log(`  Rejected selections: ${totalRejected}`);
  console.log(`  Success rate: ${successRate}`);
}

/** Handle `memory usage reset <id>` subcommand */
export async function handleMemoryUsageReset(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("エラー: IDを指定してください。");
    process.exit(1);
  }

  const entries = await readMemoryEntries();
  const entry = entries.find((e) => e.id === id);

  if (!entry) {
    console.error(`エラー: ID "${id}" に一致するメモリエントリが見つかりません。`);
    process.exit(1);
  }

  const beforeStats = entry.usageStats
    ? { ...entry.usageStats }
    : { selectedCount: 0, successfulSelections: 0, rejectedSelections: 0 };

  entry.usageStats = {
    selectedCount: 0,
    successfulSelections: 0,
    rejectedSelections: 0,
  };

  await rewriteMemoryEntries(entries);

  try {
    await appendMemoryAuditEvent({
      eventType: "usage_reset",
      actor: "cli",
      memoryId: id,
      source: "memoryCommands.handleMemoryUsageReset",
      before: beforeStats as Record<string, unknown>,
      after: { selectedCount: 0, successfulSelections: 0, rejectedSelections: 0 },
    });
  } catch {
    // Audit failure must not stop reset
  }

  console.log(`✅ Usage stats reset: ${id}`);
}

/** Handle `memory usage mark-success <id> [--reason <text>]` subcommand */
export async function handleMemoryUsageMarkSuccess(args: string[]): Promise<void> {
  const id = args[0];
  if (!id || id.startsWith("--")) {
    console.error("エラー: IDを指定してください。");
    console.error("Usage: kiro-studio-kit memory usage mark-success <id> [--reason <text>]");
    process.exit(1);
  }
  const reason = getOption(args, "reason");
  const result = await markMemorySelectionSuccess(id, { reason: reason ?? undefined });
  if (result.error) {
    console.error(`エラー: ${result.error}`);
    process.exit(1);
  }
  console.log(`✅ Marked as success: ${id}`);
}

/** Handle `memory usage mark-rejected <id> [--reason <text>]` subcommand */
export async function handleMemoryUsageMarkRejected(args: string[]): Promise<void> {
  const id = args[0];
  if (!id || id.startsWith("--")) {
    console.error("エラー: IDを指定してください。");
    console.error("Usage: kiro-studio-kit memory usage mark-rejected <id> [--reason <text>]");
    process.exit(1);
  }
  const reason = getOption(args, "reason");
  const result = await markMemorySelectionRejected(id, { reason: reason ?? undefined });
  if (result.error) {
    console.error(`エラー: ${result.error}`);
    process.exit(1);
  }
  console.log(`✅ Marked as rejected: ${id}`);
}

/** Handle `memory audit log [--limit N]` subcommand */
export async function handleMemoryAuditLog(args: string[]): Promise<void> {
  const limitIndex = args.indexOf("--limit");
  const limit = limitIndex !== -1 && args[limitIndex + 1]
    ? parseInt(args[limitIndex + 1], 10)
    : 20;

  const events = await readMemoryAuditEvents();

  if (events.length === 0) {
    console.log("📭 No audit events found.");
    return;
  }

  const recent = events.reverse().slice(0, limit);
  console.log(`📋 Audit Log (${recent.length} of ${events.length} events):\n`);
  for (const event of recent) {
    const memId = event.memoryId ? ` memory=${event.memoryId.slice(0, 8)}...` : "";
    console.log(`  ${event.timestamp} [${event.eventType}] actor=${event.actor}${memId}`);
    if (event.reason) console.log(`    Reason: ${event.reason}`);
  }
}

/** Handle `memory audit inspect <memoryId>` subcommand */
export async function handleMemoryAuditInspect(args: string[]): Promise<void> {
  const memoryId = args[0];
  if (!memoryId) {
    console.error("エラー: memory IDを指定してください。");
    console.error("Usage: kiro-studio-kit memory audit inspect <memoryId>");
    process.exit(1);
  }

  const events = await findMemoryAuditEvents(memoryId);

  if (events.length === 0) {
    console.log(`📭 No audit events found for ${memoryId}.`);
    return;
  }

  console.log(`📜 Audit Trail: ${memoryId} (${events.length} events)\n`);
  for (const event of events) {
    console.log(`  ${event.timestamp} ${event.eventType} by ${event.actor}`);
    if (event.reason) console.log(`    Reason: ${event.reason}`);
    if (event.before && event.after) {
      console.log(`    Before: ${JSON.stringify(event.before)}`);
      console.log(`    After: ${JSON.stringify(event.after)}`);
    }
    if (event.metadata) console.log(`    Metadata: ${JSON.stringify(event.metadata)}`);
    console.log("");
  }
}

/** Handle `memory doctor` subcommand */
export async function handleMemoryDoctor(): Promise<void> {
  const entries = await readMemoryEntries();
  const report = detectMemoryIssues(entries);

  console.log("🏥 Memory Doctor Report\n");
  console.log(`  Scanned: ${report.scannedCount}`);
  console.log(`  Issues: ${report.issueCount}`);
  console.log(`  Repairable: ${report.repairableCount}`);

  if (report.issues.length === 0) {
    console.log("\n✅ No issues found.");
    return;
  }

  const errors = report.issues.filter(i => i.severity === "error");
  const warnings = report.issues.filter(i => i.severity === "warning");
  const infos = report.issues.filter(i => i.severity === "info");

  if (errors.length > 0) {
    console.log(`\n🚨 Errors (${errors.length}):`);
    for (const i of errors) console.log(`  ${i.id.slice(0, 8)}... [${i.type}] ${i.message}`);
  }
  if (warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${warnings.length}):`);
    for (const i of warnings) console.log(`  ${i.id.slice(0, 8)}... [${i.type}] ${i.message}`);
  }
  if (infos.length > 0) {
    console.log(`\nℹ️  Info (${infos.length}):`);
    for (const i of infos) console.log(`  ${i.id.slice(0, 8)}... [${i.type}] ${i.message}`);
  }

  if (report.repairableCount > 0) {
    console.log(`\nRun \`ksk memory repair apply\` to fix ${report.repairableCount} repairable issues.`);
  }
}

/** Handle `memory repair` subcommand */
export async function handleMemoryRepair(args: string[]): Promise<void> {
  const applyMode = args.includes("apply");
  const dryRun = !applyMode;

  const { report, result } = await repairMemoryStore({ dryRun });

  if (report.issueCount === 0) {
    console.log("✅ No issues to repair.");
    return;
  }

  if (dryRun) {
    console.log(`🔍 Repair preview (${report.repairableCount} repairable of ${report.issueCount} issues):\n`);
    for (const i of report.issues.filter(i => i.repairable)) {
      console.log(`  ${i.id.slice(0, 8)}... [${i.type}] ${i.message}`);
    }
    console.log("\nUse `ksk memory repair apply` to execute repairs.");
  } else if (result) {
    console.log(`✅ Repair complete: ${result.repairedCount} entries repaired.`);
    if (result.skippedIds.length > 0) {
      console.log(`   Skipped: ${result.skippedIds.length} (non-repairable or not found)`);
    }
  }
}

/** Handle `memory decay` subcommand */
export async function handleMemoryDecay(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (subcommand === "inspect") {
    await handleDecayInspect(args.slice(1));
  } else if (subcommand === "list") {
    await handleDecayList();
  } else if (subcommand === "review") {
    await handleDecayReview(args.slice(1));
  } else if (subcommand === "set-expiry") {
    await handleDecaySetExpiry(args.slice(1));
  } else if (subcommand === "disable-expired") {
    await handleDecayDisableExpired(args.slice(1));
  } else {
    console.error("Usage: kiro-studio-kit memory decay inspect|list|review|set-expiry|disable-expired");
    process.exit(1);
  }
}

async function handleDecayInspect(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) { console.error("エラー: IDを指定してください。"); process.exit(1); }

  const entries = await readMemoryEntries();
  const entry = entries.find(e => e.id === id);
  if (!entry) { console.error(`エラー: ID "${id}" が見つかりません。`); process.exit(1); }

  const status = getMemoryDecayStatus(entry);
  console.log(`📋 Decay info for ${id}:`);
  console.log(`  expiresAt: ${entry.expiresAt ?? "(not set)"}`);
  console.log(`  lastReviewedAt: ${entry.lastReviewedAt ?? "(not set)"}`);
  console.log(`  staleAfterDays: ${entry.staleAfterDays ?? "(default)"}`);
  console.log(`  expired: ${status.expired}`);
  console.log(`  stale: ${status.stale}`);
  console.log(`  reviewDue: ${status.reviewDue}`);
  console.log(`  reason: ${status.reason}`);
}

async function handleDecayList(): Promise<void> {
  const entries = await readMemoryEntries();
  const active = entries.filter(e => e.enabled && e.deleted !== true);

  const expired = active.filter(e => isExpiredMemory(e));
  const stale = active.filter(e => isStaleMemory(e));
  const reviewDue = active.filter(e => isReviewDueMemory(e));

  if (expired.length === 0 && stale.length === 0 && reviewDue.length === 0) {
    console.log("📭 No expired, stale, or review-due entries found.");
    return;
  }

  if (expired.length > 0) {
    console.log(`⏰ Expired (${expired.length}):`);
    for (const e of expired) console.log(`  ${e.id.slice(0, 8)}... ${e.summary}`);
    console.log("");
  }
  if (stale.length > 0) {
    console.log(`📅 Stale (${stale.length}):`);
    for (const e of stale) console.log(`  ${e.id.slice(0, 8)}... ${e.summary}`);
    console.log("");
  }
  console.log(`📋 Review due: ${reviewDue.length} entries total`);
}

async function handleDecayReview(args: string[]): Promise<void> {
  const ids = args.filter(a => !a.startsWith("--"));
  if (ids.length === 0) { console.error("エラー: 1件以上のIDを指定してください。"); process.exit(1); }

  try {
    const result = await markMemoryReviewed(ids);
    console.log(`✅ Reviewed: ${result.updatedIds.length} entries marked.`);
  } catch (err) {
    console.error(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

async function handleDecaySetExpiry(args: string[]): Promise<void> {
  const expiresAt = args[0];
  const ids = args.slice(1).filter(a => !a.startsWith("--"));
  if (!expiresAt || ids.length === 0) {
    console.error("Usage: kiro-studio-kit memory decay set-expiry <expiresAt> <id1> [id2...]");
    process.exit(1);
  }

  try {
    const result = await setMemoryExpiry(ids, expiresAt);
    console.log(`✅ Expiry set to ${expiresAt} on ${result.updatedIds.length} entries.`);
  } catch (err) {
    console.error(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

async function handleDecayDisableExpired(args: string[]): Promise<void> {
  const dryRun = args.includes("--dry-run");

  const result = await disableExpiredMemories({ dryRun });

  if (result.candidateIds.length === 0) {
    console.log("✅ No expired entries to disable.");
    return;
  }

  if (dryRun) {
    console.log(`🔍 Expired candidates (${result.candidateIds.length}):`);
    for (const id of result.candidateIds) console.log(`  ${id.slice(0, 8)}...`);
    console.log("\nUse without --dry-run to disable.");
  } else {
    console.log(`✅ Disabled ${result.updatedIds.length} expired entries.`);
  }
}

/** Handle `memory scope` subcommand */
export async function handleMemoryScope(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (subcommand === "inspect") {
    await handleScopeInspect();
  } else if (subcommand === "set") {
    await handleScopeSet(args.slice(1));
  } else if (subcommand === "show") {
    await handleScopeShow(args.slice(1));
  } else if (subcommand === "list") {
    await handleScopeList();
  } else {
    console.error("Usage: kiro-studio-kit memory scope inspect|set|show|list");
    process.exit(1);
  }
}

async function handleScopeInspect(): Promise<void> {
  const { context, source, warnings } = await loadMemoryScopeContext();
  console.log("🔍 Memory Scope Context\n");
  console.log(`  Source: ${source}`);
  console.log(`  currentProjectId: ${context.currentProjectId ?? "(not set)"}`);
  console.log(`  allowedDomains: ${context.allowedDomains?.join(", ") ?? "(not set)"}`);
  console.log(`  includeGlobal: ${context.includeGlobal}`);
  console.log(`  includeUnscoped: ${context.includeUnscoped}`);
  console.log(`  includeTemporary: ${context.includeTemporary}`);
  if (warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${warnings.length}):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
}

async function handleScopeSet(args: string[]): Promise<void> {
  const scope = args[0] as MemoryScope | undefined;
  const validScopes: MemoryScope[] = ["global", "project", "domain", "temporary"];
  if (!scope || !validScopes.includes(scope)) {
    console.error(`エラー: scope は ${validScopes.join(", ")} のいずれかを指定してください。`);
    console.error("Usage: kiro-studio-kit memory scope set <scope> <id1> [id2...] [--project <id>] [--domain <d>]");
    process.exit(1);
  }

  const ids = args.slice(1).filter(a => !a.startsWith("--"));
  const projectId = getOption(args, "project");
  const domain = getOption(args, "domain");
  const reason = getOption(args, "reason");

  if (ids.length === 0) {
    console.error("エラー: 1件以上のIDを指定してください。");
    process.exit(1);
  }

  try {
    const result = await setMemoryScope(ids, scope, {
      projectId: projectId ?? undefined,
      domains: domain ? [domain] : undefined,
      reason: reason ?? undefined,
    });
    console.log(`✅ Scope set to '${scope}' on ${result.updatedIds.length} entries.`);
  } catch (err) {
    console.error(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

async function handleScopeShow(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("エラー: IDを指定してください。");
    process.exit(1);
  }

  const entries = await readMemoryEntries();
  const entry = entries.find(e => e.id === id);
  if (!entry) {
    console.error(`エラー: ID "${id}" に一致するエントリが見つかりません。`);
    process.exit(1);
  }

  console.log(`📋 Scope info for ${id}:`);
  console.log(`  scope: ${entry.scope ?? "(unscoped)"}`);
  console.log(`  project: ${entry.project ?? "(not set)"}`);
  console.log(`  domains: ${entry.domains?.join(", ") ?? "(not set)"}`);
}

async function handleScopeList(): Promise<void> {
  const entries = await readMemoryEntries();
  const active = entries.filter(e => e.enabled && e.deleted !== true);

  const counts: Record<string, number> = { global: 0, project: 0, domain: 0, temporary: 0, unscoped: 0 };
  for (const e of active) {
    const s = e.scope ?? "unscoped";
    counts[s] = (counts[s] ?? 0) + 1;
  }

  console.log("📋 Memory Scope Distribution:\n");
  for (const [scope, count] of Object.entries(counts)) {
    if (count > 0) console.log(`  ${scope}: ${count}`);
  }
}

/** Handle `memory duplicate` subcommand */
export async function handleMemoryDuplicate(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (subcommand === "mark") {
    await handleDuplicateMark(args.slice(1));
  } else if (subcommand === "clear") {
    await handleDuplicateClear(args.slice(1));
  } else if (subcommand === "inspect") {
    await handleDuplicateInspect(args.slice(1));
  } else if (subcommand === "list") {
    await handleDuplicateList();
  } else {
    console.error("Usage: kiro-studio-kit memory duplicate mark|clear|inspect|list");
    process.exit(1);
  }
}

async function handleDuplicateMark(args: string[]): Promise<void> {
  const canonicalId = args[0];
  const duplicateId = args[1];
  const reason = getOption(args, "reason");

  if (!canonicalId || !duplicateId) {
    console.error("エラー: canonical-id と duplicate-id を指定してください。");
    console.error("Usage: kiro-studio-kit memory duplicate mark <canonical-id> <duplicate-id> [--reason <text>]");
    process.exit(1);
  }

  try {
    await markMemoryDuplicate(canonicalId, duplicateId, { reason: reason ?? undefined });
    console.log(`✅ Duplicate marked: ${duplicateId} → duplicate of ${canonicalId}`);
  } catch (err) {
    console.error(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

async function handleDuplicateClear(args: string[]): Promise<void> {
  const duplicateId = args.find(a => !a.startsWith("--"));
  const reason = getOption(args, "reason");
  const reEnable = args.includes("--re-enable");

  if (!duplicateId) {
    console.error("エラー: duplicate-id を指定してください。");
    console.error("Usage: kiro-studio-kit memory duplicate clear <duplicate-id> [--reason <text>] [--re-enable]");
    process.exit(1);
  }

  try {
    await clearMemoryDuplicate(duplicateId, { reason: reason ?? undefined, reEnable });
    console.log(`✅ Duplicate cleared: ${duplicateId}${reEnable ? " (re-enabled)" : ""}`);
  } catch (err) {
    console.error(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

async function handleDuplicateInspect(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("エラー: IDを指定してください。");
    process.exit(1);
  }

  const entries = await readMemoryEntries();
  const info = findDuplicateInfo(entries, id);

  if (!info.entry) {
    console.error(`エラー: ID "${id}" に一致するエントリが見つかりません。`);
    process.exit(1);
  }

  console.log(`📋 Duplicate info for ${id}:`);
  console.log(`  Role: ${info.role}`);
  if (info.canonicalId) console.log(`  Canonical: ${info.canonicalId}`);
  if (info.duplicateIds.length > 0) console.log(`  Duplicates: ${info.duplicateIds.join(", ")}`);
  console.log(`  duplicateOf: ${info.entry.duplicateOf ?? "(none)"}`);
  console.log(`  mergedInto: ${info.entry.mergedInto ?? "(none)"}`);
  console.log(`  duplicates: ${info.entry.duplicates?.join(", ") ?? "(none)"}`);
}

async function handleDuplicateList(): Promise<void> {
  const entries = await readMemoryEntries();
  const groups = listDuplicateGroups(entries);

  if (groups.length === 0) {
    console.log("📭 No duplicate groups found.");
    return;
  }

  console.log(`📋 Duplicate Groups (${groups.length}):\n`);
  for (const group of groups) {
    const canonical = entries.find(e => e.id === group.canonicalId);
    console.log(`  Canonical: ${group.canonicalId.slice(0, 8)}... ${canonical?.summary ?? ""}`);
    for (const dupId of group.duplicateIds) {
      const dup = entries.find(e => e.id === dupId);
      console.log(`    Duplicate: ${dupId.slice(0, 8)}... ${dup?.summary ?? ""}`);
    }
    console.log("");
  }
}

/** Handle `memory conflict` subcommand */
export async function handleMemoryConflict(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (subcommand === "group") {
    await handleConflictGroup(args.slice(1));
  } else if (subcommand === "supersede") {
    await handleConflictSupersede(args.slice(1));
  } else if (subcommand === "inspect") {
    await handleConflictInspect(args.slice(1));
  } else if (subcommand === "list") {
    await handleConflictList();
  } else {
    console.error("Usage: kiro-studio-kit memory conflict group|supersede|inspect|list");
    process.exit(1);
  }
}

async function handleConflictGroup(args: string[]): Promise<void> {
  const conflictKey = args[0];
  const ids = args.slice(1).filter(a => !a.startsWith("--"));

  if (!conflictKey || ids.length < 2) {
    console.error("エラー: conflict group には conflictKey と 2件以上のIDが必要です。");
    console.error("Usage: kiro-studio-kit memory conflict group <conflictKey> <id1> <id2> [id3...]");
    process.exit(1);
  }

  try {
    const result = await setMemoryConflictGroup(conflictKey, ids);
    console.log(`✅ Conflict group '${conflictKey}' set on ${result.updatedIds.length} entries.`);
  } catch (err) {
    console.error(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

async function handleConflictSupersede(args: string[]): Promise<void> {
  const oldId = args[0];
  const newId = args[1];

  if (!oldId || !newId) {
    console.error("エラー: older-id と newer-id を指定してください。");
    console.error("Usage: kiro-studio-kit memory conflict supersede <older-id> <newer-id> [--reason <text>]");
    process.exit(1);
  }

  try {
    const result = await supersedeMemory(oldId, newId);
    console.log(`✅ Supersede: ${oldId} → ${newId}`);
    console.log(`   ${oldId}: enabled=false, disabledReason=superseded`);
    console.log(`   ${newId}: supersedes=[...${result.newEntry.supersedes?.join(", ") ?? ""}]`);
  } catch (err) {
    console.error(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

async function handleConflictInspect(args: string[]): Promise<void> {
  const idOrGroup = args[0];
  if (!idOrGroup) {
    console.error("エラー: IDまたはconflictGroupを指定してください。");
    console.error("Usage: kiro-studio-kit memory conflict inspect <id-or-group>");
    process.exit(1);
  }

  const entries = await readMemoryEntries();

  // Try as entry ID first
  const entry = entries.find(e => e.id === idOrGroup);
  if (entry) {
    console.log(`📋 Conflict info for ${entry.id}:`);
    console.log(`  conflictKey: ${entry.conflictKey ?? "(none)"}`);
    console.log(`  supersedes: ${entry.supersedes?.join(", ") ?? "(none)"}`);
    console.log(`  supersededBy: ${entry.supersededBy ?? "(none)"}`);
    console.log(`  disabledReason: ${entry.disabledReason ?? "(none)"}`);
    console.log(`  enabled: ${entry.enabled}`);
    return;
  }

  // Try as conflict group name
  const groupEntries = entries.filter(e => e.conflictKey === idOrGroup);
  if (groupEntries.length > 0) {
    console.log(`📋 Conflict group '${idOrGroup}' (${groupEntries.length} entries):\n`);
    for (const e of groupEntries) {
      const status = e.supersededBy ? "[superseded]" : e.enabled ? "[active]" : "[disabled]";
      console.log(`  ${e.id.slice(0, 8)}... ${status} [${e.trustLevel ?? "probation"}] ${e.summary}`);
    }
    return;
  }

  console.error(`エラー: "${idOrGroup}" に一致するエントリまたはconflictGroupが見つかりません。`);
  process.exit(1);
}

async function handleConflictList(): Promise<void> {
  const entries = await readMemoryEntries();
  const groups = groupByConflictGroup(entries);
  const superseded = entries.filter(e => e.supersededBy);

  if (groups.size === 0 && superseded.length === 0) {
    console.log("📭 No conflict groups or superseded entries found.");
    return;
  }

  if (groups.size > 0) {
    console.log(`📋 Conflict Groups (${groups.size}):\n`);
    for (const [key, group] of groups) {
      console.log(`  [${key}] (${group.length} entries)`);
      for (const e of group) {
        const status = e.supersededBy ? "superseded" : e.enabled ? "active" : "disabled";
        console.log(`    ${e.id.slice(0, 8)}... ${status} [${e.trustLevel ?? "probation"}] ${e.summary}`);
      }
      console.log("");
    }
  }

  if (superseded.length > 0) {
    console.log(`📋 Superseded Entries (${superseded.length}):\n`);
    for (const e of superseded) {
      console.log(`  ${e.id.slice(0, 8)}... superseded by ${e.supersededBy?.slice(0, 8)}... — ${e.summary}`);
    }
  }
}

/** Route `memory` subcommand to appropriate handler */
export async function handleMemory(args: string[]): Promise<void> {
  const subcommand = args[0];

  switch (subcommand) {
    case "add":
      await handleMemoryAdd(args.slice(1));
      break;
    case "list":
      await handleMemoryList();
      break;
    case "search":
      await handleMemorySearch(args.slice(1));
      break;
    case "inspect":
      await handleMemoryInspect(args.slice(1));
      break;
    case "stats":
      await handleMemoryStats();
      break;
    case "disable":
      await handleMemoryDisable(args.slice(1));
      break;
    case "enable":
      await handleMemoryEnable(args.slice(1));
      break;
    case "delete":
      await handleMemoryDelete(args.slice(1));
      break;
    case "supersede":
      await handleMemorySupersede(args.slice(1));
      break;
    case "prune":
      await handleMemoryPrune(args.slice(1));
      break;
    case "compact":
      await handleMemoryCompact(args.slice(1));
      break;
    case "health":
      await handleMemoryHealth();
      break;
    case "history":
      await handleMemoryHistory(args.slice(1));
      break;
    case "capture":
      await handleMemoryCapture(args.slice(1));
      break;
    case "pending":
      await handleMemoryPending(args.slice(1));
      break;
    case "conflict":
      await handleMemoryConflict(args.slice(1));
      break;
    case "duplicate":
      await handleMemoryDuplicate(args.slice(1));
      break;
    case "scope":
      await handleMemoryScope(args.slice(1));
      break;
    case "decay":
      await handleMemoryDecay(args.slice(1));
      break;
    case "doctor":
      await handleMemoryDoctor();
      break;
    case "repair":
      await handleMemoryRepair(args.slice(1));
      break;
    case "trust": {
      const trustSub = args[1];
      if (trustSub === "lifecycle") {
        await handleTrustLifecycle(args.slice(2));
      } else if (trustSub === "verify") {
        await handleTrustVerify(args.slice(2));
      } else if (trustSub === "upgrade") {
        await handleTrustUpgrade(args.slice(2));
      } else if (trustSub === "degrade") {
        await handleTrustDegrade(args.slice(2));
      } else if (trustSub === "audit") {
        await handleTrustAudit(args.slice(2));
      } else {
        console.error(`エラー: 不明なtrustサブコマンド "${trustSub ?? ""}"`);
        console.error("Usage: kiro-studio-kit memory trust lifecycle|verify|upgrade|degrade|audit");
        process.exit(1);
      }
      break;
    }
    case "usage": {
      const usageSub = args[1];
      if (usageSub === "stats") {
        await handleMemoryUsageStats();
      } else if (usageSub === "reset") {
        await handleMemoryUsageReset(args.slice(2));
      } else if (usageSub === "mark-success") {
        await handleMemoryUsageMarkSuccess(args.slice(2));
      } else if (usageSub === "mark-rejected") {
        await handleMemoryUsageMarkRejected(args.slice(2));
      } else {
        showMemoryUsage();
        process.exit(1);
      }
      break;
    }
    case "audit": {
      const auditSub = args[1];
      if (auditSub === "log") {
        await handleMemoryAuditLog(args.slice(2));
      } else if (auditSub === "inspect") {
        await handleMemoryAuditInspect(args.slice(2));
      } else {
        console.error("Usage: kiro-studio-kit memory audit log [--limit N] | inspect <memoryId>");
        process.exit(1);
      }
      break;
    }
    default:
      showMemoryUsage();
      process.exit(1);
  }
}
