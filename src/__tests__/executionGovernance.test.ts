/**
 * executionGovernance.test.ts
 * Unit tests for execution governance (Phase 4-J).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  loadExecutionGovernance,
  renderExecutionGovernanceSection,
  DEFAULT_QUALITY_GATE_MANIFEST,
  DEFAULT_STOP_CONDITIONS,
  DEFAULT_ESCALATION_RULES,
} from "../core/executionGovernance.js";
import type { ExecutionGovernanceConfig } from "../core/executionGovernance.js";
import * as fileUtils from "../core/fileUtils.js";

describe("loadExecutionGovernance", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns defaults when no files exist", async () => {
    vi.spyOn(fileUtils, "fileExists").mockResolvedValue(false);

    const config = await loadExecutionGovernance();

    expect(config.qualityGates).toEqual(DEFAULT_QUALITY_GATE_MANIFEST);
    expect(config.stopConditions).toEqual(DEFAULT_STOP_CONDITIONS);
    expect(config.escalationRules).toBe(DEFAULT_ESCALATION_RULES);
    expect(config.source.qualityGates).toBe("default");
    expect(config.source.stopConditions).toBe("default");
    expect(config.source.escalationRules).toBe("default");
    expect(config.warnings).toHaveLength(0);
  });

  it("loads valid quality-gates.json from file", async () => {
    const validGates = {
      required: ["npm run test"],
      optional: ["npm run e2e"],
      policy: {
        allRequiredMustPass: true,
        stopOnTypecheckFailure: false,
        stopOnLintFailure: false,
        testFailureRequiresSummary: false,
      },
    };

    vi.spyOn(fileUtils, "fileExists").mockImplementation(async (p) => {
      return (p as string).includes("quality-gates");
    });
    vi.spyOn(fileUtils, "readTextFile").mockResolvedValue(JSON.stringify(validGates));

    const config = await loadExecutionGovernance();

    expect(config.qualityGates).toEqual(validGates);
    expect(config.source.qualityGates).toBe("file");
  });

  it("loads valid stop-conditions.json from file", async () => {
    const validConditions = {
      maxConsecutiveFailures: 5,
      maxSameErrorRetries: 3,
      stopOnSpecAmbiguity: false,
      stopOnSchemaBreakingChange: true,
      stopOnDataLossRisk: true,
      stopOnPublicApiBreakingChange: false,
    };

    vi.spyOn(fileUtils, "fileExists").mockImplementation(async (p) => {
      return (p as string).includes("stop-conditions");
    });
    vi.spyOn(fileUtils, "readTextFile").mockResolvedValue(JSON.stringify(validConditions));

    const config = await loadExecutionGovernance();

    expect(config.stopConditions).toEqual(validConditions);
    expect(config.source.stopConditions).toBe("file");
  });

  it("loads escalation-rules.md from file", async () => {
    const rules = "Custom escalation rules here.";

    vi.spyOn(fileUtils, "fileExists").mockImplementation(async (p) => {
      return (p as string).includes("escalation-rules");
    });
    vi.spyOn(fileUtils, "readTextFile").mockResolvedValue(rules);

    const config = await loadExecutionGovernance();

    expect(config.escalationRules).toBe(rules);
    expect(config.source.escalationRules).toBe("file");
  });

  it("returns defaults + warning for invalid JSON in quality-gates.json", async () => {
    vi.spyOn(fileUtils, "fileExists").mockImplementation(async (p) => {
      return (p as string).includes("quality-gates");
    });
    vi.spyOn(fileUtils, "readTextFile").mockResolvedValue("not valid json {{{");

    const config = await loadExecutionGovernance();

    expect(config.qualityGates).toEqual(DEFAULT_QUALITY_GATE_MANIFEST);
    expect(config.source.qualityGates).toBe("default");
    expect(config.warnings.length).toBeGreaterThan(0);
    expect(config.warnings[0]).toContain("quality-gates.json");
  });

  it("returns defaults + warning for invalid schema in quality-gates.json", async () => {
    vi.spyOn(fileUtils, "fileExists").mockImplementation(async (p) => {
      return (p as string).includes("quality-gates");
    });
    vi.spyOn(fileUtils, "readTextFile").mockResolvedValue(JSON.stringify({ required: 123 }));

    const config = await loadExecutionGovernance();

    expect(config.qualityGates).toEqual(DEFAULT_QUALITY_GATE_MANIFEST);
    expect(config.source.qualityGates).toBe("default");
    expect(config.warnings.some(w => w.includes("invalid schema"))).toBe(true);
  });

  it("returns defaults + warning for invalid stop-conditions.json", async () => {
    vi.spyOn(fileUtils, "fileExists").mockImplementation(async (p) => {
      return (p as string).includes("stop-conditions");
    });
    vi.spyOn(fileUtils, "readTextFile").mockResolvedValue("broken json");

    const config = await loadExecutionGovernance();

    expect(config.stopConditions).toEqual(DEFAULT_STOP_CONDITIONS);
    expect(config.source.stopConditions).toBe("default");
    expect(config.warnings.length).toBeGreaterThan(0);
  });

  it("returns defaults + warning for empty escalation-rules.md", async () => {
    vi.spyOn(fileUtils, "fileExists").mockImplementation(async (p) => {
      return (p as string).includes("escalation-rules");
    });
    vi.spyOn(fileUtils, "readTextFile").mockResolvedValue("   ");

    const config = await loadExecutionGovernance();

    expect(config.escalationRules).toBe(DEFAULT_ESCALATION_RULES);
    expect(config.source.escalationRules).toBe("default");
    expect(config.warnings.some(w => w.includes("empty"))).toBe(true);
  });

  it("one file failure does not affect others", async () => {
    const validConditions = {
      maxConsecutiveFailures: 10,
      maxSameErrorRetries: 5,
      stopOnSpecAmbiguity: false,
      stopOnSchemaBreakingChange: false,
      stopOnDataLossRisk: false,
      stopOnPublicApiBreakingChange: false,
    };

    vi.spyOn(fileUtils, "fileExists").mockResolvedValue(true);
    vi.spyOn(fileUtils, "readTextFile").mockImplementation(async (p) => {
      if ((p as string).includes("quality-gates")) return "broken";
      if ((p as string).includes("stop-conditions")) return JSON.stringify(validConditions);
      if ((p as string).includes("escalation-rules")) return "Custom rules";
      return "";
    });

    const config = await loadExecutionGovernance();

    // quality-gates failed, but stop-conditions and escalation loaded fine
    expect(config.qualityGates).toEqual(DEFAULT_QUALITY_GATE_MANIFEST);
    expect(config.stopConditions).toEqual(validConditions);
    expect(config.escalationRules).toBe("Custom rules");
    expect(config.source.qualityGates).toBe("default");
    expect(config.source.stopConditions).toBe("file");
    expect(config.source.escalationRules).toBe("file");
  });
});

describe("renderExecutionGovernanceSection", () => {
  function makeConfig(overrides?: Partial<ExecutionGovernanceConfig>): ExecutionGovernanceConfig {
    return {
      qualityGates: DEFAULT_QUALITY_GATE_MANIFEST,
      stopConditions: DEFAULT_STOP_CONDITIONS,
      escalationRules: DEFAULT_ESCALATION_RULES,
      source: { qualityGates: "default", stopConditions: "default", escalationRules: "default" },
      warnings: [],
      ...overrides,
    };
  }

  it("includes required quality gates", () => {
    const section = renderExecutionGovernanceSection(makeConfig());
    expect(section).toContain("npm run typecheck");
    expect(section).toContain("npm run lint");
    expect(section).toContain("npm test");
    expect(section).toContain("npm run build");
  });

  it("includes stop condition numbers", () => {
    const section = renderExecutionGovernanceSection(makeConfig());
    expect(section).toContain("3 consecutive failures");
    expect(section).toContain("2 retries");
  });

  it("includes escalation rules", () => {
    const section = renderExecutionGovernanceSection(makeConfig());
    expect(section).toContain("Escalate to human");
  });

  it("does not throw with empty required gates", () => {
    const config = makeConfig({
      qualityGates: { ...DEFAULT_QUALITY_GATE_MANIFEST, required: [] },
    });
    const section = renderExecutionGovernanceSection(config);
    expect(section).toContain("(none configured)");
  });

  it("does not throw with warnings present", () => {
    const config = makeConfig({ warnings: ["some warning"] });
    expect(() => renderExecutionGovernanceSection(config)).not.toThrow();
  });

  it("includes header", () => {
    const section = renderExecutionGovernanceSection(makeConfig());
    expect(section).toContain("## Execution Governance");
  });
});
