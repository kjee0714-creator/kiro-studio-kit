/**
 * memoryScope.ts
 * Scope / project separation for DevMemoryEntry.
 * Provides scope context loading, filtering helpers, and persistence.
 * No automatic project inference — all operations are explicit.
 */

import type { DevMemoryEntry } from "./memoryValidator.js";
import { fileExists, readTextFile } from "./fileUtils.js";
import { readMemoryEntries, rewriteMemoryEntries } from "./memoryStore.js";
import { appendMemoryAuditEvent } from "./memoryAuditLog.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemoryScope = "global" | "project" | "domain" | "temporary";

export interface MemoryScopeContext {
  currentProjectId?: string;
  allowedDomains?: string[];
  includeGlobal: boolean;
  includeUnscoped: boolean;
  includeTemporary: boolean;
}

export interface MemoryScopeUpdateResult {
  updatedIds: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MEMORY_SCOPE_PATH = ".kiro/memory-scope.json";

export const DEFAULT_MEMORY_SCOPE_CONTEXT: MemoryScopeContext = {
  includeGlobal: true,
  includeUnscoped: true,
  includeTemporary: false,
};

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load memory scope context from config file.
 * Missing/invalid files fall back to defaults. Never throws.
 */
export async function loadMemoryScopeContext(
  options?: { scopePath?: string },
): Promise<{ context: MemoryScopeContext; source: "file" | "default"; warnings: string[] }> {
  const scopePath = options?.scopePath ?? MEMORY_SCOPE_PATH;
  const warnings: string[] = [];

  try {
    if (await fileExists(scopePath)) {
      const text = await readTextFile(scopePath);
      const parsed = JSON.parse(text) as unknown;
      const validated = validateScopeContext(parsed);
      if (validated) {
        return { context: validated, source: "file", warnings };
      }
      warnings.push("memory-scope.json: invalid schema, using defaults");
    }
  } catch {
    warnings.push("memory-scope.json: failed to parse, using defaults");
  }

  return { context: DEFAULT_MEMORY_SCOPE_CONTEXT, source: "default", warnings };
}

function validateScopeContext(obj: unknown): MemoryScopeContext | null {
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;

  // Required booleans
  if (typeof o["includeGlobal"] !== "boolean") return null;
  if (typeof o["includeUnscoped"] !== "boolean") return null;
  if (typeof o["includeTemporary"] !== "boolean") return null;

  // Optional fields
  if (o["currentProjectId"] !== undefined && typeof o["currentProjectId"] !== "string") return null;
  if (o["allowedDomains"] !== undefined) {
    if (!Array.isArray(o["allowedDomains"])) return null;
    if (!(o["allowedDomains"] as unknown[]).every(item => typeof item === "string")) return null;
  }

  return {
    currentProjectId: o["currentProjectId"] as string | undefined,
    allowedDomains: o["allowedDomains"] as string[] | undefined,
    includeGlobal: o["includeGlobal"] as boolean,
    includeUnscoped: o["includeUnscoped"] as boolean,
    includeTemporary: o["includeTemporary"] as boolean,
  };
}

// ---------------------------------------------------------------------------
// Pure Helper Functions
// ---------------------------------------------------------------------------

/**
 * Check if a memory entry is in scope given the current context.
 * Pure function — does not mutate input.
 */
export function isMemoryInScope(
  entry: DevMemoryEntry,
  context: MemoryScopeContext,
): boolean {
  // If no currentProjectId and no allowedDomains, scope filtering is effectively disabled
  if (!context.currentProjectId && (!context.allowedDomains || context.allowedDomains.length === 0)) {
    return true;
  }

  const entryScope = entry.scope;

  // Unscoped entries (no scope field set)
  if (!entryScope) {
    return context.includeUnscoped;
  }

  switch (entryScope) {
    case "global":
      return context.includeGlobal;

    case "project":
      if (!context.currentProjectId) return context.includeUnscoped;
      return entry.project === context.currentProjectId;

    case "domain":
      if (!context.allowedDomains || context.allowedDomains.length === 0) return context.includeUnscoped;
      if (!entry.domains || entry.domains.length === 0) return false;
      return entry.domains.some(d => context.allowedDomains?.includes(d) ?? false);

    case "temporary":
      return context.includeTemporary;

    default:
      return context.includeUnscoped;
  }
}

/**
 * Get the exclusion reason for an out-of-scope entry, or undefined if in scope.
 * Pure function.
 */
export function getScopeExclusionReason(
  entry: DevMemoryEntry,
  context: MemoryScopeContext,
): string | undefined {
  if (isMemoryInScope(entry, context)) return undefined;

  const entryScope = entry.scope;
  if (!entryScope) return "Unscoped entry excluded by scope policy";

  switch (entryScope) {
    case "global": return "Global entry excluded (includeGlobal=false)";
    case "project": return `Project scope mismatch (entry: ${entry.project ?? "none"}, current: ${context.currentProjectId ?? "none"})`;
    case "domain": return `Domain scope mismatch (entry domains: ${entry.domains?.join(",") ?? "none"})`;
    case "temporary": return "Temporary entry excluded (includeTemporary=false)";
    default: return "Scope excluded";
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Set scope on specified entries.
 * Never physically deletes entries.
 */
export async function setMemoryScope(
  ids: string[],
  scope: MemoryScope,
  options?: { projectId?: string; domains?: string[]; storePath?: string; reason?: string },
): Promise<MemoryScopeUpdateResult> {
  if (ids.length === 0) {
    throw new Error("At least 1 entry ID is required");
  }
  if (scope === "project" && !options?.projectId) {
    throw new Error("projectId is required for project scope");
  }
  if (scope === "domain" && (!options?.domains || options.domains.length === 0)) {
    throw new Error("At least one domain is required for domain scope");
  }

  const entries = await readMemoryEntries(options?.storePath);

  // Validate all IDs exist
  for (const id of ids) {
    if (!entries.find(e => e.id === id)) {
      throw new Error(`Entry not found: ${id}`);
    }
  }

  const idSet = new Set(ids);
  for (const entry of entries) {
    if (idSet.has(entry.id)) {
      entry.scope = scope;
      if (scope === "project" && options?.projectId) {
        entry.project = options.projectId;
      }
      if (scope === "domain" && options?.domains) {
        entry.domains = options.domains;
      }
    }
  }

  await rewriteMemoryEntries(entries, options?.storePath);

  // Audit (non-blocking)
  try {
    await appendMemoryAuditEvent({
      eventType: "manual_update",
      actor: "cli",
      source: "memoryScope.setMemoryScope",
      reason: options?.reason ?? `Set scope: ${scope}`,
      metadata: { operation: "set_scope", ids, scope, projectId: options?.projectId, domains: options?.domains },
    });
  } catch {
    // Audit failure non-blocking
  }

  return { updatedIds: ids };
}
