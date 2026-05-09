/**
 * memoryValidator.ts
 * Type definitions and hand-written validation for DevMemoryEntry.
 * No external runtime dependencies — replaces Zod with lightweight validation.
 */

/** Memory entry kind — 8 allowed values */
export type DevMemoryKind =
  | "test_fix"
  | "type_fix"
  | "lint_fix"
  | "build_fix"
  | "schema_fix"
  | "behavior_change"
  | "design_decision"
  | "gotcha";

/** Severity levels */
export type Severity = "low" | "medium" | "high";

/** Confidence levels */
export type Confidence = "low" | "medium" | "high";

/** Memory mode for prompt injection */
export type MemoryMode = "auto" | "off" | "full";

/** Source of the memory entry */
export type MemorySource = "manual" | "kiro_log" | "imported";

/** Capture lifecycle status */
export type CaptureStatus = "active" | "quarantined" | "discarded";

/** Trust level for auto-captured entries */
export type TrustLevel = "probation" | "trusted" | "verified";

/** Authority level — how strongly the entry should influence prompts */
export type MemoryAuthority = "hint" | "rule" | "constraint";

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

/** Usage statistics for trust tracking */
export interface MemoryUsageStats {
  selectedCount: number;
  successfulSelections: number;
  rejectedSelections: number;
  lastSelectedAt?: string;
  lastSuccessfulAt?: string;
  lastRejectedAt?: string;
}

/** A single development memory entry */
export interface DevMemoryEntry {
  id: string;
  createdAt: string;
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
  enabled: boolean;
  // Optional fields
  project?: string;
  phase?: string;
  taskName?: string;
  supersedes?: string[];
  expiresAt?: string;
  // Lifecycle fields (Phase 3)
  deleted?: boolean;
  deletedAt?: string;
  // Health monitor fields (Phase 4-A)
  autoCaptured?: boolean;
  conflictKey?: string;
  // Governance fields (Phase 4-B)
  source?: MemorySource;
  captureStatus?: CaptureStatus;
  trustLevel?: TrustLevel;
  authority?: MemoryAuthority;
  evidence?: CaptureEvidence;
  captureAssessment?: CaptureAssessment;
  duplicateOf?: string;
  occurrences?: number;
  lastSeenAt?: string;
  // Trust/Promotion fields (Phase 4-C)
  promotedAt?: string;
  verifiedAt?: string;
  degradedAt?: string;
  usageStats?: MemoryUsageStats;
  trustScore?: number;
  // Conflict Management fields (Phase 4-K)
  supersededBy?: string;
  disabledReason?: string;
  // Duplicate Management fields (Phase 4-L)
  duplicates?: string[];
  mergedInto?: string;
  // Scope / Project Separation fields (Phase 4-M)
  scope?: "global" | "project" | "domain" | "temporary";
  domains?: string[];
  // Decay / Expiry fields (Phase 4-N)
  lastReviewedAt?: string;
  staleAfterDays?: number;
}

/** Validation result */
export interface ValidationResult {
  success: boolean;
  errors: string[];
}

/** List of valid DevMemoryKind values */
export const VALID_KINDS: readonly DevMemoryKind[] = [
  "test_fix",
  "type_fix",
  "lint_fix",
  "build_fix",
  "schema_fix",
  "behavior_change",
  "design_decision",
  "gotcha",
] as const;

/** List of valid Severity values */
export const VALID_SEVERITIES: readonly Severity[] = ["low", "medium", "high"] as const;

/** List of valid Confidence values */
export const VALID_CONFIDENCES: readonly Confidence[] = ["low", "medium", "high"] as const;

/** List of valid MemoryMode values */
export const VALID_MEMORY_MODES: readonly MemoryMode[] = ["auto", "off", "full"] as const;

/** List of valid MemorySource values */
export const VALID_SOURCES: readonly MemorySource[] = ["manual", "kiro_log", "imported"] as const;

/** List of valid CaptureStatus values */
export const VALID_CAPTURE_STATUSES: readonly CaptureStatus[] = ["active", "quarantined", "discarded"] as const;

/** List of valid TrustLevel values */
export const VALID_TRUST_LEVELS: readonly TrustLevel[] = ["probation", "trusted", "verified"] as const;

/** List of valid Authority values */
export const VALID_AUTHORITIES: readonly MemoryAuthority[] = ["hint", "rule", "constraint"] as const;

/**
 * Validate a DevMemoryEntry. Returns a ValidationResult with field-level error messages.
 * Empty errors array means the input is valid.
 */
export function validateDevMemoryEntry(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (input === null || input === undefined || typeof input !== "object") {
    return { success: false, errors: ["input must be a non-null object"] };
  }

  const obj = input as Record<string, unknown>;

  // Required non-empty strings
  const requiredStrings: Array<{ field: string; label: string }> = [
    { field: "id", label: "id" },
    { field: "createdAt", label: "createdAt" },
    { field: "summary", label: "summary" },
    { field: "trigger", label: "trigger" },
    { field: "fix", label: "fix" },
    { field: "futurePromptHint", label: "futurePromptHint" },
  ];

  for (const { field, label } of requiredStrings) {
    if (typeof obj[field] !== "string") {
      errors.push(`${label} must be a string`);
    } else if ((obj[field] as string).length === 0) {
      errors.push(`${label} must not be empty`);
    }
  }

  // kind enum
  if (!VALID_KINDS.includes(obj["kind"] as DevMemoryKind)) {
    errors.push(`kind must be one of: ${VALID_KINDS.join(", ")}`);
  }

  // severity enum
  if (!VALID_SEVERITIES.includes(obj["severity"] as Severity)) {
    errors.push(`severity must be one of: ${VALID_SEVERITIES.join(", ")}`);
  }

  // confidence enum
  if (!VALID_CONFIDENCES.includes(obj["confidence"] as Confidence)) {
    errors.push(`confidence must be one of: ${VALID_CONFIDENCES.join(", ")}`);
  }

  // enabled boolean
  if (typeof obj["enabled"] !== "boolean") {
    errors.push("enabled must be a boolean");
  }

  // Required string arrays
  const requiredArrays: Array<{ field: string; label: string }> = [
    { field: "relatedFiles", label: "relatedFiles" },
    { field: "relatedSymbols", label: "relatedSymbols" },
    { field: "tags", label: "tags" },
  ];

  for (const { field, label } of requiredArrays) {
    if (!Array.isArray(obj[field])) {
      errors.push(`${label} must be an array`);
    } else if (!(obj[field] as unknown[]).every((item) => typeof item === "string")) {
      errors.push(`${label} must be an array of strings`);
    }
  }

  // Optional fields validation
  if (obj["project"] !== undefined && typeof obj["project"] !== "string") {
    errors.push("project must be a string if provided");
  }
  if (obj["phase"] !== undefined && typeof obj["phase"] !== "string") {
    errors.push("phase must be a string if provided");
  }
  if (obj["taskName"] !== undefined && typeof obj["taskName"] !== "string") {
    errors.push("taskName must be a string if provided");
  }
  if (obj["expiresAt"] !== undefined && typeof obj["expiresAt"] !== "string") {
    errors.push("expiresAt must be a string if provided");
  }
  if (obj["supersedes"] !== undefined) {
    if (!Array.isArray(obj["supersedes"])) {
      errors.push("supersedes must be an array of strings if provided");
    } else if (!(obj["supersedes"] as unknown[]).every((item) => typeof item === "string")) {
      errors.push("supersedes must be an array of strings if provided");
    }
  }

  // Lifecycle fields validation
  if (obj["deleted"] !== undefined && typeof obj["deleted"] !== "boolean") {
    errors.push("deleted must be a boolean if provided");
  }
  if (obj["deletedAt"] !== undefined && typeof obj["deletedAt"] !== "string") {
    errors.push("deletedAt must be a string if provided");
  }

  // Health monitor fields validation (Phase 4-A)
  if (obj["autoCaptured"] !== undefined && typeof obj["autoCaptured"] !== "boolean") {
    errors.push("autoCaptured must be a boolean if provided");
  }
  if (obj["conflictKey"] !== undefined && typeof obj["conflictKey"] !== "string") {
    errors.push("conflictKey must be a string if provided");
  }

  // Conflict Management fields validation (Phase 4-K)
  if (obj["supersededBy"] !== undefined && typeof obj["supersededBy"] !== "string") {
    errors.push("supersededBy must be a string if provided");
  }
  if (obj["disabledReason"] !== undefined && typeof obj["disabledReason"] !== "string") {
    errors.push("disabledReason must be a string if provided");
  }

  // Duplicate Management fields validation (Phase 4-L)
  if (obj["duplicates"] !== undefined) {
    if (!Array.isArray(obj["duplicates"])) {
      errors.push("duplicates must be an array of strings if provided");
    } else if (!(obj["duplicates"] as unknown[]).every((item) => typeof item === "string")) {
      errors.push("duplicates must be an array of strings if provided");
    }
  }
  if (obj["mergedInto"] !== undefined && typeof obj["mergedInto"] !== "string") {
    errors.push("mergedInto must be a string if provided");
  }

  // Scope / Project Separation fields validation (Phase 4-M)
  const VALID_SCOPES = ["global", "project", "domain", "temporary"];
  if (obj["scope"] !== undefined && !VALID_SCOPES.includes(obj["scope"] as string)) {
    errors.push(`scope must be one of: ${VALID_SCOPES.join(", ")}`);
  }
  if (obj["domains"] !== undefined) {
    if (!Array.isArray(obj["domains"])) {
      errors.push("domains must be an array of strings if provided");
    } else if (!(obj["domains"] as unknown[]).every((item) => typeof item === "string")) {
      errors.push("domains must be an array of strings if provided");
    }
  }

  // Decay / Expiry fields validation (Phase 4-N)
  if (obj["lastReviewedAt"] !== undefined && typeof obj["lastReviewedAt"] !== "string") {
    errors.push("lastReviewedAt must be a string if provided");
  }
  if (obj["staleAfterDays"] !== undefined) {
    if (typeof obj["staleAfterDays"] !== "number" || !Number.isInteger(obj["staleAfterDays"]) || (obj["staleAfterDays"] as number) < 0) {
      errors.push("staleAfterDays must be a non-negative integer if provided");
    }
  }

  // Governance fields validation (Phase 4-B)
  if (obj["source"] !== undefined && !VALID_SOURCES.includes(obj["source"] as MemorySource)) {
    errors.push(`source must be one of: ${VALID_SOURCES.join(", ")}`);
  }
  if (obj["captureStatus"] !== undefined && !VALID_CAPTURE_STATUSES.includes(obj["captureStatus"] as CaptureStatus)) {
    errors.push(`captureStatus must be one of: ${VALID_CAPTURE_STATUSES.join(", ")}`);
  }
  if (obj["trustLevel"] !== undefined && !VALID_TRUST_LEVELS.includes(obj["trustLevel"] as TrustLevel)) {
    errors.push(`trustLevel must be one of: ${VALID_TRUST_LEVELS.join(", ")}`);
  }
  if (obj["authority"] !== undefined && !VALID_AUTHORITIES.includes(obj["authority"] as MemoryAuthority)) {
    errors.push(`authority must be one of: ${VALID_AUTHORITIES.join(", ")}`);
  }
  if (obj["evidence"] !== undefined) {
    if (typeof obj["evidence"] !== "object" || obj["evidence"] === null) {
      errors.push("evidence must be an object if provided");
    } else {
      const ev = obj["evidence"] as Record<string, unknown>;
      if (!Array.isArray(ev["filesChanged"]) || !(ev["filesChanged"] as unknown[]).every((item) => typeof item === "string")) {
        errors.push("evidence.filesChanged must be an array of strings");
      }
      if (!Array.isArray(ev["errorSignals"]) || !(ev["errorSignals"] as unknown[]).every((item) => typeof item === "string")) {
        errors.push("evidence.errorSignals must be an array of strings");
      }
    }
  }
  if (obj["captureAssessment"] !== undefined) {
    if (typeof obj["captureAssessment"] !== "object" || obj["captureAssessment"] === null) {
      errors.push("captureAssessment must be an object if provided");
    } else {
      const ca = obj["captureAssessment"] as Record<string, unknown>;
      const scoreFields = ["incidentScore", "evidenceScore", "rootCauseScore", "correctiveActionScore", "reusabilityScore", "riskScore", "totalScore"];
      for (const field of scoreFields) {
        if (typeof ca[field] !== "number") {
          errors.push(`captureAssessment.${field} must be a number`);
        }
      }
      if (!VALID_CAPTURE_STATUSES.includes(ca["decision"] as CaptureStatus)) {
        errors.push(`captureAssessment.decision must be one of: ${VALID_CAPTURE_STATUSES.join(", ")}`);
      }
      if (!Array.isArray(ca["reasons"]) || !(ca["reasons"] as unknown[]).every((item) => typeof item === "string")) {
        errors.push("captureAssessment.reasons must be an array of strings");
      }
    }
  }
  if (obj["duplicateOf"] !== undefined && typeof obj["duplicateOf"] !== "string") {
    errors.push("duplicateOf must be a string if provided");
  }
  if (obj["occurrences"] !== undefined && typeof obj["occurrences"] !== "number") {
    errors.push("occurrences must be a number if provided");
  }
  if (obj["lastSeenAt"] !== undefined && typeof obj["lastSeenAt"] !== "string") {
    errors.push("lastSeenAt must be a string if provided");
  }

  // Trust/Promotion fields validation (Phase 4-C)
  if (obj["promotedAt"] !== undefined && typeof obj["promotedAt"] !== "string") {
    errors.push("promotedAt must be a string if provided");
  }
  if (obj["verifiedAt"] !== undefined && typeof obj["verifiedAt"] !== "string") {
    errors.push("verifiedAt must be a string if provided");
  }
  if (obj["degradedAt"] !== undefined && typeof obj["degradedAt"] !== "string") {
    errors.push("degradedAt must be a string if provided");
  }
  if (obj["trustScore"] !== undefined && typeof obj["trustScore"] !== "number") {
    errors.push("trustScore must be a number if provided");
  }
  if (obj["usageStats"] !== undefined) {
    if (typeof obj["usageStats"] !== "object" || obj["usageStats"] === null) {
      errors.push("usageStats must be an object if provided");
    } else {
      const us = obj["usageStats"] as Record<string, unknown>;
      if (typeof us["selectedCount"] !== "number") {
        errors.push("usageStats.selectedCount must be a number");
      }
      if (typeof us["successfulSelections"] !== "number") {
        errors.push("usageStats.successfulSelections must be a number");
      }
      if (typeof us["rejectedSelections"] !== "number") {
        errors.push("usageStats.rejectedSelections must be a number");
      }
      if (us["lastSelectedAt"] !== undefined && typeof us["lastSelectedAt"] !== "string") {
        errors.push("usageStats.lastSelectedAt must be a string if provided");
      }
      if (us["lastSuccessfulAt"] !== undefined && typeof us["lastSuccessfulAt"] !== "string") {
        errors.push("usageStats.lastSuccessfulAt must be a string if provided");
      }
      if (us["lastRejectedAt"] !== undefined && typeof us["lastRejectedAt"] !== "string") {
        errors.push("usageStats.lastRejectedAt must be a string if provided");
      }
    }
  }

  return { success: errors.length === 0, errors };
}

/**
 * Type guard: narrows unknown to DevMemoryEntry if valid.
 */
export function isValidDevMemoryEntry(input: unknown): input is DevMemoryEntry {
  return validateDevMemoryEntry(input).success;
}
