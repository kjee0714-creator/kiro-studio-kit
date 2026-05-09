/**
 * memoryDecay.test.ts
 * Unit tests for memory decay / expiry (Phase 4-N).
 */

import { describe, it, expect } from "vitest";
import type { DevMemoryEntry } from "../core/memoryValidator.js";
import { isExpiredMemory, isStaleMemory, isReviewDueMemory, getMemoryDecayStatus } from "../core/memoryDecay.js";
import { applyMemoryInjectionPolicy } from "../core/memoryInjectionPolicy.js";

function makeEntry(overrides: Partial<DevMemoryEntry> = {}): DevMemoryEntry {
  return {
    id: overrides.id ?? "test-id-1",
    createdAt: "2024-01-01T00:00:00.000Z",
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
    ...overrides,
  };
}

describe("isExpiredMemory", () => {
  it("returns true when expiresAt is in the past", () => {
    expect(isExpiredMemory(makeEntry({ expiresAt: "2020-01-01T00:00:00.000Z" }))).toBe(true);
  });
  it("returns false when expiresAt is in the future", () => {
    expect(isExpiredMemory(makeEntry({ expiresAt: "2099-01-01T00:00:00.000Z" }))).toBe(false);
  });
  it("returns false when expiresAt is not set", () => {
    expect(isExpiredMemory(makeEntry())).toBe(false);
  });
  it("returns false when expiresAt is invalid date", () => {
    expect(isExpiredMemory(makeEntry({ expiresAt: "not-a-date" }))).toBe(false);
  });
});

describe("isStaleMemory", () => {
  const now = new Date("2024-06-01T00:00:00.000Z");

  it("returns true when entry is older than defaultStaleAfterDays", () => {
    const entry = makeEntry({ createdAt: "2024-01-01T00:00:00.000Z" }); // 152 days old
    expect(isStaleMemory(entry, { now, defaultStaleAfterDays: 90 })).toBe(true);
  });

  it("returns false when entry is newer than defaultStaleAfterDays", () => {
    const entry = makeEntry({ createdAt: "2024-05-01T00:00:00.000Z" }); // 31 days old
    expect(isStaleMemory(entry, { now, defaultStaleAfterDays: 90 })).toBe(false);
  });

  it("uses lastReviewedAt over createdAt", () => {
    const entry = makeEntry({ createdAt: "2020-01-01T00:00:00.000Z", lastReviewedAt: "2024-05-15T00:00:00.000Z" });
    expect(isStaleMemory(entry, { now, defaultStaleAfterDays: 90 })).toBe(false);
  });

  it("uses entry staleAfterDays over default", () => {
    const entry = makeEntry({ createdAt: "2024-05-01T00:00:00.000Z", staleAfterDays: 20 });
    expect(isStaleMemory(entry, { now, defaultStaleAfterDays: 90 })).toBe(true); // 31 > 20
  });
});

describe("isReviewDueMemory", () => {
  it("returns true for expired entry", () => {
    expect(isReviewDueMemory(makeEntry({ expiresAt: "2020-01-01T00:00:00.000Z" }))).toBe(true);
  });

  it("returns true for stale entry", () => {
    const now = new Date("2024-06-01T00:00:00.000Z");
    expect(isReviewDueMemory(makeEntry({ createdAt: "2024-01-01T00:00:00.000Z" }), { now, defaultStaleAfterDays: 90 })).toBe(true);
  });

  it("returns true for temporary without expiresAt", () => {
    expect(isReviewDueMemory(makeEntry({ scope: "temporary" }))).toBe(true);
  });

  it("returns false for fresh entry", () => {
    const now = new Date("2024-01-15T00:00:00.000Z");
    expect(isReviewDueMemory(makeEntry({ createdAt: "2024-01-01T00:00:00.000Z" }), { now, defaultStaleAfterDays: 90 })).toBe(false);
  });
});

describe("getMemoryDecayStatus", () => {
  it("returns expired status", () => {
    const status = getMemoryDecayStatus(makeEntry({ expiresAt: "2020-01-01T00:00:00.000Z" }));
    expect(status.expired).toBe(true);
    expect(status.reason).toContain("Expired");
  });

  it("returns OK for fresh entry", () => {
    const now = new Date("2024-01-15T00:00:00.000Z");
    const status = getMemoryDecayStatus(makeEntry({ createdAt: "2024-01-01T00:00:00.000Z" }), { now, defaultStaleAfterDays: 90 });
    expect(status.expired).toBe(false);
    expect(status.stale).toBe(false);
    expect(status.reason).toBe("OK");
  });
});

describe("injection policy expired handling", () => {
  it("excludes expired entries", () => {
    const entries = [
      makeEntry({ id: "expired", trustLevel: "trusted", expiresAt: "2020-01-01T00:00:00.000Z" }),
      makeEntry({ id: "valid", trustLevel: "trusted" }),
    ];
    const result = applyMemoryInjectionPolicy(entries, { maxTotalEntries: 10, maxProbationEntries: 10 });
    expect(result.selectedEntries.map(e => e.id)).toEqual(["valid"]);
    expect(result.stats.expiredExcludedCount).toBe(1);
  });

  it("does not exclude stale entries", () => {
    const entries = [
      makeEntry({ id: "stale", trustLevel: "trusted", createdAt: "2020-01-01T00:00:00.000Z" }),
      makeEntry({ id: "fresh", trustLevel: "trusted" }),
    ];
    const result = applyMemoryInjectionPolicy(entries, { maxTotalEntries: 10, maxProbationEntries: 10 });
    expect(result.selectedEntries.map(e => e.id)).toContain("stale");
  });

  it("does not exclude entries without expiresAt", () => {
    const entries = [makeEntry({ id: "a", trustLevel: "trusted" })];
    const result = applyMemoryInjectionPolicy(entries, { maxTotalEntries: 10, maxProbationEntries: 10 });
    expect(result.selectedEntries).toHaveLength(1);
    expect(result.stats.expiredExcludedCount).toBe(0);
  });
});

describe("validator schema extension", () => {
  it("accepts entries with lastReviewedAt string", async () => {
    const { validateDevMemoryEntry } = await import("../core/memoryValidator.js");
    expect(validateDevMemoryEntry(makeEntry({ lastReviewedAt: "2024-01-01T00:00:00.000Z" }) as unknown).success).toBe(true);
  });

  it("rejects entries with lastReviewedAt non-string", async () => {
    const { validateDevMemoryEntry } = await import("../core/memoryValidator.js");
    const entry = { ...makeEntry(), lastReviewedAt: 123 };
    expect(validateDevMemoryEntry(entry as unknown).success).toBe(false);
  });

  it("accepts entries with staleAfterDays number", async () => {
    const { validateDevMemoryEntry } = await import("../core/memoryValidator.js");
    expect(validateDevMemoryEntry(makeEntry({ staleAfterDays: 30 }) as unknown).success).toBe(true);
  });

  it("rejects entries with staleAfterDays negative", async () => {
    const { validateDevMemoryEntry } = await import("../core/memoryValidator.js");
    const entry = { ...makeEntry(), staleAfterDays: -1 };
    expect(validateDevMemoryEntry(entry as unknown).success).toBe(false);
  });
});
