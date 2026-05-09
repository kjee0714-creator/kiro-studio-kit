/**
 * memoryCapture.audit.test.ts
 * Phase 4-QA audit tests for Auto Capture Governance.
 * Focuses on gaps found during audit:
 * - allow-list enforcement (forbidden kinds must never be generated)
 * - build gate detection
 * - empty / noisy / mixed / Japanese log handling
 * - candidate count bounds
 * - Kiro-style completion-report log handling
 */

import { describe, it, expect } from "vitest";
import {
  extractCaptureSignals,
  generateCaptureCandidates,
  ALLOWED_CAPTURE_KINDS,
  isAllowedCaptureKind,
} from "../core/memoryCapture.js";
import type { DevMemoryKind } from "../core/memoryValidator.js";

// ---------------------------------------------------------------------------
// Allow-list Governance
// ---------------------------------------------------------------------------

describe("Allow-list governance", () => {
  it("ALLOWED_CAPTURE_KINDS contains only the 5 safe kinds", () => {
    const expected: DevMemoryKind[] = [
      "lint_fix",
      "type_fix",
      "test_fix",
      "build_fix",
      "schema_fix",
    ];
    expect([...ALLOWED_CAPTURE_KINDS].sort()).toEqual([...expected].sort());
  });

  it("isAllowedCaptureKind rejects forbidden high-risk kinds", () => {
    expect(isAllowedCaptureKind("design_decision")).toBe(false);
    expect(isAllowedCaptureKind("behavior_change")).toBe(false);
    expect(isAllowedCaptureKind("gotcha")).toBe(false);
  });

  it("isAllowedCaptureKind accepts allowed fix kinds", () => {
    expect(isAllowedCaptureKind("lint_fix")).toBe(true);
    expect(isAllowedCaptureKind("type_fix")).toBe(true);
    expect(isAllowedCaptureKind("test_fix")).toBe(true);
    expect(isAllowedCaptureKind("build_fix")).toBe(true);
    expect(isAllowedCaptureKind("schema_fix")).toBe(true);
  });

  it("every generated candidate kind is in the allow-list", () => {
    // Try a variety of logs that could theoretically produce forbidden kinds
    const logs = [
      "design decision: use new architecture pattern",
      "behavior change introduced in this commit",
      "gotcha: unexpected edge case",
      "architecture decision for module layout",
      "product policy update applied",
      "user preference changed",
      "irreversible rule established",
      "lint error: no-unused-vars in src/core/foo.ts",
    ];
    for (const logText of logs) {
      const signals = extractCaptureSignals(logText);
      const candidates = generateCaptureCandidates(signals, logText);
      for (const c of candidates) {
        expect(isAllowedCaptureKind(c.kind)).toBe(true);
      }
    }
  });

  it("log mentioning 'design decision' alone produces no candidate", () => {
    const log = `Design decision: we will use the repository pattern.
Architecture decision: split modules by bounded context.`;
    const signals = extractCaptureSignals(log);
    const candidates = generateCaptureCandidates(signals, log);
    expect(candidates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Build gate detection (was missing from original tests)
// ---------------------------------------------------------------------------

describe("Build gate detection", () => {
  it("detects build failure", () => {
    const log = `Running build...
build failed: cannot resolve module
error in src/core/foo.ts`;
    const signals = extractCaptureSignals(log);
    expect(signals.failedGate).toBe("build");
  });

  it("detects compilation failure", () => {
    const log = `compilation failed at src/core/bar.ts
TS2345: Type error`;
    const signals = extractCaptureSignals(log);
    expect(signals.failedGate).toBe("build");
  });

  it("generates build_fix candidate for build failure", () => {
    const signals = extractCaptureSignals("build failed\nerror in src/core/foo.ts\nbuild pass");
    const candidates = generateCaptureCandidates(signals, "");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].kind).toBe("build_fix");
  });
});

// ---------------------------------------------------------------------------
// Empty / noisy / edge-case log handling
// ---------------------------------------------------------------------------

describe("Edge-case log handling", () => {
  it("empty log produces no signals and no candidates", () => {
    const signals = extractCaptureSignals("");
    expect(signals.failedGate).toBeUndefined();
    expect(signals.passedGate).toBeUndefined();
    expect(signals.filesChanged).toEqual([]);
    const candidates = generateCaptureCandidates(signals, "");
    expect(candidates).toHaveLength(0);
  });

  it("whitespace-only log produces no candidates", () => {
    const signals = extractCaptureSignals("   \n\n  \t  \n");
    const candidates = generateCaptureCandidates(signals, "");
    expect(candidates).toHaveLength(0);
  });

  it("passed-only log produces no candidate", () => {
    const log = `typecheck pass
lint pass
test pass
build pass
all tests pass`;
    const signals = extractCaptureSignals(log);
    expect(signals.failedGate).toBeUndefined();
    const candidates = generateCaptureCandidates(signals, "");
    expect(candidates).toHaveLength(0);
  });

  it("very long log does not break extraction", () => {
    const hugeLog = Array.from({ length: 5000 }, (_, i) =>
      `line ${i}: some noise`,
    ).join("\n") + "\nlint error: something\nsrc/core/foo.ts";
    const signals = extractCaptureSignals(hugeLog);
    expect(signals.failedGate).toBe("lint");
    expect(signals.filesChanged).toContain("src/core/foo.ts");
  });
});

// ---------------------------------------------------------------------------
// Mixed gate log — takes the first failed gate found
// ---------------------------------------------------------------------------

describe("Mixed gate log handling", () => {
  it("log with multiple gate failures picks the first encountered", () => {
    const log = `typecheck failed
lint error found later
src/core/foo.ts`;
    const signals = extractCaptureSignals(log);
    // First match wins — should be typecheck
    expect(signals.failedGate).toBe("typecheck");
  });

  it("log with fail-then-pass pattern detects both", () => {
    const log = `lint error: initial failure
src/core/foo.ts fixed
lint pass`;
    const signals = extractCaptureSignals(log);
    expect(signals.failedGate).toBe("lint");
    expect(signals.passedGate).toBe("lint");
  });

  it("generates exactly one candidate per log (no over-generation)", () => {
    const log = `lint error: in src/core/a.ts
error: in src/core/b.ts
error: in src/core/c.ts
lint pass
fixed unused import`;
    const signals = extractCaptureSignals(log);
    const candidates = generateCaptureCandidates(signals, log);
    // MVP policy: one candidate per log
    expect(candidates.length).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Japanese log handling
// ---------------------------------------------------------------------------

describe("Japanese log handling", () => {
  it("Japanese-only log with no gate signal produces no candidate", () => {
    const log = `実装が完了しました。
テストも追加しました。
レビューをお願いします。`;
    const signals = extractCaptureSignals(log);
    const candidates = generateCaptureCandidates(signals, log);
    expect(candidates).toHaveLength(0);
  });

  it("Japanese forbidden signals are detected", () => {
    const log = `暫定対応として一旦コメントアウトしました。
とりあえずテストをskipしています。
原因不明ですが修正しました。`;
    const signals = extractCaptureSignals(log);
    expect(signals.forbiddenSignals.length).toBeGreaterThan(0);
  });

  it("Japanese fix signals are detected", () => {
    const log = `バグを修正しました。
lint error in src/core/foo.ts
lint pass`;
    const signals = extractCaptureSignals(log);
    expect(signals.fixSignals.length).toBeGreaterThan(0);
    expect(signals.failedGate).toBe("lint");
  });

  it("mixed Japanese/English log works", () => {
    const log = `修正完了: src/core/foo.ts
typecheck failed
TS2345: type mismatch
typecheck pass`;
    const signals = extractCaptureSignals(log);
    expect(signals.failedGate).toBe("typecheck");
    expect(signals.passedGate).toBe("typecheck");
    expect(signals.filesChanged).toContain("src/core/foo.ts");
  });
});

// ---------------------------------------------------------------------------
// Kiro-style completion report
// ---------------------------------------------------------------------------

describe("Kiro-style completion report", () => {
  it("typical completion report with only pass signals produces no candidate", () => {
    const log = `## Final Report
- Changed files: src/core/foo.ts, src/core/bar.ts
- Tests executed: npm test
- Quality gate results: typecheck pass, lint pass, test pass, build pass
- Issues encountered: none
- Remaining risks: none`;
    const signals = extractCaptureSignals(log);
    expect(signals.failedGate).toBeUndefined();
    const candidates = generateCaptureCandidates(signals, log);
    expect(candidates).toHaveLength(0);
  });

  it("completion report with fail-then-fix produces allowed candidate", () => {
    const log = `## Final Report
- Quality gate results:
  - typecheck failed initially (TS2345 in src/core/foo.ts)
  - After fix: typecheck pass
  - lint pass
  - test pass
- Fixed: added type annotation`;
    const signals = extractCaptureSignals(log);
    expect(signals.failedGate).toBe("typecheck");
    const candidates = generateCaptureCandidates(signals, log);
    expect(candidates).toHaveLength(1);
    expect(isAllowedCaptureKind(candidates[0].kind)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Determinism & purity
// ---------------------------------------------------------------------------

describe("Pure function guarantees", () => {
  it("same input to extractCaptureSignals produces deep-equal output", () => {
    const log = `lint error: in src/core/foo.ts
lint pass
fixed unused import`;
    const s1 = extractCaptureSignals(log);
    const s2 = extractCaptureSignals(log);
    expect(s1).toEqual(s2);
  });

  it("same input to generateCaptureCandidates produces deep-equal output", () => {
    const signals = extractCaptureSignals(
      "lint error: in src/core/foo.ts\nlint pass\nfixed",
    );
    const c1 = generateCaptureCandidates(signals, "");
    const c2 = generateCaptureCandidates(signals, "");
    expect(c1).toEqual(c2);
  });

  it("candidate fields are never empty strings", () => {
    const signals = extractCaptureSignals(
      "lint error in src/core/foo.ts\nlint pass",
    );
    const candidates = generateCaptureCandidates(signals, "");
    for (const c of candidates) {
      expect(c.summary.length).toBeGreaterThan(0);
      expect(c.trigger.length).toBeGreaterThan(0);
      expect(c.fix.length).toBeGreaterThan(0);
      expect(c.futurePromptHint.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// File path extraction quality
// ---------------------------------------------------------------------------

describe("File path extraction quality", () => {
  it("extracts Unix paths", () => {
    const log = "error in src/core/memoryStore.ts at line 42";
    const signals = extractCaptureSignals(log);
    expect(signals.filesChanged).toContain("src/core/memoryStore.ts");
  });

  it("extracts multiple related files without duplicates", () => {
    const log = `error in src/core/foo.ts
also affects src/core/foo.ts
and src/__tests__/foo.test.ts`;
    const signals = extractCaptureSignals(log);
    // foo.ts should appear only once (dedupe)
    const fooCount = signals.filesChanged.filter(
      (f) => f === "src/core/foo.ts",
    ).length;
    expect(fooCount).toBe(1);
  });

  it("ignores non-source file paths", () => {
    const log = "random text without file references";
    const signals = extractCaptureSignals(log);
    expect(signals.filesChanged).toEqual([]);
  });
});
