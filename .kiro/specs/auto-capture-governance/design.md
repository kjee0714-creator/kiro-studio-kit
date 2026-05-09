# Design Document: Auto Capture Governance MVP

## Overview

This design implements Phase 4-B of the DevMemory system: an automated capture pipeline that extracts lessons from CI/build logs, scores them using RCA-CAR methodology, and governs their lifecycle through active/quarantine/discard decisions. The implementation follows the project's existing patterns: pure functions, hand-written validation, zero runtime dependencies, and JSONL storage.

## Architecture

### Module Structure

```
src/core/
├── memoryValidator.ts      (MODIFIED — extended DevMemoryEntry type)
├── memoryStore.ts          (MODIFIED — add pending store functions)
├── memoryCapture.ts        (NEW — pure capture pipeline functions)
├── memoryCommands.ts       (MODIFIED — add capture/pending subcommands)
├── memoryHealth.ts         (EXISTING — called post-capture)
├── secretsGuard.ts         (EXISTING — patterns reused by redactor)
└── memoryInjector.ts       (EXISTING — unchanged, pending entries excluded by store)

src/__tests__/
├── memoryCapture.test.ts           (NEW — 14+ unit tests)
└── memoryCapture.property.test.ts  (NEW — 5 property-based tests)
```

### Data Flow

```
Log File → extractCaptureSignals → generateCaptureCandidates → assessCaptureCandidate
    → decideCaptureStatus → findSimilarMemory → redactCaptureText → save/quarantine/discard
```

## Detailed Design

### 1. Extended Data Model (memoryValidator.ts)

Add optional governance fields to `DevMemoryEntry`:

```typescript
/** Source of the memory entry */
export type MemorySource = "manual" | "kiro_log" | "imported";

/** Capture lifecycle status */
export type CaptureStatus = "active" | "quarantined" | "discarded";

/** Trust level for auto-captured entries */
export type TrustLevel = "probation" | "trusted" | "verified";

/** Authority level — how strongly the entry should influence prompts */
export type Authority = "hint" | "rule" | "constraint";

/** Evidence collected during capture */
export interface CaptureEvidence {
  failedGate?: string;
  passedGate?: string;
  filesChanged: string[];
  errorSignals: string[];
}

/** RCA-CAR assessment scores */
export interface CaptureAssessment {
  incidentScore: number;
  evidenceScore: number;
  rootCauseScore: number;
  correctiveActionScore: number;
  reusabilityScore: number;
  riskScore: number;
  totalScore: number;
  decision: CaptureStatus;
  reasons: string[];
}

// Added to DevMemoryEntry interface:
export interface DevMemoryEntry {
  // ... existing fields ...
  source?: MemorySource;
  captureStatus?: CaptureStatus;
  trustLevel?: TrustLevel;
  authority?: Authority;
  evidence?: CaptureEvidence;
  captureAssessment?: CaptureAssessment;
  duplicateOf?: string;
  occurrences?: number;
  lastSeenAt?: string;
}
```

Validation additions in `validateDevMemoryEntry`:
- `source`: validate enum if present
- `captureStatus`: validate enum if present
- `trustLevel`: validate enum if present
- `authority`: validate enum if present
- `evidence`: validate object shape if present (filesChanged and errorSignals must be string arrays)
- `captureAssessment`: validate object shape if present (all score fields must be numbers, decision must be valid CaptureStatus, reasons must be string array)
- `duplicateOf`: validate string if present
- `occurrences`: validate positive integer if present
- `lastSeenAt`: validate string if present

### 2. Pending Store (memoryStore.ts)

```typescript
export const PENDING_STORE_PATH = ".kiro/ksk/dev-memory.pending.jsonl";

export async function readPendingMemoryEntries(storePath?: string): Promise<DevMemoryEntry[]>;
export async function appendPendingMemoryEntry(entry: DevMemoryEntry, storePath?: string): Promise<string>;
export async function clearPendingStore(storePath?: string): Promise<void>;
```

Implementation reuses existing `readJsonlFile` and `appendJsonlRecord` from `jsonlLogger.ts`. The `clearPendingStore` function writes an empty string to the file.

### 3. Capture Module (memoryCapture.ts)

All functions are pure (except file I/O wrappers at the CLI layer).

#### Types

```typescript
export interface CaptureSignals {
  failedGate?: string;
  passedGate?: string;
  filesChanged: string[];
  errorSignals: string[];
  fixSignals: string[];
  forbiddenSignals: string[];
}

export interface MemoryCaptureCandidate {
  kind: DevMemoryKind;
  summary: string;
  trigger: string;
  fix: string;
  futurePromptHint: string;
  relatedFiles: string[];
  relatedSymbols: string[];
  tags: string[];
  severity: Severity;
  confidence: Confidence;
  source: MemorySource;
  trustLevel: TrustLevel;
  authority: Authority;
  autoCaptured: boolean;
  evidence: CaptureEvidence;
}

export interface CaptureDecision {
  status: CaptureStatus;
  reasons: string[];
}
```

#### extractCaptureSignals(logText: string): CaptureSignals

Pattern matching against log text:
- **failedGate**: Lines containing `FAIL`, `ERROR`, `✗`, `error:`, `failed` (case-insensitive). Returns the first matching gate name (e.g., "typecheck", "lint", "test", "build").
- **passedGate**: Lines containing `PASS`, `✓`, `ok`, `success` (case-insensitive). Returns the first matching gate name.
- **filesChanged**: Extract file paths matching `[a-zA-Z0-9_/.-]+\.(ts|js|json|md)` patterns.
- **errorSignals**: Lines starting with `error`, `Error:`, `TypeError`, `SyntaxError`, or containing `TS\d{4}:`.
- **fixSignals**: Lines containing `fix`, `resolved`, `corrected`, `applied`.
- **forbiddenSignals**: Lines matching SECRET_PATTERNS from secretsGuard.ts.

#### generateCaptureCandidates(signals: CaptureSignals, logText: string): MemoryCaptureCandidate[]

Maps failed gate types to candidate kinds:
- "lint" → `lint_fix`
- "typecheck" / "tsc" / "type" → `type_fix`
- "test" / "vitest" / "jest" → `test_fix`
- "build" / "compile" → `build_fix`
- "schema" / "validation" → `schema_fix`

For each matched kind, generates a candidate with:
- `summary`: Derived from the first error signal or gate failure line
- `trigger`: The failed gate description
- `fix`: Derived from fix signals or "See log for resolution"
- `futurePromptHint`: Generated from error pattern + kind
- `relatedFiles`: From signals.filesChanged
- `relatedSymbols`: Extracted symbol names from error signals (e.g., function/class names)
- `tags`: [kind, gate name]
- `severity`: "medium"
- `confidence`: "medium"
- `source`: "kiro_log"
- `trustLevel`: "probation"
- `authority`: "hint"
- `autoCaptured`: true

#### assessCaptureCandidate(candidate: MemoryCaptureCandidate, signals: CaptureSignals): CaptureAssessment

Computes six scores per the requirements:

```typescript
// incidentScore (max 6)
let incidentScore = 0;
if (signals.failedGate) incidentScore += 3;
if (signals.filesChanged.length > 0) incidentScore += 2;
if (signals.fixSignals.length > 0) incidentScore += 1;

// evidenceScore (max 10)
let evidenceScore = 0;
if (signals.failedGate) evidenceScore += 3;
if (signals.passedGate) evidenceScore += 3;
if (signals.errorSignals.length > 0) evidenceScore += 2;
if (signals.filesChanged.length > 0) evidenceScore += 2;

// rootCauseScore (max 6)
let rootCauseScore = 0;
const explicitKinds = ["lint_fix", "type_fix", "test_fix", "build_fix", "schema_fix"];
if (explicitKinds.includes(candidate.kind)) rootCauseScore += 3;
if (signals.errorSignals.length > 0) rootCauseScore += 2;
if (candidate.relatedSymbols.length > 0) rootCauseScore += 1;

// correctiveActionScore (max 6)
let correctiveActionScore = 0;
if (candidate.futurePromptHint.length > 0) correctiveActionScore += 3;
if (candidate.fix.length > 0) correctiveActionScore += 2;
if (candidate.tags.length > 0) correctiveActionScore += 1;

// reusabilityScore (max 7)
let reusabilityScore = 0;
if (candidate.relatedFiles.length > 0) reusabilityScore += 3;
if (candidate.relatedSymbols.length > 0 || candidate.tags.length > 0) reusabilityScore += 2;
if (candidate.futurePromptHint.length >= 30) reusabilityScore += 2;

// riskScore (max 19)
let riskScore = 0;
if (signals.forbiddenSignals.length > 0) riskScore += 5;
if (["design_decision", "behavior_change", "gotcha"].includes(candidate.kind)) riskScore += 4;
if (!signals.failedGate) riskScore += 3;
if (!signals.passedGate) riskScore += 3;
if (signals.filesChanged.length === 0) riskScore += 2;
if (candidate.futurePromptHint.length < 15) riskScore += 2;

const totalScore = incidentScore + evidenceScore + rootCauseScore
  + correctiveActionScore + reusabilityScore - riskScore;
```

#### decideCaptureStatus(assessment: CaptureAssessment): CaptureDecision

```typescript
if (assessment.totalScore >= 12
    && assessment.riskScore <= 3
    && assessment.evidenceScore >= 6
    && assessment.correctiveActionScore >= 4) {
  return { status: "active", reasons: [...] };
}

if (assessment.totalScore >= 7
    || (assessment.riskScore <= 6 && assessment.evidenceScore >= 3)) {
  return { status: "quarantined", reasons: [...] };
}

return { status: "discarded", reasons: [...] };
```

#### findSimilarMemory(candidate: MemoryCaptureCandidate, existingEntries: DevMemoryEntry[]): DevMemoryEntry | undefined

Matches by:
1. Same `kind`
2. At least one overlapping file in `relatedFiles`

Returns the first matching entry or undefined.

#### redactCaptureText(text: string): string

Applies regex replacements:
- `sk-[a-zA-Z0-9]+` → `[REDACTED]`
- `password=[^\s]+` → `password=[REDACTED]`
- `api_key=[^\s]+` → `api_key=[REDACTED]`
- `-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----` → `[REDACTED]`

### 4. CLI Integration (memoryCommands.ts)

#### New subcommand routing:

```typescript
case "capture":
  await handleMemoryCapture(args.slice(1));
  break;
case "pending":
  await handleMemoryPending(args.slice(1));
  break;
```

#### handleMemoryCapture(args: string[])

1. Parse `<log-file>` positional arg and `--dry-run` / `--apply` flags
2. Read log file content (error + exit 1 if not found)
3. Call `extractCaptureSignals(logText)`
4. Call `generateCaptureCandidates(signals, logText)`
5. For each candidate:
   a. Call `redactCaptureText` on text fields
   b. Call `assessCaptureCandidate(candidate, signals)`
   c. Call `decideCaptureStatus(assessment)`
   d. Call `findSimilarMemory(candidate, existingEntries)`
   e. If duplicate: increment occurrences, update lastSeenAt
6. Display results (dry-run mode: show table of candidates with scores and decisions)
7. If `--apply`:
   a. Write active entries to Memory_Store (with `enabled: true`, `captureStatus: "active"`)
   b. Write quarantined entries to Pending_Store (with `enabled: false`, `captureStatus: "quarantined"`)
   c. Run health check, warn if degraded

#### handleMemoryPending(args: string[])

- `list`: Read and display pending entries
- `clear --apply`: Clear the pending store
- `clear` (no --apply): Show count only

### 5. Validation Updates

Add to `validateDevMemoryEntry`:

```typescript
const VALID_SOURCES = ["manual", "kiro_log", "imported"];
const VALID_CAPTURE_STATUSES = ["active", "quarantined", "discarded"];
const VALID_TRUST_LEVELS = ["probation", "trusted", "verified"];
const VALID_AUTHORITIES = ["hint", "rule", "constraint"];

// Validate optional governance fields
if (obj["source"] !== undefined && !VALID_SOURCES.includes(obj["source"])) {
  errors.push(`source must be one of: ${VALID_SOURCES.join(", ")}`);
}
// ... similar for captureStatus, trustLevel, authority
// evidence: validate shape if present
// captureAssessment: validate shape if present
// duplicateOf: string check
// occurrences: positive integer check
// lastSeenAt: string check
```

### 6. Public API Exports (src/index.ts)

Add exports for the new module:

```typescript
export {
  extractCaptureSignals,
  generateCaptureCandidates,
  assessCaptureCandidate,
  decideCaptureStatus,
  findSimilarMemory,
  redactCaptureText,
} from "./core/memoryCapture.js";
export type {
  CaptureSignals,
  MemoryCaptureCandidate,
  CaptureDecision,
} from "./core/memoryCapture.js";
export type {
  MemorySource,
  CaptureStatus,
  TrustLevel,
  Authority,
  CaptureEvidence,
  CaptureAssessment,
} from "./core/memoryValidator.js";
export {
  readPendingMemoryEntries,
  appendPendingMemoryEntry,
  clearPendingStore,
  PENDING_STORE_PATH,
} from "./core/memoryStore.js";
```

## Correctness Properties

### Property 1: Redaction Completeness

**For all** input strings containing secret patterns, `redactCaptureText(input)` SHALL contain zero matches for any pattern in SECRET_PATTERNS (excluding the generic "secret" pattern which is too broad for redaction).

```typescript
fc.assert(fc.property(
  fc.stringOf(fc.oneof(
    fc.constant("sk-abc123"),
    fc.constant("password=hunter2"),
    fc.constant("api_key=xyz"),
    fc.constant("BEGIN PRIVATE KEY"),
    fc.string(),
  )),
  (input) => {
    const result = redactCaptureText(input);
    // No sk- tokens, no password= values, no api_key= values, no BEGIN PRIVATE KEY
    assert(!(/sk-[a-zA-Z0-9]+/.test(result)));
    assert(!(/password=[^\s]+/.test(result)) || /password=\[REDACTED\]/.test(result));
    assert(!(/api_key=[^\s]+/.test(result)) || /api_key=\[REDACTED\]/.test(result));
    assert(!result.includes("BEGIN PRIVATE KEY"));
  }
), { numRuns: 100 });
```

### Property 2: Decision Determinism

**For all** valid CaptureAssessment inputs, `decideCaptureStatus(assessment)` SHALL return the same CaptureDecision when called multiple times.

```typescript
fc.assert(fc.property(
  arbitraryCaptureAssessment(),
  (assessment) => {
    const result1 = decideCaptureStatus(assessment);
    const result2 = decideCaptureStatus(assessment);
    assert.deepStrictEqual(result1, result2);
  }
), { numRuns: 100 });
```

### Property 3: Active Requires Strong Evidence

**For all** CaptureDecision results with status "active", the input assessment SHALL have `evidenceScore >= 6` AND `riskScore <= 3`.

```typescript
fc.assert(fc.property(
  arbitraryCaptureAssessment(),
  (assessment) => {
    const decision = decideCaptureStatus(assessment);
    if (decision.status === "active") {
      assert(assessment.evidenceScore >= 6);
      assert(assessment.riskScore <= 3);
    }
    return true;
  }
), { numRuns: 100 });
```

### Property 4: Quarantined Entries Are Disabled

**For all** candidates that receive "quarantined" status, the resulting DevMemoryEntry SHALL have `enabled: false`.

This is verified at the integration level: the pipeline always sets `enabled: false` when `captureStatus === "quarantined"`.

### Property 5: Auto-Captured Never Constraint

**For all** candidates produced by `generateCaptureCandidates`, the `authority` field SHALL never be "constraint".

```typescript
fc.assert(fc.property(
  arbitraryCaptureSignals(),
  arbitraryLogText(),
  (signals, logText) => {
    const candidates = generateCaptureCandidates(signals, logText);
    for (const c of candidates) {
      assert(c.authority !== "constraint");
    }
    return true;
  }
), { numRuns: 100 });
```

## Testing Strategy

### Unit Tests (memoryCapture.test.ts) — 14+ tests

1. extractCaptureSignals: detects lint failure
2. extractCaptureSignals: detects typecheck failure
3. extractCaptureSignals: detects test failure
4. extractCaptureSignals: extracts file paths
5. extractCaptureSignals: detects forbidden signals
6. generateCaptureCandidates: creates lint_fix candidate
7. generateCaptureCandidates: returns empty for no signals
8. assessCaptureCandidate: computes correct scores for strong candidate
9. assessCaptureCandidate: computes high risk for weak candidate
10. decideCaptureStatus: returns active for strong assessment
11. decideCaptureStatus: returns quarantined for medium assessment
12. decideCaptureStatus: returns discarded for weak assessment
13. redactCaptureText: removes sk- tokens
14. redactCaptureText: removes password values
15. findSimilarMemory: finds duplicate by kind + file overlap
16. findSimilarMemory: returns undefined when no match
17. CLI capture --dry-run: displays without writing
18. CLI capture --apply: writes to stores

### Property Tests (memoryCapture.property.test.ts) — 5 properties, 100 runs each

As described in Correctness Properties above.

## File Changes Summary

| File | Change |
|------|--------|
| `src/core/memoryValidator.ts` | Add governance types and validation |
| `src/core/memoryStore.ts` | Add pending store functions |
| `src/core/memoryCapture.ts` | New module — all capture pipeline functions |
| `src/core/memoryCommands.ts` | Add capture/pending subcommand handlers |
| `src/cli.ts` | No change (routing already handled by memoryCommands) |
| `src/index.ts` | Add new exports |
| `src/__tests__/memoryCapture.test.ts` | New — unit tests |
| `src/__tests__/memoryCapture.property.test.ts` | New — property tests |

