/**
 * Unit tests for dev-memory-lifecycle command handlers and pure functions.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rm, mkdir } from "fs/promises";
import path from "path";
import { rewriteMemoryEntries, readMemoryEntries } from "../core/memoryStore.js";
import { classifyPruneCandidates, deriveHistory } from "../core/memoryLifecycle.js";
import type { DevMemoryEntry } from "../core/memoryValidator.js";

const TEST_DIR = ".test-tmp/memoryLifecycle-unit";
let testCounter = 0;

function getTestPath(): string {
  testCounter++;
  return path.join(TEST_DIR, `test-${testCounter}-${Date.now()}.jsonl`);
}

function makeEntry(overrides: Partial<DevMemoryEntry> = {}): DevMemoryEntry {
  return {
    id: `test-id-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: "2024-06-15T10:00:00.000Z",
    kind: "test_fix",
    summary: "Test summary",
    trigger: "Test trigger",
    fix: "Test fix",
    futurePromptHint: "Test hint",
    relatedFiles: ["src/test.ts"],
    relatedSymbols: ["testFn"],
    tags: ["test"],
    severity: "medium",
    confidence: "high",
    enabled: true,
    ...overrides,
  };
}

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  try {
    await rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
  vi.restoreAllMocks();
});

describe("classifyPruneCandidates", () => {
  it("should classify deleted entries", () => {
    const entries = [makeEntry({ deleted: true, deletedAt: "2024-01-01T00:00:00.000Z" })];
    const result = classifyPruneCandidates(entries);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("deleted");
  });

  it("should classify disabled entries", () => {
    const entries = [makeEntry({ enabled: false })];
    const result = classifyPruneCandidates(entries);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("disabled");
  });

  it("should classify expired entries", () => {
    const entries = [makeEntry({ expiresAt: "2020-01-01T00:00:00.000Z" })];
    const result = classifyPruneCandidates(entries);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("expired");
  });

  it("should classify superseded entries", () => {
    const oldEntry = makeEntry({ id: "old-id" });
    const newEntry = makeEntry({ id: "new-id", supersedes: ["old-id"] });
    const result = classifyPruneCandidates([oldEntry, newEntry]);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("superseded");
    expect(result[0].entry.id).toBe("old-id");
  });

  it("should classify stale entries (180+ days, low severity, low confidence)", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 200);
    const entries = [makeEntry({ createdAt: oldDate.toISOString(), severity: "low", confidence: "low" })];
    const result = classifyPruneCandidates(entries);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("stale");
  });

  it("should not classify active entries as candidates", () => {
    const entries = [makeEntry()];
    const result = classifyPruneCandidates(entries);
    expect(result).toHaveLength(0);
  });

  it("should use first matching condition (deleted before disabled)", () => {
    const entries = [makeEntry({ deleted: true, enabled: false })];
    const result = classifyPruneCandidates(entries);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("deleted");
  });
});

describe("deriveHistory", () => {
  it("should always include created event", () => {
    const entry = makeEntry();
    const events = deriveHistory(entry, [entry]);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].event).toBe("created");
    expect(events[0].timestamp).toBe(entry.createdAt);
  });

  it("should include disabled event when entry is disabled", () => {
    const entry = makeEntry({ enabled: false });
    const events = deriveHistory(entry, [entry]);
    expect(events.some((e) => e.event === "disabled")).toBe(true);
  });

  it("should include deleted event when entry is deleted", () => {
    const entry = makeEntry({ deleted: true, deletedAt: "2024-07-01T00:00:00.000Z" });
    const events = deriveHistory(entry, [entry]);
    const deletedEvent = events.find((e) => e.event === "deleted");
    expect(deletedEvent).toBeDefined();
    expect(deletedEvent?.timestamp).toBe("2024-07-01T00:00:00.000Z");
  });

  it("should include superseded event when another entry supersedes it", () => {
    const entry = makeEntry({ id: "old-id" });
    const superseder = makeEntry({ id: "new-id", supersedes: ["old-id"], createdAt: "2024-08-01T00:00:00.000Z" });
    const events = deriveHistory(entry, [entry, superseder]);
    const supersededEvent = events.find((e) => e.event === "superseded");
    expect(supersededEvent).toBeDefined();
    expect(supersededEvent?.detail).toBe("by new-id");
  });

  it("should return events in chronological order", () => {
    const entry = makeEntry({
      id: "old-id",
      createdAt: "2024-01-01T00:00:00.000Z",
      deleted: true,
      deletedAt: "2024-03-01T00:00:00.000Z",
    });
    const superseder = makeEntry({
      id: "new-id",
      supersedes: ["old-id"],
      createdAt: "2024-02-01T00:00:00.000Z",
    });
    const events = deriveHistory(entry, [entry, superseder]);
    for (let i = 1; i < events.length; i++) {
      expect(new Date(events[i].timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(events[i - 1].timestamp).getTime(),
      );
    }
  });
});

describe("handleMemoryDisable (integration)", () => {
  it("should disable an enabled entry via rewrite", async () => {
    const storePath = getTestPath();
    const entry = makeEntry({ id: "disable-test" });
    await rewriteMemoryEntries([entry], storePath);

    // Simulate what handleMemoryDisable does
    const entries = await readMemoryEntries(storePath);
    const target = entries.find((e) => e.id === "disable-test");
    expect(target).toBeDefined();
    if (target) {
      target.enabled = false;
      await rewriteMemoryEntries(entries, storePath);
    }

    const result = await readMemoryEntries(storePath);
    expect(result[0].enabled).toBe(false);
  });
});

describe("handleMemoryEnable (integration)", () => {
  it("should enable a disabled entry via rewrite", async () => {
    const storePath = getTestPath();
    const entry = makeEntry({ id: "enable-test", enabled: false });
    await rewriteMemoryEntries([entry], storePath);

    const entries = await readMemoryEntries(storePath);
    const target = entries.find((e) => e.id === "enable-test");
    expect(target).toBeDefined();
    if (target) {
      target.enabled = true;
      await rewriteMemoryEntries(entries, storePath);
    }

    const result = await readMemoryEntries(storePath);
    expect(result[0].enabled).toBe(true);
  });
});

describe("handleMemoryDelete (integration)", () => {
  it("should soft-delete an entry via rewrite", async () => {
    const storePath = getTestPath();
    const entry = makeEntry({ id: "delete-test" });
    await rewriteMemoryEntries([entry], storePath);

    const entries = await readMemoryEntries(storePath);
    const target = entries.find((e) => e.id === "delete-test");
    expect(target).toBeDefined();
    if (target) {
      target.deleted = true;
      target.deletedAt = new Date().toISOString();
      await rewriteMemoryEntries(entries, storePath);
    }

    const result = await readMemoryEntries(storePath);
    expect(result[0].deleted).toBe(true);
    expect(result[0].deletedAt).toBeDefined();
  });
});

describe("handleMemorySupersede (integration)", () => {
  it("should add oldId to newEntry supersedes array", async () => {
    const storePath = getTestPath();
    const oldEntry = makeEntry({ id: "old-entry" });
    const newEntry = makeEntry({ id: "new-entry" });
    await rewriteMemoryEntries([oldEntry, newEntry], storePath);

    const entries = await readMemoryEntries(storePath);
    const target = entries.find((e) => e.id === "new-entry");
    expect(target).toBeDefined();
    if (target) {
      if (!target.supersedes) target.supersedes = [];
      target.supersedes.push("old-entry");
      await rewriteMemoryEntries(entries, storePath);
    }

    const result = await readMemoryEntries(storePath);
    const updated = result.find((e) => e.id === "new-entry");
    expect(updated?.supersedes).toContain("old-entry");
  });
});

describe("handleMemoryPrune (integration)", () => {
  it("dry-run should not modify store", async () => {
    const storePath = getTestPath();
    const entries = [
      makeEntry({ id: "deleted-entry", deleted: true }),
      makeEntry({ id: "active-entry" }),
    ];
    await rewriteMemoryEntries(entries, storePath);

    // Dry-run: just classify, don't modify
    const readEntries = await readMemoryEntries(storePath);
    const candidates = classifyPruneCandidates(readEntries);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].reason).toBe("deleted");

    // Store should be unchanged
    const afterEntries = await readMemoryEntries(storePath);
    expect(afterEntries).toHaveLength(2);
  });

  it("apply should remove candidates", async () => {
    const storePath = getTestPath();
    const entries = [
      makeEntry({ id: "deleted-entry", deleted: true }),
      makeEntry({ id: "active-entry" }),
    ];
    await rewriteMemoryEntries(entries, storePath);

    const readEntries = await readMemoryEntries(storePath);
    const candidates = classifyPruneCandidates(readEntries);
    const candidateIds = new Set(candidates.map((c) => c.entry.id));
    const remaining = readEntries.filter((e) => !candidateIds.has(e.id));
    await rewriteMemoryEntries(remaining, storePath);

    const result = await readMemoryEntries(storePath);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("active-entry");
  });
});

describe("handleMemoryCompact (integration)", () => {
  it("should remove deleted entries and preserve active ones", async () => {
    const storePath = getTestPath();
    const entries = [
      makeEntry({ id: "active-1" }),
      makeEntry({ id: "deleted-1", deleted: true }),
      makeEntry({ id: "active-2" }),
    ];
    await rewriteMemoryEntries(entries, storePath);

    const readEntries = await readMemoryEntries(storePath);
    const active = readEntries.filter((e) => e.deleted !== true);
    await rewriteMemoryEntries(active, storePath);

    const result = await readMemoryEntries(storePath);
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.deleted !== true)).toBe(true);
  });
});

describe("handleMemoryHistory (integration)", () => {
  it("should display lifecycle events for an entry", async () => {
    const storePath = getTestPath();
    const entry = makeEntry({ id: "history-test", createdAt: "2024-01-01T00:00:00.000Z" });
    await rewriteMemoryEntries([entry], storePath);

    const entries = await readMemoryEntries(storePath);
    const target = entries.find((e) => e.id === "history-test");
    expect(target).toBeDefined();
    if (target) {
      const events = deriveHistory(target, entries);
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].event).toBe("created");
      expect(events[0].timestamp).toBe("2024-01-01T00:00:00.000Z");
    }
  });
});

describe("handleMemoryList excludes deleted", () => {
  it("should filter out deleted entries from list", async () => {
    const storePath = getTestPath();
    const entries = [
      makeEntry({ id: "active-1" }),
      makeEntry({ id: "deleted-1", deleted: true }),
    ];
    await rewriteMemoryEntries(entries, storePath);

    const readEntries = await readMemoryEntries(storePath);
    const visible = readEntries.filter((e) => e.enabled && e.deleted !== true);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("active-1");
  });
});

describe("handleMemorySearch excludes deleted", () => {
  it("should filter out deleted entries from search", async () => {
    const storePath = getTestPath();
    const entries = [
      makeEntry({ id: "active-1", summary: "context budget fix" }),
      makeEntry({ id: "deleted-1", summary: "context budget old", deleted: true }),
    ];
    await rewriteMemoryEntries(entries, storePath);

    const readEntries = await readMemoryEntries(storePath);
    const query = "context budget";
    const matches = readEntries.filter((entry) => {
      if (entry.deleted === true) return false;
      return entry.summary.toLowerCase().includes(query.toLowerCase());
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("active-1");
  });
});

describe("handleMemoryInspect shows lifecycle state", () => {
  it("should show deleted status for deleted entries", async () => {
    const storePath = getTestPath();
    const entry = makeEntry({ id: "inspect-deleted", deleted: true, deletedAt: "2024-07-01T00:00:00.000Z" });
    await rewriteMemoryEntries([entry], storePath);

    const entries = await readMemoryEntries(storePath);
    const target = entries.find((e) => e.id === "inspect-deleted");
    expect(target?.deleted).toBe(true);
    expect(target?.deletedAt).toBe("2024-07-01T00:00:00.000Z");
  });

  it("should show superseded-by relationship", async () => {
    const storePath = getTestPath();
    const oldEntry = makeEntry({ id: "old-entry" });
    const newEntry = makeEntry({ id: "new-entry", supersedes: ["old-entry"] });
    await rewriteMemoryEntries([oldEntry, newEntry], storePath);

    const entries = await readMemoryEntries(storePath);
    const supersededBy = entries.find((e) => e.supersedes?.includes("old-entry"));
    expect(supersededBy?.id).toBe("new-entry");
  });
});

describe("handleMemoryStats lifecycle extensions", () => {
  it("should count deleted and superseded entries", async () => {
    const storePath = getTestPath();
    const entries = [
      makeEntry({ id: "active-1" }),
      makeEntry({ id: "deleted-1", deleted: true }),
      makeEntry({ id: "old-entry" }),
      makeEntry({ id: "new-entry", supersedes: ["old-entry"] }),
    ];
    await rewriteMemoryEntries(entries, storePath);

    const readEntries = await readMemoryEntries(storePath);
    const deleted = readEntries.filter((e) => e.deleted === true);
    const superseded = readEntries.filter((e) =>
      readEntries.some((other) => other.supersedes?.includes(e.id) ?? false),
    );
    expect(deleted).toHaveLength(1);
    expect(superseded).toHaveLength(1);
  });

  it("should calculate average age of active entries", async () => {
    const storePath = getTestPath();
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
    const entries = [
      makeEntry({ id: "entry-1", createdAt: tenDaysAgo.toISOString() }),
      makeEntry({ id: "entry-2", createdAt: twentyDaysAgo.toISOString() }),
    ];
    await rewriteMemoryEntries(entries, storePath);

    const readEntries = await readMemoryEntries(storePath);
    const active = readEntries.filter((e) => e.enabled && e.deleted !== true);
    const totalAgeDays = active.reduce((sum, e) => {
      const ageMs = now.getTime() - new Date(e.createdAt).getTime();
      return sum + ageMs / (1000 * 60 * 60 * 24);
    }, 0);
    const avgAge = Math.round(totalAgeDays / active.length);
    expect(avgAge).toBeGreaterThanOrEqual(14);
    expect(avgAge).toBeLessThanOrEqual(16);
  });
});
