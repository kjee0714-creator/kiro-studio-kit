/**
 * memoryScope.property.test.ts
 * Property-based tests for memory scope / project separation (Phase 4-M).
 * Uses fast-check with 100 runs per property.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { mkdir, rm } from "fs/promises";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import { applyMemoryInjectionPolicy } from "../core/memoryInjectionPolicy.js";
import type { MemoryScopeContext } from "../core/memoryScope.js";
import { setMemoryScope } from "../core/memoryScope.js";
import { readMemoryEntries, rewriteMemoryEntries } from "../core/memoryStore.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const kindArb = fc.constantFrom(
  "test_fix", "type_fix", "lint_fix", "build_fix",
  "schema_fix", "behavior_change", "design_decision", "gotcha",
) as fc.Arbitrary<DevMemoryEntry["kind"]>;

const severityArb = fc.constantFrom("low", "medium", "high") as fc.Arbitrary<DevMemoryEntry["severity"]>;
const confidenceArb = fc.constantFrom("medium", "high") as fc.Arbitrary<DevMemoryEntry["confidence"]>;
const trustLevelArb = fc.constantFrom("probation", "trusted", "verified") as fc.Arbitrary<DevMemoryEntry["trustLevel"]>;
const scopeArb = fc.constantFrom("global", "project", "domain", "temporary", undefined) as fc.Arbitrary<DevMemoryEntry["scope"]>;

const scopedEntryArb: fc.Arbitrary<DevMemoryEntry> = fc.record({
  id: fc.uuid(),
  createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2025-01-01") }).map(d => d.toISOString()),
  kind: kindArb,
  summary: fc.string({ minLength: 1, maxLength: 50 }),
  trigger: fc.string({ minLength: 1, maxLength: 50 }),
  fix: fc.string({ minLength: 1, maxLength: 50 }),
  futurePromptHint: fc.string({ minLength: 1, maxLength: 50 }),
  relatedFiles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 2 }),
  relatedSymbols: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 2 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 2 }),
  severity: severityArb,
  confidence: confidenceArb,
  enabled: fc.constant(true),
  trustLevel: trustLevelArb,
  scope: scopeArb,
  project: fc.option(fc.constantFrom("proj-a", "proj-b", "proj-c"), { nil: undefined }),
  domains: fc.option(fc.array(fc.constantFrom("web", "api", "mobile"), { minLength: 1, maxLength: 2 }), { nil: undefined }),
});

const entriesArb = fc.array(scopedEntryArb, { minLength: 0, maxLength: 10 });

// ---------------------------------------------------------------------------
// Pure Function Properties
// ---------------------------------------------------------------------------

describe("memoryScope property tests", () => {
  /**
   * Property 1: project scoped entries with non-matching projectId are never selected
   */
  it("Property 1: project scoped with non-matching projectId never selected", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const ctx: MemoryScopeContext = {
          currentProjectId: "target-project",
          includeGlobal: true,
          includeUnscoped: true,
          includeTemporary: true,
        };
        const result = applyMemoryInjectionPolicy(entries, {
          maxTotalEntries: 20,
          maxProbationEntries: 20,
          suppressHighRejection: false,
          scopeContext: ctx,
        });
        for (const entry of result.selectedEntries) {
          if (entry.scope === "project") {
            expect(entry.project).toBe("target-project");
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2: global entries are selected when includeGlobal=true
   */
  it("Property 2: global entries selected when includeGlobal=true", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const ctx: MemoryScopeContext = {
          currentProjectId: "any",
          includeGlobal: true,
          includeUnscoped: true,
          includeTemporary: true,
        };
        const result = applyMemoryInjectionPolicy(entries, {
          maxTotalEntries: 20,
          maxProbationEntries: 20,
          suppressHighRejection: false,
          scopeContext: ctx,
        });
        // Global entries should not be excluded by scope
        const globalInputs = entries.filter(e => e.scope === "global" && e.enabled && e.deleted !== true);
        for (const g of globalInputs) {
          const excluded = result.decisions.find(d => d.id === g.id && d.reason.includes("scope"));
          expect(excluded).toBeUndefined();
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3: unscoped entries excluded when includeUnscoped=false
   */
  it("Property 3: unscoped entries excluded when includeUnscoped=false", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const ctx: MemoryScopeContext = {
          currentProjectId: "any",
          includeGlobal: true,
          includeUnscoped: false,
          includeTemporary: true,
        };
        const result = applyMemoryInjectionPolicy(entries, {
          maxTotalEntries: 20,
          maxProbationEntries: 20,
          suppressHighRejection: false,
          scopeContext: ctx,
        });
        for (const entry of result.selectedEntries) {
          // Selected entries should not be unscoped
          if (!entry.scope) {
            // This should not happen
            expect(entry.scope).toBeDefined();
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4: scope filtering does not mutate input entries
   */
  it("Property 4: scope filtering does not mutate input entries", () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const copy = JSON.parse(JSON.stringify(entries)) as DevMemoryEntry[];
        const ctx: MemoryScopeContext = {
          currentProjectId: "proj-a",
          allowedDomains: ["web"],
          includeGlobal: true,
          includeUnscoped: false,
          includeTemporary: false,
        };
        applyMemoryInjectionPolicy(entries, {
          maxTotalEntries: 20,
          maxProbationEntries: 20,
          scopeContext: ctx,
        });
        expect(entries).toEqual(copy);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Persistence Properties
// ---------------------------------------------------------------------------

const PERSIST_TEST_DIR = ".test-tmp/memoryScope-property-" + process.pid + "-" + Date.now();
let persistTestCounter = 0;

function getStorePath(): string {
  persistTestCounter++;
  return `${PERSIST_TEST_DIR}/store-${persistTestCounter}.jsonl`;
}

const cleanEntryArb: fc.Arbitrary<DevMemoryEntry> = fc.record({
  id: fc.uuid(),
  createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2025-01-01") }).map(d => d.toISOString()),
  kind: kindArb,
  summary: fc.string({ minLength: 1, maxLength: 50 }),
  trigger: fc.string({ minLength: 1, maxLength: 50 }),
  fix: fc.string({ minLength: 1, maxLength: 50 }),
  futurePromptHint: fc.string({ minLength: 1, maxLength: 50 }),
  relatedFiles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 2 }),
  relatedSymbols: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 2 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 2 }),
  severity: severityArb,
  confidence: confidenceArb,
  enabled: fc.constant(true),
  trustLevel: trustLevelArb,
});

describe("memoryScope persistence property tests", () => {
  beforeEach(async () => {
    await mkdir(PERSIST_TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    try { await rm(PERSIST_TEST_DIR, { recursive: true, force: true, maxRetries: 3 }); } catch { /* ignore */ }
  });

  /**
   * Property 5: setMemoryScope updates exactly requested IDs
   */
  it("Property 5: setMemoryScope updates exactly requested IDs", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(cleanEntryArb, { minLength: 2, maxLength: 6 }),
        async (entries) => {
          const storePath = getStorePath();
          await rewriteMemoryEntries(entries, storePath);

          const targetId = entries[0].id;
          await setMemoryScope([targetId], "global", { storePath });

          const afterEntries = await readMemoryEntries(storePath);

          // Target entry updated
          const target = afterEntries.find(e => e.id === targetId);
          expect(target?.scope).toBe("global");

          // Other entries unchanged
          for (const entry of afterEntries) {
            if (entry.id !== targetId) {
              const before = entries.find(e => e.id === entry.id);
              expect(entry.scope).toBe(before?.scope);
            }
          }

          // Entry count preserved
          expect(afterEntries.length).toBe(entries.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
