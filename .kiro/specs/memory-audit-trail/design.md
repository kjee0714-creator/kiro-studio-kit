# Design Document: Memory Audit Trail (Phase 4-E)

## Overview

This design introduces an append-only audit log for the Dev Memory system. The audit log records structured events for every significant memory lifecycle action, stored as JSONL using the existing `appendJsonlRecord` and `readJsonlFile` infrastructure. Integration points are designed so that audit failures never block the primary operation.

## Architecture

### New Module: `src/core/memoryAuditLog.ts`

A standalone module with no circular dependencies. It imports only from `jsonlLogger.ts` and `crypto`.

### Data Flow

```
Memory Operation (persistence/reset/capture)
  → appendMemoryAuditEvent(event)
    → generates UUID + ISO timestamp
    → calls appendJsonlRecord to JSONL file
    → returns complete MemoryAuditEvent

CLI (audit log / audit inspect)
  → readMemoryAuditEvents() / findMemoryAuditEvents(memoryId)
    → calls readJsonlFile
    → filters/sorts results
    → displays to stdout
```

### Integration Strategy

All integration points wrap audit calls in try/catch to ensure audit failures are non-blocking:

```typescript
try {
  await appendMemoryAuditEvent({ ... });
} catch {
  // Audit failure must not stop the primary operation
}
```

## Type Definitions

```typescript
// src/core/memoryAuditLog.ts

export type MemoryAuditEventType =
  | "capture"
  | "capture_decision"
  | "promote"
  | "discard"
  | "quarantine"
  | "trust_update"
  | "usage_persist"
  | "usage_reset"
  | "manual_update"
  | "health_check"
  | "feedback";

export interface MemoryAuditEvent {
  id: string;                          // UUID v4
  memoryId?: string;                   // related memory entry ID (optional)
  timestamp: string;                   // ISO 8601
  eventType: MemoryAuditEventType;
  actor: "system" | "cli" | "auto_capture" | "prompt_generator" | "user";
  source?: string;                     // originating module/function
  reason?: string;                     // human-readable reason
  before?: Record<string, unknown>;    // state before change
  after?: Record<string, unknown>;     // state after change
  metadata?: Record<string, unknown>;  // additional context
}

export const AUDIT_LOG_PATH = ".kiro/ksk/dev-memory-audit.jsonl";

export const VALID_AUDIT_EVENT_TYPES: readonly MemoryAuditEventType[] = [
  "capture", "capture_decision", "promote", "discard", "quarantine",
  "trust_update", "usage_persist", "usage_reset", "manual_update",
  "health_check", "feedback",
] as const;

export const VALID_AUDIT_ACTORS = [
  "system", "cli", "auto_capture", "prompt_generator", "user",
] as const;

export type MemoryAuditActor = typeof VALID_AUDIT_ACTORS[number];
```

## Function Signatures

### `appendMemoryAuditEvent`

```typescript
/**
 * Append a new audit event to the audit log.
 * Generates UUID and timestamp automatically.
 * Uses appendJsonlRecord from jsonlLogger.ts.
 */
export async function appendMemoryAuditEvent(
  event: Omit<MemoryAuditEvent, "id" | "timestamp">,
  options?: { auditPath?: string; now?: Date }
): Promise<MemoryAuditEvent>;
```

**Implementation:**
1. Generate `id` via `crypto.randomUUID()`
2. Generate `timestamp` via `(options?.now ?? new Date()).toISOString()`
3. Construct full `MemoryAuditEvent` object
4. Call `appendJsonlRecord(auditPath, fullEvent, "AuditLog")`
5. Return the full event

### `readMemoryAuditEvents`

```typescript
/**
 * Read all audit events from the log file.
 * Returns empty array if file does not exist.
 * Skips malformed lines.
 */
export async function readMemoryAuditEvents(
  options?: { auditPath?: string }
): Promise<MemoryAuditEvent[]>;
```

**Implementation:**
1. Call `readJsonlFile<MemoryAuditEvent>(auditPath)`
2. Filter to only valid events (has id, timestamp, eventType, actor)
3. Return array

### `findMemoryAuditEvents`

```typescript
/**
 * Find all audit events for a specific memory entry ID.
 * Returns events in chronological order (oldest first).
 */
export async function findMemoryAuditEvents(
  memoryId: string,
  options?: { auditPath?: string }
): Promise<MemoryAuditEvent[]>;
```

**Implementation:**
1. Call `readMemoryAuditEvents(options)`
2. Filter where `event.memoryId === memoryId`
3. Sort by timestamp ascending
4. Return filtered array

## Integration Points

### 1. Usage Persistence (`memoryUsagePersistence.ts`)

**Location:** Inside the `for` loop of `persistMemorySelections`, after each successful `recordMemorySelection` call.

```typescript
// After: storeEntries[storeIndex] = updated;
// After: result.updatedIds.push(selected.id);
try {
  await appendMemoryAuditEvent({
    eventType: "usage_persist",
    actor: "prompt_generator",
    memoryId: selected.id,
    source: "memoryUsagePersistence.persistMemorySelections",
    before: {
      selectedCount: storeEntry.usageStats?.selectedCount ?? 0,
      lastSelectedAt: storeEntry.usageStats?.lastSelectedAt ?? null,
    },
    after: {
      selectedCount: updated.usageStats?.selectedCount ?? 0,
      lastSelectedAt: updated.usageStats?.lastSelectedAt ?? null,
    },
  });
} catch {
  // Audit failure must not stop persistence
}
```

### 2. Usage Reset (`memoryCommands.ts` → `handleMemoryUsageReset`)

**Location:** After the `rewriteMemoryEntries` call, before the success log.

```typescript
// Capture before state before reset
const beforeStats = { ...entry.usageStats };

// ... existing reset logic ...

try {
  await appendMemoryAuditEvent({
    eventType: "usage_reset",
    actor: "cli",
    memoryId: id,
    source: "memoryCommands.handleMemoryUsageReset",
    before: beforeStats ?? { selectedCount: 0, successfulSelections: 0, rejectedSelections: 0 },
    after: { selectedCount: 0, successfulSelections: 0, rejectedSelections: 0 },
  });
} catch {
  // Audit failure must not stop reset
}
```

### 3. Capture Decision (`memoryCommands.ts` → `handleMemoryCapture`)

**Location:** Inside the apply-mode loop, after each entry is written to a store.

```typescript
try {
  await appendMemoryAuditEvent({
    eventType: "capture_decision",
    actor: "auto_capture",
    memoryId: entry.id,
    source: "memoryCommands.handleMemoryCapture",
    metadata: {
      decision: decision.status,
      totalScore: assessment.totalScore,
      kind: candidate.kind,
      isDuplicate: !!duplicate,
    },
  });
} catch {
  // Audit failure must not stop capture
}
```

## CLI Commands

### Route: `ksk memory audit log [--limit N]`

**Handler:** `handleMemoryAuditLog(args: string[])`

**Behavior:**
1. Parse `--limit N` (default 20)
2. Call `readMemoryAuditEvents()`
3. Reverse array (newest first)
4. Slice to limit
5. Display each event: `{timestamp} [{eventType}] actor={actor} memoryId={memoryId ?? "-"}`
6. If empty: `"📭 No audit events found."`

### Route: `ksk memory audit inspect <memoryId>`

**Handler:** `handleMemoryAuditInspect(args: string[])`

**Behavior:**
1. Parse memoryId from args[0]
2. Call `findMemoryAuditEvents(memoryId)`
3. Display events in chronological order with full details (before/after, metadata, reason)
4. If empty: `"📭 No audit events found for {memoryId}."`

### CLI Routing

Add to `handleMemory` switch in `memoryCommands.ts`:

```typescript
case "audit": {
  const auditSub = args[1];
  if (auditSub === "log") {
    await handleMemoryAuditLog(args.slice(2));
  } else if (auditSub === "inspect") {
    await handleMemoryAuditInspect(args.slice(2));
  } else {
    console.error('Usage: ksk memory audit log [--limit N] | inspect <memoryId>');
    process.exit(1);
  }
  break;
}
```

## Storage Details

- **Path:** `.kiro/ksk/dev-memory-audit.jsonl`
- **Format:** One JSON object per line, newline-terminated
- **Append-only:** No rewrite or delete operations on this file
- **Reuses:** `appendJsonlRecord` for writes, `readJsonlFile` for reads
- **Directory creation:** Handled by `appendJsonlRecord` (creates parent dirs)

## Validation

Minimal validation on read — events must have:
- `id`: non-empty string
- `timestamp`: non-empty string
- `eventType`: one of `VALID_AUDIT_EVENT_TYPES`
- `actor`: one of `VALID_AUDIT_ACTORS`

Invalid lines are skipped (consistent with existing JSONL patterns in the project).

## Error Handling

- All integration points wrap audit calls in try/catch
- Audit failures log to stderr (optional) but never throw to callers
- The audit module itself throws on write failure (callers decide whether to catch)
- Read operations return empty arrays for missing files (via `readJsonlFile` behavior)

## Testing Strategy

### Property-Based Tests (5 properties, 100 runs each)

1. **Append-only ordering:** After appending N events, reading returns all N in order, existing events unchanged
2. **Unique IDs:** Generated event IDs are unique across all appended events
3. **findByMemoryId correctness:** findMemoryAuditEvents returns only events matching the specified memoryId
4. **usage_reset has before/after:** All usage_reset events contain both before and after fields
5. **Unrelated IDs excluded:** Unrelated memoryIds never appear in inspect results for a different ID

### Unit Tests (10+)

1. `appendMemoryAuditEvent` creates event with UUID and ISO timestamp
2. `appendMemoryAuditEvent` writes to correct file path
3. `readMemoryAuditEvents` returns all events from file
4. `readMemoryAuditEvents` returns empty array for missing file
5. `readMemoryAuditEvents` skips malformed lines
6. `findMemoryAuditEvents` filters by memoryId
7. `findMemoryAuditEvents` returns empty for unknown memoryId
8. Usage persistence creates audit events with before/after
9. Usage reset creates audit event with before/after
10. Capture decision creates audit events with metadata
11. Audit log CLI displays recent events (newest first)
12. Audit inspect CLI displays events for specific memory (chronological)
13. Audit failure does not stop persistence operation
14. Audit failure does not stop reset operation

## Public API Exports

Add to `src/index.ts`:

```typescript
// Memory Audit Trail (Phase 4-E)
export { appendMemoryAuditEvent, readMemoryAuditEvents, findMemoryAuditEvents, AUDIT_LOG_PATH, VALID_AUDIT_EVENT_TYPES, VALID_AUDIT_ACTORS } from "./core/memoryAuditLog.js";
export type { MemoryAuditEvent, MemoryAuditEventType, MemoryAuditActor } from "./core/memoryAuditLog.js";
export { handleMemoryAuditLog, handleMemoryAuditInspect } from "./core/memoryCommands.js";
```

## File Changes Summary

| File | Change |
|------|--------|
| `src/core/memoryAuditLog.ts` | New module — types, append, read, find |
| `src/core/memoryUsagePersistence.ts` | Add audit event after each usage update |
| `src/core/memoryCommands.ts` | Add audit event in reset/capture, add audit CLI handlers, add routing |
| `src/index.ts` | Export new public API |
| `src/__tests__/memoryAuditLog.test.ts` | Unit tests |
| `src/__tests__/memoryAuditLog.property.test.ts` | Property-based tests |
