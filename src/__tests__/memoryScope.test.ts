/**
 * memoryScope.test.ts
 * Unit tests for memory scope / project separation (Phase 4-M).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import { isMemoryInScope, getScopeExclusionReason, DEFAULT_MEMORY_SCOPE_CONTEXT } from "../core/memoryScope.js";
import type { MemoryScopeContext } from "../core/memoryScope.js";
import { applyMemoryInjectionPolicy } from "../core/memoryInjectionPolicy.js";
import * as fileUtils from "../core/fileUtils.js";

function makeEntry(overrides: Partial<DevMemoryEntry> = {}): DevMemoryEntry {
  return {
    id: overrides.id ?? "test-id-1",
    createdAt: "2024-01-01T00:00:00.000Z",
    kind: "test_fix",
    summary: "Test summary",
    trigger: "Test trigger",
    fix: "Test fix",
    futurePromptHint: "Test hint",
    relatedFiles: [],
    relatedSymbols: [],
    tags: [],
    severity: "medium",
    confidence: "high",
    enabled: true,
    ...overrides,
  };
}

describe("isMemoryInScope", () => {
  const ctx: MemoryScopeContext = {
    currentProjectId: "my-project",
    allowedDomains: ["web", "api"],
    includeGlobal: true,
    includeUnscoped: true,
    includeTemporary: false,
  };

  it("global entry included when includeGlobal=true", () => {
    expect(isMemoryInScope(makeEntry({ scope: "global" }), ctx)).toBe(true);
  });

  it("global entry excluded when includeGlobal=false", () => {
    expect(isMemoryInScope(makeEntry({ scope: "global" }), { ...ctx, includeGlobal: false })).toBe(false);
  });

  it("project entry included when projectId matches", () => {
    expect(isMemoryInScope(makeEntry({ scope: "project", project: "my-project" }), ctx)).toBe(true);
  });

  it("project entry excluded when projectId does not match", () => {
    expect(isMemoryInScope(makeEntry({ scope: "project", project: "other-project" }), ctx)).toBe(false);
  });

  it("domain entry included when domains intersect", () => {
    expect(isMemoryInScope(makeEntry({ scope: "domain", domains: ["web", "mobile"] }), ctx)).toBe(true);
  });

  it("domain entry excluded when domains do not intersect", () => {
    expect(isMemoryInScope(makeEntry({ scope: "domain", domains: ["mobile", "desktop"] }), ctx)).toBe(false);
  });

  it("temporary entry excluded when includeTemporary=false", () => {
    expect(isMemoryInScope(makeEntry({ scope: "temporary" }), ctx)).toBe(false);
  });

  it("temporary entry included when includeTemporary=true", () => {
    expect(isMemoryInScope(makeEntry({ scope: "temporary" }), { ...ctx, includeTemporary: true })).toBe(true);
  });

  it("unscoped entry included when includeUnscoped=true", () => {
    expect(isMemoryInScope(makeEntry(), ctx)).toBe(true);
  });

  it("unscoped entry excluded when includeUnscoped=false", () => {
    expect(isMemoryInScope(makeEntry(), { ...ctx, includeUnscoped: false })).toBe(false);
  });

  it("all entries pass when no currentProjectId and no allowedDomains", () => {
    const relaxedCtx: MemoryScopeContext = { includeGlobal: true, includeUnscoped: true, includeTemporary: false };
    expect(isMemoryInScope(makeEntry({ scope: "project", project: "any" }), relaxedCtx)).toBe(true);
  });
});

describe("getScopeExclusionReason", () => {
  const ctx: MemoryScopeContext = {
    currentProjectId: "my-project",
    allowedDomains: ["web"],
    includeGlobal: true,
    includeUnscoped: false,
    includeTemporary: false,
  };

  it("returns undefined for in-scope entry", () => {
    expect(getScopeExclusionReason(makeEntry({ scope: "global" }), ctx)).toBeUndefined();
  });

  it("returns reason for out-of-scope project entry", () => {
    const reason = getScopeExclusionReason(makeEntry({ scope: "project", project: "other" }), ctx);
    expect(reason).toContain("mismatch");
  });

  it("returns reason for unscoped entry when includeUnscoped=false", () => {
    const reason = getScopeExclusionReason(makeEntry(), ctx);
    expect(reason).toContain("Unscoped");
  });
});

describe("injection policy scope filtering", () => {
  it("excludes project-scoped entries with non-matching projectId", () => {
    const entries = [
      makeEntry({ id: "a", scope: "project", project: "other", trustLevel: "trusted" }),
      makeEntry({ id: "b", scope: "global", trustLevel: "trusted" }),
    ];
    const result = applyMemoryInjectionPolicy(entries, {
      maxTotalEntries: 10,
      maxProbationEntries: 10,
      scopeContext: { currentProjectId: "my-project", includeGlobal: true, includeUnscoped: true, includeTemporary: false },
    });
    expect(result.selectedEntries.map(e => e.id)).toEqual(["b"]);
    expect(result.stats.scopeExcludedCount).toBe(1);
  });

  it("includes all entries when no scopeContext provided", () => {
    const entries = [
      makeEntry({ id: "a", scope: "project", project: "other", trustLevel: "trusted" }),
      makeEntry({ id: "b", trustLevel: "trusted" }),
    ];
    const result = applyMemoryInjectionPolicy(entries, { maxTotalEntries: 10, maxProbationEntries: 10 });
    expect(result.selectedEntries).toHaveLength(2);
    expect(result.stats.scopeExcludedCount).toBe(0);
  });
});

describe("loadMemoryScopeContext", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("returns defaults when file does not exist", async () => {
    vi.spyOn(fileUtils, "fileExists").mockResolvedValue(false);
    const { loadMemoryScopeContext } = await import("../core/memoryScope.js");
    const { context, source } = await loadMemoryScopeContext();
    expect(context).toEqual(DEFAULT_MEMORY_SCOPE_CONTEXT);
    expect(source).toBe("default");
  });

  it("returns defaults + warning for invalid JSON", async () => {
    vi.spyOn(fileUtils, "fileExists").mockResolvedValue(true);
    vi.spyOn(fileUtils, "readTextFile").mockResolvedValue("not json");
    const { loadMemoryScopeContext } = await import("../core/memoryScope.js");
    const { context, source, warnings } = await loadMemoryScopeContext();
    expect(context).toEqual(DEFAULT_MEMORY_SCOPE_CONTEXT);
    expect(source).toBe("default");
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("validator schema extension", () => {
  it("accepts entries with valid scope", async () => {
    const { validateDevMemoryEntry } = await import("../core/memoryValidator.js");
    const entry = makeEntry({ scope: "global" });
    expect(validateDevMemoryEntry(entry as unknown).success).toBe(true);
  });

  it("rejects entries with invalid scope", async () => {
    const { validateDevMemoryEntry } = await import("../core/memoryValidator.js");
    const entry = { ...makeEntry(), scope: "invalid" };
    const result = validateDevMemoryEntry(entry as unknown);
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes("scope"))).toBe(true);
  });

  it("accepts entries with domains array", async () => {
    const { validateDevMemoryEntry } = await import("../core/memoryValidator.js");
    const entry = makeEntry({ domains: ["web", "api"] });
    expect(validateDevMemoryEntry(entry as unknown).success).toBe(true);
  });

  it("rejects entries with domains non-array", async () => {
    const { validateDevMemoryEntry } = await import("../core/memoryValidator.js");
    const entry = { ...makeEntry(), domains: "not-array" };
    const result = validateDevMemoryEntry(entry as unknown);
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes("domains"))).toBe(true);
  });
});
