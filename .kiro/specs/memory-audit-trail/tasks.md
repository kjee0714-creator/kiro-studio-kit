# Tasks: Memory Audit Trail (Phase 4-E)

## 1. Core Audit Module

- [ ] 1.1 Create `src/core/memoryAuditLog.ts` with type definitions: `MemoryAuditEventType`, `MemoryAuditEvent`, `MemoryAuditActor`, constants `AUDIT_LOG_PATH`, `VALID_AUDIT_EVENT_TYPES`, `VALID_AUDIT_ACTORS`
- [ ] 1.2 Implement `appendMemoryAuditEvent` function that generates UUID via `crypto.randomUUID()`, sets ISO 8601 timestamp, and appends to JSONL using `appendJsonlRecord`
- [ ] 1.3 Implement `readMemoryAuditEvents` function that reads all events from the audit JSONL file, skipping invalid lines, returning empty array for missing file
- [ ] 1.4 Implement `findMemoryAuditEvents` function that filters events by memoryId and returns them in chronological order (oldest first)

## 2. Integration: Usage Persistence Audit

- [ ] 2.1 Modify `persistMemorySelections` in `memoryUsagePersistence.ts` to import `appendMemoryAuditEvent` from `memoryAuditLog.ts`
- [ ] 2.2 After each successful usage update in the loop, append a `usage_persist` audit event with actor "prompt_generator", memoryId, and before/after selectedCount and lastSelectedAt values
- [ ] 2.3 Wrap the audit call in try/catch so audit failure does not stop persistence

## 3. Integration: Usage Reset Audit

- [ ] 3.1 Modify `handleMemoryUsageReset` in `memoryCommands.ts` to capture the before state of usageStats before resetting
- [ ] 3.2 After the rewrite completes, append a `usage_reset` audit event with actor "cli", memoryId, and before/after usageStats objects
- [ ] 3.3 Wrap the audit call in try/catch so audit failure does not stop the reset operation

## 4. Integration: Capture Decision Audit

- [ ] 4.1 Modify `handleMemoryCapture` in `memoryCommands.ts` to import `appendMemoryAuditEvent`
- [ ] 4.2 In the --apply loop, after each entry is written to a store (active or pending), append a `capture_decision` audit event with actor "auto_capture", memoryId, and metadata containing decision status, totalScore, and kind
- [ ] 4.3 Wrap the audit call in try/catch so audit failure does not stop the capture operation

## 5. CLI: Audit Log Command

- [ ] 5.1 Implement `handleMemoryAuditLog(args: string[])` in `memoryCommands.ts` that reads audit events, reverses for newest-first, slices to --limit N (default 20), and displays timestamp, eventType, actor, memoryId
- [ ] 5.2 Handle empty/missing audit log with "📭 No audit events found." message

## 6. CLI: Audit Inspect Command

- [ ] 6.1 Implement `handleMemoryAuditInspect(args: string[])` in `memoryCommands.ts` that calls `findMemoryAuditEvents(memoryId)` and displays all matching events in chronological order with full details
- [ ] 6.2 Handle missing memoryId argument with error message and usage hint
- [ ] 6.3 Handle no matching events with "📭 No audit events found for {memoryId}." message

## 7. CLI Routing

- [ ] 7.1 Add `"audit"` case to the `handleMemory` switch in `memoryCommands.ts` that routes to `handleMemoryAuditLog` (for `audit log`) and `handleMemoryAuditInspect` (for `audit inspect`)
- [ ] 7.2 Add unknown audit subcommand error with usage hint

## 8. Public API Exports

- [ ] 8.1 Export `appendMemoryAuditEvent`, `readMemoryAuditEvents`, `findMemoryAuditEvents`, `AUDIT_LOG_PATH`, `VALID_AUDIT_EVENT_TYPES`, `VALID_AUDIT_ACTORS` from `src/index.ts`
- [ ] 8.2 Export types `MemoryAuditEvent`, `MemoryAuditEventType`, `MemoryAuditActor` from `src/index.ts`
- [ ] 8.3 Export `handleMemoryAuditLog`, `handleMemoryAuditInspect` from `src/index.ts`

## 9. Unit Tests

- [ ] 9.1 Create `src/__tests__/memoryAuditLog.test.ts` with test: `appendMemoryAuditEvent` creates event with UUID id and ISO timestamp
- [ ] 9.2 Test: `appendMemoryAuditEvent` writes to the specified audit path
- [ ] 9.3 Test: `readMemoryAuditEvents` returns all valid events from file
- [ ] 9.4 Test: `readMemoryAuditEvents` returns empty array for missing file
- [ ] 9.5 Test: `readMemoryAuditEvents` skips malformed lines
- [ ] 9.6 Test: `findMemoryAuditEvents` filters by memoryId correctly
- [ ] 9.7 Test: `findMemoryAuditEvents` returns empty array for unknown memoryId
- [ ] 9.8 Test: usage persistence integration creates audit events with before/after
- [ ] 9.9 Test: usage reset integration creates audit event with before/after
- [ ] 9.10 Test: capture decision integration creates audit events with metadata
- [ ] 9.11 Test: audit log CLI displays recent events newest-first with --limit support
- [ ] 9.12 Test: audit inspect CLI displays events for specific memoryId in chronological order
- [ ] 9.13 Test: audit failure does not stop persistence operation
- [ ] 9.14 Test: audit failure does not stop reset operation

## 10. Property-Based Tests

- [ ] 10.1 Create `src/__tests__/memoryAuditLog.property.test.ts` with property: after appending N events, reading returns all N in append order with existing events unchanged (100 runs)
- [ ] 10.2 Property: generated event IDs are unique across all appended events (100 runs)
- [ ] 10.3 Property: `findMemoryAuditEvents` returns only events matching the specified memoryId (100 runs)
- [ ] 10.4 Property: all usage_reset audit events contain both before and after fields (100 runs)
- [ ] 10.5 Property: unrelated memoryIds never appear in `findMemoryAuditEvents` results for a different ID (100 runs)

## 11. Quality Gates

- [ ] 11.1 Run `npm run typecheck` and verify zero errors
- [ ] 11.2 Run `npm run lint` and verify zero errors
- [ ] 11.3 Run `npm test` and verify all tests pass (existing 609 + new tests)
- [ ] 11.4 Run `npm run build` and verify successful compilation
