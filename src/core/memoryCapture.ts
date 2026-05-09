/**
 * memoryCapture.ts
 * Pure capture pipeline functions for auto-capture governance.
 * Signal extraction → Candidate generation → Assessment → Decision → Deduplication → Redaction
 */

import type { DevMemoryEntry, DevMemoryKind, Severity, Confidence } from "./memoryValidator.js";
import type { MemorySource, CaptureStatus, TrustLevel, MemoryAuthority, CaptureEvidence, CaptureAssessment } from "./memoryValidator.js";

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

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
  authority: MemoryAuthority;
  autoCaptured: boolean;
  evidence: CaptureEvidence;
}

export interface CaptureDecision {
  status: CaptureStatus;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Signal Extraction
// ---------------------------------------------------------------------------

/** Patterns for detecting failed gates */
const FAILED_GATE_PATTERNS: Array<{ pattern: RegExp; gate: string }> = [
  { pattern: /typecheck failed|TypeScript error|tsc error/i, gate: "typecheck" },
  { pattern: /lint error|ESLint/i, gate: "lint" },
  { pattern: /test failed|failed tests/i, gate: "test" },
  { pattern: /build failed|compilation failed/i, gate: "build" },
];

/** Patterns for detecting passed gates */
const PASSED_GATE_PATTERNS: Array<{ pattern: RegExp; gate: string }> = [
  { pattern: /typecheck pass/i, gate: "typecheck" },
  { pattern: /lint pass/i, gate: "lint" },
  { pattern: /test pass|all tests pass/i, gate: "test" },
  { pattern: /build pass/i, gate: "build" },
  { pattern: /quality gates pass/i, gate: "quality" },
];

/** Pattern for file paths */
const FILE_PATH_PATTERN = /(?:^|[\s"'`(])([a-zA-Z0-9_/.@-]+\.(?:ts|tsx|js|jsx|md|json))(?:[\s"'`):]|$)/gm;

/** Patterns for error signals */
const ERROR_SIGNAL_PATTERNS: RegExp[] = [
  /error:/i,
  /Error:/,
  /TypeError/,
  /SyntaxError/,
  /TS\d{4}/,
];

/** Patterns for fix signals */
const FIX_SIGNAL_PATTERNS: RegExp[] = [
  /\bfixed\b/i,
  /修正/,
  /\bupdate\b/i,
  /\breplace\b/i,
  /remove unused/i,
  /add validation/i,
  /add test/i,
];

/** Patterns for forbidden signals */
const FORBIDDEN_SIGNAL_PATTERNS: RegExp[] = [
  /暫定/,
  /一旦/,
  /とりあえず/,
  /\bworkaround\b/i,
  /\bskip\b/i,
  /\bTODO\b/,
  /\bflaky\b/i,
  /原因不明/,
  /緩める/,
  /\bignore\b/i,
  /disable test/i,
];

/**
 * Extract capture signals from log text.
 * Pure function — no side effects.
 */
export function extractCaptureSignals(logText: string): CaptureSignals {
  const lines = logText.split("\n");

  // Detect failed gate
  let failedGate: string | undefined;
  for (const line of lines) {
    for (const { pattern, gate } of FAILED_GATE_PATTERNS) {
      if (pattern.test(line)) {
        failedGate = gate;
        break;
      }
    }
    if (failedGate) break;
  }

  // Detect passed gate
  let passedGate: string | undefined;
  for (const line of lines) {
    for (const { pattern, gate } of PASSED_GATE_PATTERNS) {
      if (pattern.test(line)) {
        passedGate = gate;
        break;
      }
    }
    if (passedGate) break;
  }

  // Extract file paths
  const filesChanged: string[] = [];
  const fileMatches = logText.matchAll(FILE_PATH_PATTERN);
  const seenFiles = new Set<string>();
  for (const match of fileMatches) {
    const filePath = match[1];
    if (!seenFiles.has(filePath) && filePath.includes("/")) {
      seenFiles.add(filePath);
      filesChanged.push(filePath);
    }
  }

  // Extract error signals
  const errorSignals: string[] = [];
  for (const line of lines) {
    for (const pattern of ERROR_SIGNAL_PATTERNS) {
      if (pattern.test(line)) {
        errorSignals.push(line.trim());
        break;
      }
    }
  }

  // Extract fix signals
  const fixSignals: string[] = [];
  for (const line of lines) {
    for (const pattern of FIX_SIGNAL_PATTERNS) {
      if (pattern.test(line)) {
        fixSignals.push(line.trim());
        break;
      }
    }
  }

  // Extract forbidden signals
  const forbiddenSignals: string[] = [];
  for (const line of lines) {
    for (const pattern of FORBIDDEN_SIGNAL_PATTERNS) {
      if (pattern.test(line)) {
        forbiddenSignals.push(line.trim());
        break;
      }
    }
  }

  return {
    failedGate,
    passedGate,
    filesChanged,
    errorSignals,
    fixSignals,
    forbiddenSignals,
  };
}

// ---------------------------------------------------------------------------
// Candidate Generation
// ---------------------------------------------------------------------------

/**
 * ALLOWED capture kinds (allow-list, Phase 4-B governance).
 * Auto-capture MUST only produce candidates of these kinds.
 * Adding a new DevMemoryKind does NOT automatically allow it — it must be
 * explicitly added here after governance review.
 *
 * Forbidden-by-design kinds (design_decision, behavior_change, gotcha, etc.)
 * must NEVER be produced by auto-capture regardless of signal strength.
 */
export const ALLOWED_CAPTURE_KINDS: readonly DevMemoryKind[] = [
  "lint_fix",
  "type_fix",
  "test_fix",
  "build_fix",
  "schema_fix",
] as const;

/** Type guard: is this kind allowed for auto-capture? */
export function isAllowedCaptureKind(kind: DevMemoryKind): boolean {
  return (ALLOWED_CAPTURE_KINDS as readonly DevMemoryKind[]).includes(kind);
}

/** Map gate names to candidate kinds (only kinds from ALLOWED_CAPTURE_KINDS) */
const GATE_TO_KIND: Record<string, DevMemoryKind> = {
  lint: "lint_fix",
  typecheck: "type_fix",
  tsc: "type_fix",
  type: "type_fix",
  test: "test_fix",
  vitest: "test_fix",
  jest: "test_fix",
  build: "build_fix",
  compile: "build_fix",
  schema: "schema_fix",
  validation: "schema_fix",
};

/**
 * Generate capture candidates from extracted signals.
 * Pure function — no side effects.
 * Governance: only kinds in ALLOWED_CAPTURE_KINDS are ever produced.
 */
export function generateCaptureCandidates(signals: CaptureSignals, _logText: string): MemoryCaptureCandidate[] {
  if (!signals.failedGate) {
    return [];
  }

  const kind = GATE_TO_KIND[signals.failedGate];
  // Allow-list enforcement: only explicitly allowed kinds pass
  if (!kind || !isAllowedCaptureKind(kind)) {
    return [];
  }

  const summary = signals.errorSignals.length > 0
    ? signals.errorSignals[0].slice(0, 100)
    : `${signals.failedGate} gate failure detected`;

  const trigger = `${signals.failedGate} gate failed`;

  const fix = signals.fixSignals.length > 0
    ? signals.fixSignals[0].slice(0, 100)
    : "See log for resolution";

  const futurePromptHint = `Check ${signals.failedGate} gate before committing. Ensure ${kind.replace("_", " ")} patterns are followed.`;

  const candidate: MemoryCaptureCandidate = {
    kind,
    summary,
    trigger,
    fix,
    futurePromptHint,
    relatedFiles: signals.filesChanged,
    relatedSymbols: [],
    tags: [kind, signals.failedGate],
    severity: "medium" as Severity,
    confidence: "medium" as Confidence,
    source: "kiro_log" as MemorySource,
    trustLevel: "probation" as TrustLevel,
    authority: "hint" as MemoryAuthority,
    autoCaptured: true,
    evidence: {
      failedGate: signals.failedGate,
      passedGate: signals.passedGate,
      filesChanged: signals.filesChanged,
      errorSignals: signals.errorSignals,
    },
  };

  return [candidate];
}

// ---------------------------------------------------------------------------
// RCA-CAR Assessment
// ---------------------------------------------------------------------------

/**
 * Assess a capture candidate using RCA-CAR scoring methodology.
 * Pure function — deterministic for same inputs.
 */
export function assessCaptureCandidate(candidate: MemoryCaptureCandidate, signals: CaptureSignals): CaptureAssessment {
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
  const explicitKinds: DevMemoryKind[] = ["lint_fix", "type_fix", "test_fix", "build_fix", "schema_fix"];
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

  const totalScore = incidentScore + evidenceScore + rootCauseScore + correctiveActionScore + reusabilityScore - riskScore;

  const decision = decideCaptureStatusInternal({ totalScore, riskScore, evidenceScore, correctiveActionScore });

  const reasons: string[] = [];
  if (decision === "active") {
    reasons.push("Strong evidence and low risk");
  } else if (decision === "quarantined") {
    reasons.push("Moderate evidence — needs review");
  } else {
    reasons.push("Insufficient evidence or high risk");
  }

  return {
    incidentScore,
    evidenceScore,
    rootCauseScore,
    correctiveActionScore,
    reusabilityScore,
    riskScore,
    totalScore,
    decision,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Decision Policy
// ---------------------------------------------------------------------------

/** Internal decision helper used by both assessCaptureCandidate and decideCaptureStatus */
function decideCaptureStatusInternal(scores: {
  totalScore: number;
  riskScore: number;
  evidenceScore: number;
  correctiveActionScore: number;
}): CaptureStatus {
  if (
    scores.totalScore >= 12 &&
    scores.riskScore <= 3 &&
    scores.evidenceScore >= 6 &&
    scores.correctiveActionScore >= 4
  ) {
    return "active";
  }

  if (
    scores.totalScore >= 7 ||
    (scores.riskScore <= 6 && scores.evidenceScore >= 3)
  ) {
    return "quarantined";
  }

  return "discarded";
}

/**
 * Decide capture status from an assessment.
 * Pure function — deterministic for same inputs.
 */
export function decideCaptureStatus(assessment: CaptureAssessment): CaptureDecision {
  const status = decideCaptureStatusInternal({
    totalScore: assessment.totalScore,
    riskScore: assessment.riskScore,
    evidenceScore: assessment.evidenceScore,
    correctiveActionScore: assessment.correctiveActionScore,
  });

  const reasons: string[] = [];
  if (status === "active") {
    reasons.push(`totalScore=${assessment.totalScore}>=12`);
    reasons.push(`riskScore=${assessment.riskScore}<=3`);
    reasons.push(`evidenceScore=${assessment.evidenceScore}>=6`);
    reasons.push(`correctiveActionScore=${assessment.correctiveActionScore}>=4`);
  } else if (status === "quarantined") {
    if (assessment.totalScore >= 7) {
      reasons.push(`totalScore=${assessment.totalScore}>=7`);
    }
    if (assessment.riskScore <= 6 && assessment.evidenceScore >= 3) {
      reasons.push(`riskScore=${assessment.riskScore}<=6 AND evidenceScore=${assessment.evidenceScore}>=3`);
    }
  } else {
    reasons.push(`totalScore=${assessment.totalScore}<7`);
    reasons.push(`Does not meet quarantine criteria`);
  }

  return { status, reasons };
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Find a similar existing memory entry by kind + overlapping relatedFiles.
 * Pure function.
 */
export function findSimilarMemory(
  candidate: MemoryCaptureCandidate,
  existingEntries: DevMemoryEntry[],
): DevMemoryEntry | undefined {
  for (const entry of existingEntries) {
    if (entry.kind !== candidate.kind) continue;
    const hasOverlap = candidate.relatedFiles.some((f) =>
      entry.relatedFiles.includes(f),
    );
    if (hasOverlap) return entry;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/**
 * Redact secret patterns from text.
 * Pure function — replaces secrets with [REDACTED].
 */
export function redactCaptureText(text: string): string {
  let result = text;
  // Replace BEGIN PRIVATE KEY blocks
  result = result.replace(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g, "[REDACTED]");
  // Replace sk- tokens
  result = result.replace(/sk-[a-zA-Z0-9]+/g, "[REDACTED]");
  // Replace password= values
  result = result.replace(/password=[^\s]+/g, "password=[REDACTED]");
  // Replace api_key= values
  result = result.replace(/api_key=[^\s]+/g, "api_key=[REDACTED]");
  return result;
}
