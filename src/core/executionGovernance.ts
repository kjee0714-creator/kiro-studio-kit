/**
 * executionGovernance.ts
 * Loads, validates, and renders execution governance configuration.
 * Governance rules are injected into prompts to guide AI implementers.
 * This module does NOT execute any commands — it only provides configuration.
 *
 * Failure policy: missing/invalid config files never block prompt generation.
 */

import { fileExists, readTextFile } from "./fileUtils.js";

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export interface QualityGateManifest {
  required: string[];
  optional: string[];
  policy: {
    allRequiredMustPass: boolean;
    stopOnTypecheckFailure: boolean;
    stopOnLintFailure: boolean;
    testFailureRequiresSummary: boolean;
  };
}

export interface StopConditions {
  maxConsecutiveFailures: number;
  maxSameErrorRetries: number;
  stopOnSpecAmbiguity: boolean;
  stopOnSchemaBreakingChange: boolean;
  stopOnDataLossRisk: boolean;
  stopOnPublicApiBreakingChange: boolean;
}

export interface ExecutionGovernanceConfig {
  qualityGates: QualityGateManifest;
  stopConditions: StopConditions;
  escalationRules: string;
  source: {
    qualityGates: "file" | "default";
    stopConditions: "file" | "default";
    escalationRules: "file" | "default";
  };
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const QUALITY_GATES_PATH = ".kiro/quality-gates.json";
export const STOP_CONDITIONS_PATH = ".kiro/stop-conditions.json";
export const ESCALATION_RULES_PATH = ".kiro/escalation-rules.md";

export const DEFAULT_QUALITY_GATE_MANIFEST: QualityGateManifest = {
  required: [
    "npm run typecheck",
    "npm run lint",
    "npm test",
    "npm run build",
  ],
  optional: [],
  policy: {
    allRequiredMustPass: true,
    stopOnTypecheckFailure: true,
    stopOnLintFailure: false,
    testFailureRequiresSummary: true,
  },
};

export const DEFAULT_STOP_CONDITIONS: StopConditions = {
  maxConsecutiveFailures: 3,
  maxSameErrorRetries: 2,
  stopOnSpecAmbiguity: true,
  stopOnSchemaBreakingChange: true,
  stopOnDataLossRisk: true,
  stopOnPublicApiBreakingChange: true,
};

export const DEFAULT_ESCALATION_RULES = `Escalate to human when:
- The same quality gate fails repeatedly.
- The implementation requires changing persisted data schema.
- The implementation may cause data loss.
- Public API exports must be removed or renamed.
- The spec and tests conflict.
- The agent is unsure whether a change is safe.
- Audit, trust lifecycle, or injection policy rules conflict.`;

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Validate a quality gate manifest object.
 * Returns the validated manifest or null if invalid.
 */
function validateQualityGateManifest(obj: unknown): QualityGateManifest | null {
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;

  if (!isStringArray(o["required"])) return null;
  if (!isStringArray(o["optional"])) return null;

  const policy = o["policy"];
  if (typeof policy !== "object" || policy === null) return null;
  const p = policy as Record<string, unknown>;

  if (!isBoolean(p["allRequiredMustPass"])) return null;
  if (!isBoolean(p["stopOnTypecheckFailure"])) return null;
  if (!isBoolean(p["stopOnLintFailure"])) return null;
  if (!isBoolean(p["testFailureRequiresSummary"])) return null;

  return {
    required: o["required"] as string[],
    optional: o["optional"] as string[],
    policy: {
      allRequiredMustPass: p["allRequiredMustPass"] as boolean,
      stopOnTypecheckFailure: p["stopOnTypecheckFailure"] as boolean,
      stopOnLintFailure: p["stopOnLintFailure"] as boolean,
      testFailureRequiresSummary: p["testFailureRequiresSummary"] as boolean,
    },
  };
}

/**
 * Validate a stop conditions object.
 * Returns the validated conditions or null if invalid.
 */
function validateStopConditions(obj: unknown): StopConditions | null {
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;

  if (!isNonNegativeInteger(o["maxConsecutiveFailures"])) return null;
  if (!isNonNegativeInteger(o["maxSameErrorRetries"])) return null;
  if (!isBoolean(o["stopOnSpecAmbiguity"])) return null;
  if (!isBoolean(o["stopOnSchemaBreakingChange"])) return null;
  if (!isBoolean(o["stopOnDataLossRisk"])) return null;
  if (!isBoolean(o["stopOnPublicApiBreakingChange"])) return null;

  return {
    maxConsecutiveFailures: o["maxConsecutiveFailures"] as number,
    maxSameErrorRetries: o["maxSameErrorRetries"] as number,
    stopOnSpecAmbiguity: o["stopOnSpecAmbiguity"] as boolean,
    stopOnSchemaBreakingChange: o["stopOnSchemaBreakingChange"] as boolean,
    stopOnDataLossRisk: o["stopOnDataLossRisk"] as boolean,
    stopOnPublicApiBreakingChange: o["stopOnPublicApiBreakingChange"] as boolean,
  };
}

// ---------------------------------------------------------------------------
// Load Function
// ---------------------------------------------------------------------------

/**
 * Load execution governance configuration from files.
 * Missing or invalid files fall back to defaults with warnings.
 * Never throws — always returns a valid config.
 */
export async function loadExecutionGovernance(
  options?: {
    qualityGatesPath?: string;
    stopConditionsPath?: string;
    escalationRulesPath?: string;
  },
): Promise<ExecutionGovernanceConfig> {
  const qgPath = options?.qualityGatesPath ?? QUALITY_GATES_PATH;
  const scPath = options?.stopConditionsPath ?? STOP_CONDITIONS_PATH;
  const erPath = options?.escalationRulesPath ?? ESCALATION_RULES_PATH;

  const warnings: string[] = [];
  let qualityGates: QualityGateManifest = DEFAULT_QUALITY_GATE_MANIFEST;
  let stopConditions: StopConditions = DEFAULT_STOP_CONDITIONS;
  let escalationRules: string = DEFAULT_ESCALATION_RULES;
  let qgSource: "file" | "default" = "default";
  let scSource: "file" | "default" = "default";
  let erSource: "file" | "default" = "default";

  // Load quality gates
  try {
    if (await fileExists(qgPath)) {
      const text = await readTextFile(qgPath);
      const parsed = JSON.parse(text) as unknown;
      const validated = validateQualityGateManifest(parsed);
      if (validated) {
        qualityGates = validated;
        qgSource = "file";
      } else {
        warnings.push(`quality-gates.json: invalid schema, using defaults`);
      }
    }
  } catch {
    warnings.push(`quality-gates.json: failed to parse, using defaults`);
  }

  // Load stop conditions
  try {
    if (await fileExists(scPath)) {
      const text = await readTextFile(scPath);
      const parsed = JSON.parse(text) as unknown;
      const validated = validateStopConditions(parsed);
      if (validated) {
        stopConditions = validated;
        scSource = "file";
      } else {
        warnings.push(`stop-conditions.json: invalid schema, using defaults`);
      }
    }
  } catch {
    warnings.push(`stop-conditions.json: failed to parse, using defaults`);
  }

  // Load escalation rules
  try {
    if (await fileExists(erPath)) {
      const text = await readTextFile(erPath);
      if (text.trim().length > 0) {
        escalationRules = text.trim();
        erSource = "file";
      } else {
        warnings.push(`escalation-rules.md: file is empty, using defaults`);
      }
    }
  } catch {
    warnings.push(`escalation-rules.md: failed to read, using defaults`);
  }

  return {
    qualityGates,
    stopConditions,
    escalationRules,
    source: {
      qualityGates: qgSource,
      stopConditions: scSource,
      escalationRules: erSource,
    },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Render Function
// ---------------------------------------------------------------------------

/**
 * Render the execution governance section for prompt injection.
 * Pure function — deterministic for same inputs.
 */
export function renderExecutionGovernanceSection(
  config: ExecutionGovernanceConfig,
  options?: { detail?: "short" | "full" },
): string {
  const detail = options?.detail ?? "full";

  if (detail === "short") {
    const gates = config.qualityGates.required.join(", ") || "(none)";
    return `## Execution Governance\n\nRequired quality gates: ${gates}. Stop and escalate on repeated failures, schema changes, data loss risk, or public API breaks.\n`;
  }

  const lines: string[] = [];

  lines.push("## Execution Governance");
  lines.push("");

  // Required Quality Gates
  lines.push("### Required Quality Gates");
  if (config.qualityGates.required.length === 0) {
    lines.push("- (none configured)");
  } else {
    for (const gate of config.qualityGates.required) {
      lines.push(`- ${gate}`);
    }
  }
  lines.push("");

  // Stop Conditions
  lines.push("### Stop Conditions");
  lines.push(`- Stop after ${config.stopConditions.maxConsecutiveFailures} consecutive failures.`);
  lines.push(`- Stop after ${config.stopConditions.maxSameErrorRetries} retries of the same error.`);
  if (config.stopConditions.stopOnSpecAmbiguity) {
    lines.push("- Escalate on spec ambiguity.");
  }
  if (config.stopConditions.stopOnSchemaBreakingChange) {
    lines.push("- Escalate on schema-breaking changes.");
  }
  if (config.stopConditions.stopOnDataLossRisk) {
    lines.push("- Escalate on data loss risk.");
  }
  if (config.stopConditions.stopOnPublicApiBreakingChange) {
    lines.push("- Escalate on public API breaking changes.");
  }
  lines.push("");

  // Escalation Rules
  lines.push("### Escalation Rules");
  lines.push(config.escalationRules);
  lines.push("");

  return lines.join("\n");
}
