/**
 * memoryCapture.test.ts
 * Unit tests for the auto-capture governance pipeline.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  extractCaptureSignals,
  generateCaptureCandidates,
  assessCaptureCandidate,
  decideCaptureStatus,
  findSimilarMemory,
  redactCaptureText,
} from "../core/memoryCapture.js";
import type { CaptureSignals, MemoryCaptureCandidate } from "../core/memoryCapture.js";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import type { CaptureAssessment } from "../core/memoryValidator.js";

// ---------------------------------------------------------------------------
// extractCaptureSignals
// ---------------------------------------------------------------------------

describe("extractCaptureSignals", () => {
  it("detects lint failure", () => {
    const log = `Running checks...
ESLint found errors in src/core/foo.ts
lint error: no-unused-vars`;
    const signals = extractCaptureSignals(log);
    expect(signals.failedGate).toBe("lint");
  });

  it("detects typecheck failure", () => {
    const log = `> tsc --noEmit
TypeScript error in src/core/bar.ts
TS2345: Argument of type 'string' is not assignable`;
    const signals = extractCaptureSignals(log);
    expect(signals.failedGate).toBe("typecheck");
  });

  it("detects test failure", () => {
    const log = `vitest run
test failed: src/__tests__/foo.test.ts
  FAIL  1 test failed`;
    const signals = extractCaptureSignals(log);
    expect(signals.failedGate).toBe("test");
  });

  it("extracts file paths", () => {
    const log = `error in src/core/memoryStore.ts
  also affects src/__tests__/memoryStore.test.ts`;
    const signals = extractCaptureSignals(log);
    expect(signals.filesChanged).toContain("src/core/memoryStore.ts");
    expect(signals.filesChanged).toContain("src/__tests__/memoryStore.test.ts");
  });

  it("detects forbidden signals", () => {
    const log = `Applied workaround for flaky test
TODO: investigate root cause later`;
    const signals = extractCaptureSignals(log);
    expect(signals.forbiddenSignals.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// generateCaptureCandidates
// ---------------------------------------------------------------------------

describe("generateCaptureCandidates", () => {
  it("creates lint_fix candidate", () => {
    const signals: CaptureSignals = {
      failedGate: "lint",
      passedGate: "test",
      filesChanged: ["src/core/foo.ts"],
      errorSignals: ["error: no-unused-vars in src/core/foo.ts"],
      fixSignals: ["fixed unused import"],
      forbiddenSignals: [],
    };
    const candidates = generateCaptureCandidates(signals, "");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].kind).toBe("lint_fix");
    expect(candidates[0].source).toBe("kiro_log");
    expect(candidates[0].trustLevel).toBe("probation");
    expect(candidates[0].authority).toBe("hint");
    expect(candidates[0].autoCaptured).toBe(true);
  });

  it("returns empty for no signals", () => {
    const signals: CaptureSignals = {
      filesChanged: [],
      errorSignals: [],
      fixSignals: [],
      forbiddenSignals: [],
    };
    const candidates = generateCaptureCandidates(signals, "");
    expect(candidates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// assessCaptureCandidate
// ---------------------------------------------------------------------------

describe("assessCaptureCandidate", () => {
  it("computes correct scores for strong candidate", () => {
    const candidate: MemoryCaptureCandidate = {
      kind: "lint_fix",
      summary: "Fixed no-unused-vars error in memoryStore.ts",
      trigger: "lint gate failed",
      fix: "Removed unused import statement from file",
      futurePromptHint: "Always check for unused imports before committing code changes",
      relatedFiles: ["src/core/memoryStore.ts"],
      relatedSymbols: ["readMemoryEntries"],
      tags: ["lint_fix", "lint"],
      severity: "medium",
      confidence: "medium",
      source: "kiro_log",
      trustLevel: "probation",
      authority: "hint",
      autoCaptured: true,
      evidence: {
        failedGate: "lint",
        passedGate: "lint",
        filesChanged: ["src/core/memoryStore.ts"],
        errorSignals: ["error: no-unused-vars"],
      },
    };
    const signals: CaptureSignals = {
      failedGate: "lint",
      passedGate: "lint",
      filesChanged: ["src/core/memoryStore.ts"],
      errorSignals: ["error: no-unused-vars"],
      fixSignals: ["fixed unused import"],
      forbiddenSignals: [],
    };
    const assessment = assessCaptureCandidate(candidate, signals);
    expect(assessment.incidentScore).toBe(6); // 3+2+1
    expect(assessment.evidenceScore).toBe(10); // 3+3+2+2
    expect(assessment.rootCauseScore).toBe(6); // 3+2+1
    expect(assessment.correctiveActionScore).toBe(6); // 3+2+1
    expect(assessment.reusabilityScore).toBe(7); // 3+2+2
    expect(assessment.riskScore).toBe(0);
    expect(assessment.totalScore).toBe(35);
  });

  it("computes high risk for weak candidate", () => {
    const candidate: MemoryCaptureCandidate = {
      kind: "lint_fix",
      summary: "fix",
      trigger: "lint gate failed",
      fix: "",
      futurePromptHint: "short",
      relatedFiles: [],
      relatedSymbols: [],
      tags: [],
      severity: "medium",
      confidence: "medium",
      source: "kiro_log",
      trustLevel: "probation",
      authority: "hint",
      autoCaptured: true,
      evidence: {
        filesChanged: [],
        errorSignals: [],
      },
    };
    const signals: CaptureSignals = {
      filesChanged: [],
      errorSignals: [],
      fixSignals: [],
      forbiddenSignals: ["workaround applied"],
    };
    const assessment = assessCaptureCandidate(candidate, signals);
    // riskScore: +5 (forbidden) +3 (no failedGate) +3 (no passedGate) +2 (no filesChanged) +2 (hint<15)
    expect(assessment.riskScore).toBe(15);
    expect(assessment.totalScore).toBeLessThan(7);
  });
});

// ---------------------------------------------------------------------------
// decideCaptureStatus
// ---------------------------------------------------------------------------

describe("decideCaptureStatus", () => {
  it("returns active for strong assessment", () => {
    const assessment: CaptureAssessment = {
      incidentScore: 6,
      evidenceScore: 10,
      rootCauseScore: 6,
      correctiveActionScore: 6,
      reusabilityScore: 7,
      riskScore: 0,
      totalScore: 35,
      decision: "active",
      reasons: [],
    };
    const decision = decideCaptureStatus(assessment);
    expect(decision.status).toBe("active");
  });

  it("returns quarantined for medium assessment", () => {
    const assessment: CaptureAssessment = {
      incidentScore: 3,
      evidenceScore: 5,
      rootCauseScore: 3,
      correctiveActionScore: 3,
      reusabilityScore: 2,
      riskScore: 5,
      totalScore: 11,
      decision: "quarantined",
      reasons: [],
    };
    const decision = decideCaptureStatus(assessment);
    expect(decision.status).toBe("quarantined");
  });

  it("returns discarded for weak assessment", () => {
    const assessment: CaptureAssessment = {
      incidentScore: 0,
      evidenceScore: 0,
      rootCauseScore: 0,
      correctiveActionScore: 0,
      reusabilityScore: 0,
      riskScore: 15,
      totalScore: -15,
      decision: "discarded",
      reasons: [],
    };
    const decision = decideCaptureStatus(assessment);
    expect(decision.status).toBe("discarded");
  });
});

// ---------------------------------------------------------------------------
// redactCaptureText
// ---------------------------------------------------------------------------

describe("redactCaptureText", () => {
  it("removes sk- tokens", () => {
    const text = "Using API key sk-abc123xyz for auth";
    const result = redactCaptureText(text);
    expect(result).not.toContain("sk-abc123xyz");
    expect(result).toContain("[REDACTED]");
  });

  it("removes password values", () => {
    const text = "Connection: password=hunter2 host=localhost";
    const result = redactCaptureText(text);
    expect(result).not.toContain("hunter2");
    expect(result).toContain("password=[REDACTED]");
  });
});

// ---------------------------------------------------------------------------
// findSimilarMemory
// ---------------------------------------------------------------------------

describe("findSimilarMemory", () => {
  const baseEntry: DevMemoryEntry = {
    id: "existing-1",
    createdAt: "2024-01-01T00:00:00Z",
    kind: "lint_fix",
    summary: "Fixed lint error",
    trigger: "lint failed",
    fix: "removed unused",
    futurePromptHint: "check lint",
    relatedFiles: ["src/core/foo.ts"],
    relatedSymbols: [],
    tags: ["lint"],
    severity: "medium",
    confidence: "high",
    enabled: true,
  };

  it("finds duplicate by kind + file overlap", () => {
    const candidate: MemoryCaptureCandidate = {
      kind: "lint_fix",
      summary: "Another lint fix",
      trigger: "lint failed",
      fix: "removed unused",
      futurePromptHint: "check lint before commit",
      relatedFiles: ["src/core/foo.ts", "src/core/bar.ts"],
      relatedSymbols: [],
      tags: ["lint_fix", "lint"],
      severity: "medium",
      confidence: "medium",
      source: "kiro_log",
      trustLevel: "probation",
      authority: "hint",
      autoCaptured: true,
      evidence: { filesChanged: [], errorSignals: [] },
    };
    const result = findSimilarMemory(candidate, [baseEntry]);
    expect(result).toBeDefined();
    expect(result?.id).toBe("existing-1");
  });

  it("returns undefined when no match", () => {
    const candidate: MemoryCaptureCandidate = {
      kind: "type_fix",
      summary: "Type fix",
      trigger: "typecheck failed",
      fix: "added type annotation",
      futurePromptHint: "check types before commit",
      relatedFiles: ["src/core/other.ts"],
      relatedSymbols: [],
      tags: ["type_fix", "typecheck"],
      severity: "medium",
      confidence: "medium",
      source: "kiro_log",
      trustLevel: "probation",
      authority: "hint",
      autoCaptured: true,
      evidence: { filesChanged: [], errorSignals: [] },
    };
    const result = findSimilarMemory(candidate, [baseEntry]);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// CLI Integration
// ---------------------------------------------------------------------------

describe("CLI capture integration", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("capture --dry-run displays without writing", async () => {
    // We test the pipeline logic directly since CLI requires file I/O
    const logText = `ESLint found errors
lint error: no-unused-vars in src/core/foo.ts
error: 'bar' is defined but never used
fixed unused import`;
    const signals = extractCaptureSignals(logText);
    const candidates = generateCaptureCandidates(signals, logText);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].kind).toBe("lint_fix");

    // In dry-run mode, no writes happen — just assessment
    const assessment = assessCaptureCandidate(candidates[0], signals);
    const decision = decideCaptureStatus(assessment);
    expect(decision.status).toBeDefined();
  });

  it("capture --apply writes to stores (pipeline logic)", () => {
    // Verify the pipeline produces correct entry structure for writing
    const logText = `TypeScript error in src/core/bar.ts
typecheck failed
TS2345: Argument of type 'string' is not assignable
error: Type mismatch
lint pass
fixed type annotation`;
    const signals = extractCaptureSignals(logText);
    const candidates = generateCaptureCandidates(signals, logText);

    expect(candidates.length).toBeGreaterThan(0);
    const candidate = candidates[0];

    // Redact
    candidate.summary = redactCaptureText(candidate.summary);

    const assessment = assessCaptureCandidate(candidate, signals);
    const decision = decideCaptureStatus(assessment);

    // Verify entry structure would be valid
    expect(candidate.source).toBe("kiro_log");
    expect(candidate.authority).toBe("hint");
    expect(candidate.autoCaptured).toBe(true);
    expect(["active", "quarantined", "discarded"]).toContain(decision.status);
  });
});
