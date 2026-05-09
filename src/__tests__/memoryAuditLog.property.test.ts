/**
 * memoryAuditLog.property.test.ts
 * Property-based tests for the Memory Audit Trail module (Phase 4-E).
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { mkdir, rm } from "fs/promises";
import { appendMemoryAuditEvent, readMemoryAuditEvents, findMemoryAuditEvents } from "../core/memoryAuditLog.js";
import type { MemoryAuditEventType, MemoryAuditActor } from "../core/memoryAuditLog.js";

// ---------------------------------------------------------------------------
// Test Infrastructure
// ---------------------------------------------------------------------------

const TEST_DIR = ".test-tmp/audit-log-property-" + process.pid + "-" + Date.now();
let testCounter = 0;

function getAuditPath(): string {
  testCounter++;
  return `${TEST_DIR}/audit-prop-${testCounter}.jsonl`;
}

// ---------------------------------------------------------------------------
// Arbitrary Generators
// ---------------------------------------------------------------------------

const arbEventType: fc.Arbitrary<MemoryAuditEventType> = fc.constantFrom(
  "capture", "capture_decision", "promote", "discard", "quarantine",
  "trust_update", "usage_persist", "usage_reset", "manual_update",
  "health_check", "feedback",
);

const arbActor: fc.Arbitrary<MemoryAuditActor> = fc.constantFrom(
  "system", "cli", "auto_capture", "prompt_generator", "user",
);

const arbMemoryId: fc.Arbitrary<string> = fc.uuid();

const arbEventInput = fc.record({
  eventType: arbEventType,
  actor: arbActor,
  memoryId: fc.option(arbMemoryId, { nil: undefined }),
  reason: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  source: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
});

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
  testCounter = 0;
});

afterEach(async () => {
  try { await rm(TEST_DIR, { recursive: true, force: true, maxRetries: 3 }); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("memoryAuditLog property tests", () => {
  it("Property 1: after appending N events, reading returns all N in append order with existing events unchanged", { timeout: 30000 }, async () => {
    /**
     * **Validates: Requirements 7.1**
     */
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbEventInput, { minLength: 1, maxLength: 10 }),
        async (eventInputs) => {
          const auditPath = getAuditPath();

          // Append all events
          const appended = [];
          for (const input of eventInputs) {
            const event = await appendMemoryAuditEvent(input, { auditPath });
            appended.push(event);
          }

          // Read back
          const read = await readMemoryAuditEvents({ auditPath });

          // Exactly N events
          expect(read).toHaveLength(eventInputs.length);

          // Order preserved and content unchanged
          for (let i = 0; i < appended.length; i++) {
            expect(read[i].id).toBe(appended[i].id);
            expect(read[i].timestamp).toBe(appended[i].timestamp);
            expect(read[i].eventType).toBe(appended[i].eventType);
            expect(read[i].actor).toBe(appended[i].actor);
            expect(read[i].memoryId).toBe(appended[i].memoryId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 2: generated event IDs are unique across all appended events", { timeout: 30000 }, async () => {
    /**
     * **Validates: Requirements 7.2**
     */
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbEventInput, { minLength: 2, maxLength: 15 }),
        async (eventInputs) => {
          const auditPath = getAuditPath();

          const ids: string[] = [];
          for (const input of eventInputs) {
            const event = await appendMemoryAuditEvent(input, { auditPath });
            ids.push(event.id);
          }

          // All IDs unique
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(ids.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 3: findMemoryAuditEvents returns only events matching the specified memoryId", { timeout: 30000 }, async () => {
    /**
     * **Validates: Requirements 7.3**
     */
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbEventInput, { minLength: 1, maxLength: 10 }),
        arbMemoryId,
        async (eventInputs, targetId) => {
          const auditPath = getAuditPath();

          // Append events, some with targetId, some without
          for (let i = 0; i < eventInputs.length; i++) {
            const input = i % 2 === 0
              ? { ...eventInputs[i], memoryId: targetId }
              : { ...eventInputs[i], memoryId: `other-${i}` };
            await appendMemoryAuditEvent(input, { auditPath });
          }

          const found = await findMemoryAuditEvents(targetId, { auditPath });

          // All returned events match the target ID
          for (const event of found) {
            expect(event.memoryId).toBe(targetId);
          }

          // Count matches expected
          const expectedCount = eventInputs.filter((_, i) => i % 2 === 0).length;
          expect(found).toHaveLength(expectedCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 4: all usage_reset audit events have before and after fields", { timeout: 30000 }, async () => {
    /**
     * **Validates: Requirements 7.4**
     */
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            selectedCount: fc.nat(100),
            successfulSelections: fc.nat(50),
            rejectedSelections: fc.nat(20),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        async (beforeStatsList) => {
          const auditPath = getAuditPath();

          for (const beforeStats of beforeStatsList) {
            await appendMemoryAuditEvent({
              eventType: "usage_reset",
              actor: "cli",
              memoryId: crypto.randomUUID(),
              before: beforeStats as unknown as Record<string, unknown>,
              after: { selectedCount: 0, successfulSelections: 0, rejectedSelections: 0 },
            }, { auditPath });
          }

          const events = await readMemoryAuditEvents({ auditPath });
          const resetEvents = events.filter(e => e.eventType === "usage_reset");

          expect(resetEvents).toHaveLength(beforeStatsList.length);
          for (const event of resetEvents) {
            expect(event.before).toBeDefined();
            expect(event.after).toBeDefined();
            expect(event.after).toEqual({ selectedCount: 0, successfulSelections: 0, rejectedSelections: 0 });
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 5: unrelated memoryIds never appear in findMemoryAuditEvents results for a different ID", async () => {
    /**
     * **Validates: Requirements 7.5**
     */
    await fc.assert(
      fc.asyncProperty(
        arbMemoryId,
        fc.array(arbMemoryId, { minLength: 1, maxLength: 5 }),
        async (targetId, otherIds) => {
          const auditPath = getAuditPath();

          // Ensure otherIds don't accidentally match targetId
          const filteredOtherIds = otherIds.filter(id => id !== targetId);
          if (filteredOtherIds.length === 0) return; // skip degenerate case

          // Append events with other IDs only
          for (const otherId of filteredOtherIds) {
            await appendMemoryAuditEvent({
              eventType: "usage_persist",
              actor: "prompt_generator",
              memoryId: otherId,
            }, { auditPath });
          }

          // Find for targetId should return nothing
          const found = await findMemoryAuditEvents(targetId, { auditPath });
          expect(found).toHaveLength(0);

          // None of the other IDs should appear in results for targetId
          for (const event of found) {
            expect(event.memoryId).toBe(targetId);
            expect(filteredOtherIds).not.toContain(event.memoryId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
