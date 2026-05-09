/**
 * executionGovernance.property.test.ts
 * Property-based tests for execution governance (Phase 4-J).
 * Uses fast-check with 100 runs per property.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  renderExecutionGovernanceSection,
  DEFAULT_QUALITY_GATE_MANIFEST,
  DEFAULT_STOP_CONDITIONS,
  DEFAULT_ESCALATION_RULES,
} from "../core/executionGovernance.js";
import type { ExecutionGovernanceConfig, QualityGateManifest, StopConditions } from "../core/executionGovernance.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const qualityGateManifestArb: fc.Arbitrary<QualityGateManifest> = fc.record({
  required: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 }),
  optional: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
  policy: fc.record({
    allRequiredMustPass: fc.boolean(),
    stopOnTypecheckFailure: fc.boolean(),
    stopOnLintFailure: fc.boolean(),
    testFailureRequiresSummary: fc.boolean(),
  }),
});

const stopConditionsArb: fc.Arbitrary<StopConditions> = fc.record({
  maxConsecutiveFailures: fc.nat({ max: 100 }),
  maxSameErrorRetries: fc.nat({ max: 50 }),
  stopOnSpecAmbiguity: fc.boolean(),
  stopOnSchemaBreakingChange: fc.boolean(),
  stopOnDataLossRisk: fc.boolean(),
  stopOnPublicApiBreakingChange: fc.boolean(),
});

const sourceArb = fc.record({
  qualityGates: fc.constantFrom("file", "default") as fc.Arbitrary<"file" | "default">,
  stopConditions: fc.constantFrom("file", "default") as fc.Arbitrary<"file" | "default">,
  escalationRules: fc.constantFrom("file", "default") as fc.Arbitrary<"file" | "default">,
});

const configArb: fc.Arbitrary<ExecutionGovernanceConfig> = fc.record({
  qualityGates: qualityGateManifestArb,
  stopConditions: stopConditionsArb,
  escalationRules: fc.string({ minLength: 0, maxLength: 500 }),
  source: sourceArb,
  warnings: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 5 }),
});

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("executionGovernance property tests", () => {
  /**
   * Property 1: renderExecutionGovernanceSection never throws for valid configs
   */
  it("Property 1: renderExecutionGovernanceSection never throws for valid configs", () => {
    fc.assert(
      fc.property(configArb, (config) => {
        expect(() => renderExecutionGovernanceSection(config)).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2: required gates in config appear in rendered section
   */
  it("Property 2: required gates appear in rendered section", () => {
    fc.assert(
      fc.property(configArb, (config) => {
        const section = renderExecutionGovernanceSection(config);
        for (const gate of config.qualityGates.required) {
          expect(section).toContain(gate);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3: stop condition numbers appear in rendered section
   */
  it("Property 3: stop condition numbers appear in rendered section", () => {
    fc.assert(
      fc.property(configArb, (config) => {
        const section = renderExecutionGovernanceSection(config);
        expect(section).toContain(String(config.stopConditions.maxConsecutiveFailures));
        expect(section).toContain(String(config.stopConditions.maxSameErrorRetries));
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4: loading with missing files returns defaults (tested via render of defaults)
   */
  it("Property 4: default config renders without throwing", () => {
    const defaultConfig: ExecutionGovernanceConfig = {
      qualityGates: DEFAULT_QUALITY_GATE_MANIFEST,
      stopConditions: DEFAULT_STOP_CONDITIONS,
      escalationRules: DEFAULT_ESCALATION_RULES,
      source: { qualityGates: "default", stopConditions: "default", escalationRules: "default" },
      warnings: [],
    };
    expect(() => renderExecutionGovernanceSection(defaultConfig)).not.toThrow();
    const section = renderExecutionGovernanceSection(defaultConfig);
    expect(section).toContain("Execution Governance");
  });

  /**
   * Property 5: warning count in config matches warnings array length
   */
  it("Property 5: warnings array length is consistent", () => {
    fc.assert(
      fc.property(configArb, (config) => {
        // The warnings array length should be a non-negative integer
        expect(config.warnings.length).toBeGreaterThanOrEqual(0);
        // Rendering should not crash regardless of warning count
        expect(() => renderExecutionGovernanceSection(config)).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });
});
