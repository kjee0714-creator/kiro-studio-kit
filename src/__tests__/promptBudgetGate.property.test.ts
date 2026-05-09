/**
 * promptBudgetGate.property.test.ts
 * Property-based tests for prompt budget gate (Phase 4-P).
 * Uses fast-check with 100 runs per property.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import { applyPromptBudgetGate, PROMPT_BUDGET_LIMITS, resolvePromptBudgetMode } from "../core/promptBudgetGate.js";
import type { PromptBudgetMode, ResolvedPromptBudgetMode } from "../core/promptBudgetGate.js";

const kindArb = fc.constantFrom(
  "test_fix", "type_fix", "lint_fix", "build_fix",
  "schema_fix", "behavior_change", "design_decision", "gotcha",
) as fc.Arbitrary<DevMemoryEntry["kind"]>;

const entryArb: fc.Arbitrary<DevMemoryEntry> = fc.record({
  id: fc.uuid(),
  createdAt: fc.constant("2024-01-01T00:00:00.000Z"),
  kind: kindArb,
  summary: fc.string({ minLength: 1, maxLength: 50 }),
  trigger: fc.string({ minLength: 1, maxLength: 50 }),
  fix: fc.string({ minLength: 1, maxLength: 50 }),
  futurePromptHint: fc.string({ minLength: 1, maxLength: 50 }),
  relatedFiles: fc.constant([] as string[]),
  relatedSymbols: fc.constant([] as string[]),
  tags: fc.constant([] as string[]),
  severity: fc.constantFrom("low", "medium", "high") as fc.Arbitrary<DevMemoryEntry["severity"]>,
  confidence: fc.constantFrom("medium", "high") as fc.Arbitrary<DevMemoryEntry["confidence"]>,
  enabled: fc.constant(true),
});

const modeArb = fc.constantFrom("minimal", "compact", "full", "auto") as fc.Arbitrary<PromptBudgetMode>;
const memoriesArb = fc.array(entryArb, { minLength: 0, maxLength: 15 });

describe("promptBudgetGate property tests", () => {
  /**
   * Property 1: includedMemories.length <= mode maxMemories
   */
  it("Property 1: includedMemories.length <= mode maxMemories", () => {
    fc.assert(
      fc.property(modeArb, memoriesArb, fc.nat({ max: 10000 }), (mode, memories, tokens) => {
        const result = applyPromptBudgetGate({ mode, estimatedTokens: tokens, memories });
        const resolvedMode = result.modeUsed as ResolvedPromptBudgetMode;
        expect(result.includedMemories.length).toBeLessThanOrEqual(PROMPT_BUDGET_LIMITS[resolvedMode].maxMemories);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2: omittedMemories count matches excluded memory count
   */
  it("Property 2: omittedMemories count matches excluded", () => {
    fc.assert(
      fc.property(modeArb, memoriesArb, fc.nat({ max: 10000 }), (mode, memories, tokens) => {
        const result = applyPromptBudgetGate({ mode, estimatedTokens: tokens, memories });
        expect(result.includedMemories.length + result.omittedMemories.length).toBe(memories.length);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3: input memories are not mutated
   */
  it("Property 3: input memories not mutated", () => {
    fc.assert(
      fc.property(modeArb, memoriesArb, fc.nat({ max: 10000 }), (mode, memories, tokens) => {
        const copy = JSON.parse(JSON.stringify(memories)) as DevMemoryEntry[];
        applyPromptBudgetGate({ mode, estimatedTokens: tokens, memories });
        expect(memories).toEqual(copy);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4: high-risk auto resolves to full
   */
  it("Property 4: high-risk auto resolves to full", () => {
    fc.assert(
      fc.property(fc.nat({ max: 10000 }), (tokens) => {
        const resolved = resolvePromptBudgetMode("auto", { taskRisk: "high", estimatedTokens: tokens });
        expect(resolved).toBe("full");
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 5: estimatedTokensAfter <= estimatedTokensBefore
   */
  it("Property 5: estimatedTokensAfter <= estimatedTokensBefore", () => {
    fc.assert(
      fc.property(modeArb, memoriesArb, fc.nat({ max: 10000 }), (mode, memories, tokens) => {
        const result = applyPromptBudgetGate({ mode, estimatedTokens: tokens, memories });
        expect(result.estimatedTokensAfter).toBeLessThanOrEqual(result.estimatedTokensBefore);
      }),
      { numRuns: 100 },
    );
  });
});
