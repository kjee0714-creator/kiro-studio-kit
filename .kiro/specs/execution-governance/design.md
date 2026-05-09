# Design Document

## Overview

Adds an Execution Governance module that loads quality gate, stop condition, and escalation rule configurations, validates them, and renders a governance section into generated prompts. No commands are auto-executed.

## Architecture

### File Structure

```
src/core/
  executionGovernance.ts       — Load, validate, render governance config
src/__tests__/
  executionGovernance.test.ts          — Unit tests
  executionGovernance.property.test.ts — Property-based tests
```

### Config File Paths

```
.kiro/quality-gates.json      — Quality gate manifest
.kiro/stop-conditions.json    — Stop conditions
.kiro/escalation-rules.md     — Escalation rules (markdown)
```

## Types

```typescript
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
```

## Defaults

```typescript
export const DEFAULT_QUALITY_GATE_MANIFEST: QualityGateManifest = {
  required: ["npm run typecheck", "npm run lint", "npm test", "npm run build"],
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
```

## Schema Validation

Hand-written validation (matching existing project style — no zod):
- `required` must be string array
- `optional` must be string array
- `policy` fields must be booleans
- Stop condition numbers must be non-negative integers
- Stop condition booleans must be booleans

Invalid fields → use default + add warning.

## Loading Strategy

```
loadExecutionGovernance(options?)
  → try read quality-gates.json
    → parse JSON → validate schema → use or fallback
  → try read stop-conditions.json
    → parse JSON → validate schema → use or fallback
  → try read escalation-rules.md
    → read text → check non-empty → use or fallback
  → return { qualityGates, stopConditions, escalationRules, source, warnings }
```

Each file is loaded independently. One failure does not affect others.

## Render Format

```markdown
## Execution Governance

### Required Quality Gates
- npm run typecheck
- npm run lint
- npm test
- npm run build

### Stop Conditions
- Stop after 3 consecutive failures.
- Stop after 2 retries of the same error.
- Escalate on spec ambiguity.
- Escalate on schema-breaking changes.
- Escalate on data loss risk.
- Escalate on public API breaking changes.

### Escalation Rules
- The same quality gate fails repeatedly.
- The implementation requires changing persisted data schema.
...
```

## Prompt Generator Integration

After memory injection, before writing output:
```typescript
// Governance section injection
try {
  const govConfig = await loadExecutionGovernance();
  const govSection = renderExecutionGovernanceSection(govConfig);
  if (govSection) {
    finalPromptContent = finalPromptContent + "\n" + govSection;
  }
  governance = {
    qualityGatesSource: govConfig.source.qualityGates,
    stopConditionsSource: govConfig.source.stopConditions,
    escalationRulesSource: govConfig.source.escalationRules,
    warningCount: govConfig.warnings.length,
  };
} catch {
  // Never block prompt generation
}
```

## GenerateResult Extension

```typescript
export interface GenerateResult {
  // ... existing fields ...
  governance?: {
    qualityGatesSource: "file" | "default";
    stopConditionsSource: "file" | "default";
    escalationRulesSource: "file" | "default";
    warningCount: number;
  };
}
```

## CLI Routing

Add `governance` as a top-level subcommand in `cli.ts`:
```typescript
case "governance":
  await handleGovernanceInspect();
  break;
```

## Public API Exports

From `src/index.ts`:
- Types: `QualityGateManifest`, `StopConditions`, `ExecutionGovernanceConfig`
- Functions: `loadExecutionGovernance`, `renderExecutionGovernanceSection`
- Constants: `DEFAULT_QUALITY_GATE_MANIFEST`, `DEFAULT_STOP_CONDITIONS`, `DEFAULT_ESCALATION_RULES`, `QUALITY_GATES_PATH`, `STOP_CONDITIONS_PATH`, `ESCALATION_RULES_PATH`
