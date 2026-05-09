/**
 * trustLifecycle.test.ts
 * Unit tests for trust lifecycle assessment and application (Phase 4-H).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import {
  assessTrustLifecycleAction,
  applyTrustLifecycleDecision,
} from "../core/memoryTrust.js";
import type { TrustLifecycleDecision } from "../core/memoryTrust.js";

function makeEntry(overrides: Partial<DevMemoryEntry> = {}): DevMemoryEntry {
  return {
    id: overrides.id ?? "test-id-1",
    createdAt: overrides.createdAt ?? "2024-01-01T00:00:00.000Z",
    kind: "test_fix",
    summary: "Test summary",
    trigger: "Test trigger",
    fix: "Test fix",
    futurePromptHint: "Test hint",
    relatedFiles: [],
    relatedSymbols: [],
    tags: [],
    severity: "medium",
    confidence: "high",
    enabled: true,
    trustLevel: "probation",
    ...overrides,
  };
}

describe("assessTrustLifecycleAction", () => {
  it("returns upgrade_to_trusted for eligible probation entry", () => {
    const entry = makeEntry({
      trustLevel: "probation",
      usageStats: { selectedCount: 5, successfulSelections: 4, rejectedSelections: 0 },
    });
    const decision = assessTrustLifecycleAction(entry);
    expect(decision.action).toBe("upgrade_to_trusted");
    expect(decision.afterTrustLevel).toBe("trusted");
  });

  it("returns none for probation entry with insufficient successes", () => {
    const entry = makeEntry({
      trustLevel: "probation",
      usageStats: { selectedCount: 2, successfulSelections: 2, rejectedSelections: 0 },
    });
    const decision = assessTrustLifecycleAction(entry);
    expect(decision.action).toBe("none");
  });

  it("returns none for probation entry with rejections", () => {
    const entry = makeEntry({
      trustLevel: "probation",
      usageStats: { selectedCount: 5, successfulSelections: 4, rejectedSelections: 1 },
    });
    const decision = assessTrustLifecycleAction(entry);
    expect(decision.action).toBe("none");
  });

  it("returns none for verified entry regardless of stats", () => {
    const entry = makeEntry({
      trustLevel: "verified",
      usageStats: { selectedCount: 100, successfulSelections: 50, rejectedSelections: 50 },
    });
    const decision = assessTrustLifecycleAction(entry);
    expect(decision.action).toBe("none");
    expect(decision.reason).toContain("Verified");
  });

  it("returns none for deleted entry", () => {
    const entry = makeEntry({
      deleted: true,
      usageStats: { selectedCount: 10, successfulSelections: 5, rejectedSelections: 0 },
    });
    const decision = assessTrustLifecycleAction(entry);
    expect(decision.action).toBe("none");
    expect(decision.reason).toContain("deleted");
  });

  it("returns none for disabled entry", () => {
    const entry = makeEntry({
      enabled: false,
      usageStats: { selectedCount: 10, successfulSelections: 5, rejectedSelections: 0 },
    });
    const decision = assessTrustLifecycleAction(entry);
    expect(decision.action).toBe("none");
    expect(decision.reason).toContain("disabled");
  });

  it("returns none for discarded entry", () => {
    const entry = makeEntry({
      captureStatus: "discarded",
      usageStats: { selectedCount: 10, successfulSelections: 5, rejectedSelections: 0 },
    });
    const decision = assessTrustLifecycleAction(entry);
    expect(decision.action).toBe("none");
    expect(decision.reason).toContain("discarded");
  });

  it("returns degrade_to_probation for trusted entry with 3+ rejections > successes", () => {
    const entry = makeEntry({
      trustLevel: "trusted",
      usageStats: { selectedCount: 10, successfulSelections: 2, rejectedSelections: 4 },
    });
    const decision = assessTrustLifecycleAction(entry);
    expect(decision.action).toBe("degrade_to_probation");
    expect(decision.afterTrustLevel).toBe("probation");
  });

  it("returns none for trusted entry with rejections <= successes", () => {
    const entry = makeEntry({
      trustLevel: "trusted",
      usageStats: { selectedCount: 10, successfulSelections: 5, rejectedSelections: 3 },
    });
    const decision = assessTrustLifecycleAction(entry);
    expect(decision.action).toBe("none");
  });

  it("returns none for probation entry with high rejections (no auto-degrade below probation)", () => {
    const entry = makeEntry({
      trustLevel: "probation",
      usageStats: { selectedCount: 10, successfulSelections: 1, rejectedSelections: 5 },
    });
    const decision = assessTrustLifecycleAction(entry);
    expect(decision.action).toBe("none");
  });

  it("treats undefined trustLevel as probation", () => {
    const entry = makeEntry({
      usageStats: { selectedCount: 5, successfulSelections: 4, rejectedSelections: 0 },
    });
    delete (entry as Record<string, unknown>)["trustLevel"];
    const decision = assessTrustLifecycleAction(entry);
    expect(decision.action).toBe("upgrade_to_trusted");
  });
});

describe("applyTrustLifecycleDecision", () => {
  it("upgrade_to_trusted sets trustLevel, promotedAt, trustScore", () => {
    const entry = makeEntry({ trustLevel: "probation", trustScore: 30 });
    const decision: TrustLifecycleDecision = {
      action: "upgrade_to_trusted",
      reason: "test",
      beforeTrustLevel: "probation",
      afterTrustLevel: "trusted",
    };
    const now = new Date("2024-06-01T12:00:00.000Z");
    const result = applyTrustLifecycleDecision(entry, decision, now);

    expect(result.trustLevel).toBe("trusted");
    expect(result.promotedAt).toBe("2024-06-01T12:00:00.000Z");
    expect(result.trustScore).toBe(50); // max(30, 50)
  });

  it("degrade_to_probation sets trustLevel, degradedAt, trustScore", () => {
    const entry = makeEntry({ trustLevel: "trusted", trustScore: 60 });
    const decision: TrustLifecycleDecision = {
      action: "degrade_to_probation",
      reason: "test",
      beforeTrustLevel: "trusted",
      afterTrustLevel: "probation",
    };
    const now = new Date("2024-06-01T12:00:00.000Z");
    const result = applyTrustLifecycleDecision(entry, decision, now);

    expect(result.trustLevel).toBe("probation");
    expect(result.degradedAt).toBe("2024-06-01T12:00:00.000Z");
    expect(result.trustScore).toBe(30); // min(60, 30)
  });

  it("manual_verify sets trustLevel to verified, verifiedAt, trustScore=100", () => {
    const entry = makeEntry({ trustLevel: "trusted", trustScore: 60 });
    const decision: TrustLifecycleDecision = {
      action: "manual_verify",
      reason: "Human approved",
      beforeTrustLevel: "trusted",
      afterTrustLevel: "verified",
    };
    const now = new Date("2024-06-01T12:00:00.000Z");
    const result = applyTrustLifecycleDecision(entry, decision, now);

    expect(result.trustLevel).toBe("verified");
    expect(result.verifiedAt).toBe("2024-06-01T12:00:00.000Z");
    expect(result.trustScore).toBe(100);
  });

  it("none action returns a copy without changes", () => {
    const entry = makeEntry({ trustLevel: "probation", trustScore: 30 });
    const decision: TrustLifecycleDecision = {
      action: "none",
      reason: "No action",
      beforeTrustLevel: "probation",
      afterTrustLevel: "probation",
    };
    const result = applyTrustLifecycleDecision(entry, decision);

    expect(result.trustLevel).toBe("probation");
    expect(result.trustScore).toBe(30);
    expect(result).not.toBe(entry); // new object
  });

  it("does not mutate the input entry", () => {
    const entry = makeEntry({ trustLevel: "probation", trustScore: 30 });
    const decision: TrustLifecycleDecision = {
      action: "upgrade_to_trusted",
      reason: "test",
      beforeTrustLevel: "probation",
      afterTrustLevel: "trusted",
    };
    applyTrustLifecycleDecision(entry, decision);

    expect(entry.trustLevel).toBe("probation");
    expect(entry.trustScore).toBe(30);
    expect(entry.promotedAt).toBeUndefined();
  });
});

describe("trust lifecycle CLI handlers", () => {
  beforeEach(() => {
    vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("process.exit"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handleTrustVerify errors on missing ID", async () => {
    const { handleTrustVerify } = await import("../core/memoryCommands.js");
    await expect(handleTrustVerify([])).rejects.toThrow("process.exit");
  });
});

describe("health report trust lifecycle integration", () => {
  it("includes trustUpgradeCandidateCount and trustDegradeCandidateCount", async () => {
    const { calculateMemoryHealth } = await import("../core/memoryHealth.js");
    const entries: DevMemoryEntry[] = [
      makeEntry({
        id: "upgrade-candidate",
        trustLevel: "probation",
        usageStats: { selectedCount: 5, successfulSelections: 4, rejectedSelections: 0 },
      }),
      makeEntry({
        id: "degrade-candidate",
        trustLevel: "trusted",
        usageStats: { selectedCount: 10, successfulSelections: 1, rejectedSelections: 5 },
      }),
      makeEntry({
        id: "normal",
        trustLevel: "probation",
        usageStats: { selectedCount: 1, successfulSelections: 0, rejectedSelections: 0 },
      }),
    ];

    const report = calculateMemoryHealth(entries);
    expect(report.stats.trustUpgradeCandidateCount).toBe(1);
    expect(report.stats.trustDegradeCandidateCount).toBe(1);
  });
});
