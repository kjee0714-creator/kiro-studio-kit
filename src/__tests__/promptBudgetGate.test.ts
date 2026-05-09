/**
 * promptBudgetGate.test.ts
 * Unit tests for prompt budget gate (Phase 4-P).
 */

import { describe, it, expect } from "vitest";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import { applyPromptBudgetGate, inferTaskRisk, resolvePromptBudgetMode, PROMPT_BUDGET_LIMITS } from "../core/promptBudgetGate.js";

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

describe("inferTaskRisk", () => {
  it("returns high for schema-related tasks", () => {
    expect(inferTaskRisk("Update the schema validator")).toBe("high");
  });

  it("returns high for public API tasks", () => {
    expect(inferTaskRisk("Change public api export")).toBe("high");
  });

  it("returns low for typo fixes", () => {
    expect(inferTaskRisk("Fix typo in readme")).toBe("low");
  });

  it("returns low for comment updates", () => {
    expect(inferTaskRisk("Update comment in utils")).toBe("low");
  });

  it("returns medium for generic tasks", () => {
    expect(inferTaskRisk("Implement new feature")).toBe("medium");
  });
});

describe("resolvePromptBudgetMode", () => {
  it("returns explicit mode when not auto", () => {
    expect(resolvePromptBudgetMode("minimal", { estimatedTokens: 1000 })).toBe("minimal");
    expect(resolvePromptBudgetMode("compact", { estimatedTokens: 1000 })).toBe("compact");
    expect(resolvePromptBudgetMode("full", { estimatedTokens: 1000 })).toBe("full");
  });

  it("auto with high risk resolves to full", () => {
    expect(resolvePromptBudgetMode("auto", { taskRisk: "high", estimatedTokens: 1000 })).toBe("full");
  });

  it("auto with low risk resolves to minimal", () => {
    expect(resolvePromptBudgetMode("auto", { taskRisk: "low", estimatedTokens: 1000 })).toBe("minimal");
  });

  it("auto with medium risk resolves to compact", () => {
    expect(resolvePromptBudgetMode("auto", { taskRisk: "medium", estimatedTokens: 1000 })).toBe("compact");
  });

  it("auto infers risk from taskText", () => {
    expect(resolvePromptBudgetMode("auto", { taskText: "Fix schema validator", estimatedTokens: 1000 })).toBe("full");
    expect(resolvePromptBudgetMode("auto", { taskText: "Fix typo", estimatedTokens: 1000 })).toBe("minimal");
  });
});

describe("applyPromptBudgetGate", () => {
  it("limits memories to mode maxMemories", () => {
    const memories = Array.from({ length: 10 }, (_, i) => makeEntry({ id: `m${i}` }));
    const result = applyPromptBudgetGate({ mode: "minimal", estimatedTokens: 1000, memories });
    expect(result.includedMemories.length).toBeLessThanOrEqual(PROMPT_BUDGET_LIMITS.minimal.maxMemories);
  });

  it("preserves memory order", () => {
    const memories = [makeEntry({ id: "a" }), makeEntry({ id: "b" }), makeEntry({ id: "c" })];
    const result = applyPromptBudgetGate({ mode: "full", estimatedTokens: 1000, memories });
    expect(result.includedMemories.map(e => e.id)).toEqual(["a", "b", "c"]);
  });

  it("records omitted memories", () => {
    const memories = Array.from({ length: 5 }, (_, i) => makeEntry({ id: `m${i}` }));
    const result = applyPromptBudgetGate({ mode: "minimal", estimatedTokens: 1000, memories });
    expect(result.omittedMemories.length).toBe(5 - PROMPT_BUDGET_LIMITS.minimal.maxMemories);
  });

  it("does not mutate input memories", () => {
    const memories = [makeEntry({ id: "a" }), makeEntry({ id: "b" })];
    const copy = JSON.parse(JSON.stringify(memories));
    applyPromptBudgetGate({ mode: "minimal", estimatedTokens: 1000, memories });
    expect(memories).toEqual(copy);
  });

  it("estimatedTokensAfter <= estimatedTokensBefore", () => {
    const memories = Array.from({ length: 10 }, (_, i) => makeEntry({ id: `m${i}` }));
    const result = applyPromptBudgetGate({ mode: "minimal", estimatedTokens: 5000, memories });
    expect(result.estimatedTokensAfter).toBeLessThanOrEqual(result.estimatedTokensBefore);
  });

  it("full mode includes all memories up to limit", () => {
    const memories = Array.from({ length: 10 }, (_, i) => makeEntry({ id: `m${i}` }));
    const result = applyPromptBudgetGate({ mode: "full", estimatedTokens: 1000, memories });
    expect(result.includedMemories.length).toBe(10); // 10 < 12 limit
  });

  it("sets qualityGateDetail based on mode", () => {
    expect(applyPromptBudgetGate({ mode: "minimal", estimatedTokens: 0, memories: [] }).qualityGateDetail).toBe("short");
    expect(applyPromptBudgetGate({ mode: "compact", estimatedTokens: 0, memories: [] }).qualityGateDetail).toBe("full");
    expect(applyPromptBudgetGate({ mode: "full", estimatedTokens: 0, memories: [] }).qualityGateDetail).toBe("full");
  });

  it("auto mode resolves based on task risk", () => {
    const result = applyPromptBudgetGate({ mode: "auto", estimatedTokens: 0, memories: [], taskRisk: "high" });
    expect(result.modeUsed).toBe("full");
  });

  it("returns empty result for empty memories", () => {
    const result = applyPromptBudgetGate({ mode: "full", estimatedTokens: 0, memories: [] });
    expect(result.includedMemories).toHaveLength(0);
    expect(result.omittedMemories).toHaveLength(0);
  });
});
