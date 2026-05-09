# Requirements Document

## Introduction

This feature extends the existing pending memory operations in Kiro Studio Kit (KSK) with additional subcommands for inspecting, bulk-promoting, discarding, pruning, and reporting statistics on pending memory entries. It also integrates audit trail events for promote, discard, and prune operations. Property-based tests ensure correctness invariants hold across all operations.

## Glossary

- **Pending_Store**: The JSONL file at `.kiro/ksk/dev-memory.pending.jsonl` containing quarantined memory entries awaiting promotion
- **Active_Store**: The JSONL file at `.kiro/ksk/dev-memory.jsonl` containing promoted, active memory entries
- **Pending_Entry**: A DevMemoryEntry in the Pending_Store where `deleted !== true`
- **CLI**: The `kiro-studio-kit` command-line interface
- **Audit_Log**: The append-only JSONL file at `.kiro/ksk/dev-memory-audit.jsonl` recording lifecycle events
- **Prune_Threshold**: The number of days (default 30) after which a pending entry is considered old

## Requirements

### Requirement 1: Pending Listing and Inspection

**User Story:** As a developer, I want to inspect a single pending entry in detail, so that I can make an informed decision about whether to promote or discard it.

#### Acceptance Criteria

1. WHEN the `pending inspect <id>` command is invoked with a valid pending entry ID, THE CLI SHALL display the full details of the pending entry including id, kind, summary, trigger, fix, futurePromptHint, createdAt, captureStatus, trustLevel, authority, captureAssessment scores, and tags
2. WHEN the `pending inspect <id>` command is invoked with an ID that does not exist in the Pending_Store, THE CLI SHALL print an error message and exit with code 1
3. WHEN the `pending inspect <id>` command is invoked with an ID of a deleted pending entry, THE CLI SHALL print an error message indicating the entry is deleted and exit with code 1

### Requirement 2: Promote Pending Memory (Single with Audit)

**User Story:** As a developer, I want the existing single promote operation to record an audit event, so that I have a traceable history of promotion decisions.

#### Acceptance Criteria

1. WHEN a pending entry is promoted via `pending promote <id>`, THE CLI SHALL record an audit event with eventType "promote", actor "cli", and memoryId set to the promoted entry ID
2. WHEN the audit event recording fails during promotion, THE CLI SHALL complete the promotion successfully without blocking on the audit failure
3. WHEN a pending entry is promoted, THE CLI SHALL set captureStatus to "active", enabled to true, trustLevel to "probation", authority to "hint", and promotedAt to the current ISO timestamp

### Requirement 3: Promote All Pending Memories

**User Story:** As a developer, I want to promote all pending entries at once, so that I can quickly accept a batch of quarantined memories.

#### Acceptance Criteria

1. WHEN the `pending promote --all` command is invoked, THE CLI SHALL promote all non-deleted pending entries to the Active_Store
2. WHEN the `pending promote --all` command is invoked, THE CLI SHALL set captureStatus to "active", enabled to true, trustLevel to "probation", authority to "hint", and promotedAt to the current ISO timestamp on each promoted entry
3. WHEN the `pending promote --all` command is invoked, THE CLI SHALL record one audit event per promoted entry with eventType "promote" and actor "cli"
4. WHEN the `pending promote --all` command is invoked with zero non-deleted pending entries, THE CLI SHALL print a message indicating no entries to promote and exit with code 0
5. WHEN the `pending promote --all` command completes, THE CLI SHALL print the count of promoted entries

### Requirement 4: Discard Pending Memory

**User Story:** As a developer, I want to discard a pending entry without physically deleting it, so that I can reject low-quality captures while preserving audit history.

#### Acceptance Criteria

1. WHEN the `pending discard <id>` command is invoked with a valid pending entry ID, THE CLI SHALL set captureStatus to "discarded" on the entry and rewrite the Pending_Store
2. WHEN the `pending discard <id>` command is invoked, THE CLI SHALL record an audit event with eventType "discard", actor "cli", and memoryId set to the discarded entry ID
3. WHEN the `pending discard <id>` command is invoked with an ID that does not exist in the Pending_Store, THE CLI SHALL print an error message and exit with code 1
4. WHEN the `pending discard <id>` command is invoked with an ID of a deleted pending entry, THE CLI SHALL print an error message and exit with code 1
5. WHEN the audit event recording fails during discard, THE CLI SHALL complete the discard operation successfully without blocking on the audit failure

### Requirement 5: Prune Old Pending Memories

**User Story:** As a developer, I want to automatically discard old pending entries, so that the pending store does not accumulate stale quarantined memories indefinitely.

#### Acceptance Criteria

1. WHEN the `pending prune` command is invoked, THE CLI SHALL identify all non-deleted pending entries older than the Prune_Threshold (default 30 days)
2. WHEN the `pending prune` command is invoked without `--dry-run`, THE CLI SHALL set captureStatus to "discarded" on all identified entries and rewrite the Pending_Store
3. WHEN the `pending prune --dry-run` command is invoked, THE CLI SHALL display the list of entries that would be discarded without modifying the Pending_Store
4. WHERE the `--older-than-days N` option is provided, THE CLI SHALL use N as the Prune_Threshold instead of the default 30 days
5. WHEN the `pending prune` command discards entries, THE CLI SHALL record one audit event per discarded entry with eventType "discard" and actor "cli"
6. WHEN no entries match the Prune_Threshold, THE CLI SHALL print a message indicating zero candidates and exit with code 0

### Requirement 6: Pending Stats

**User Story:** As a developer, I want to see statistics about my pending store, so that I can understand the volume and age distribution of quarantined entries.

#### Acceptance Criteria

1. WHEN the `pending stats` command is invoked, THE CLI SHALL display the total count of non-deleted pending entries (pendingCount)
2. WHEN the `pending stats` command is invoked, THE CLI SHALL display the count of pending entries older than 30 days (oldPendingCount)
3. WHEN the `pending stats` command is invoked, THE CLI SHALL display the createdAt timestamp of the oldest pending entry (oldestPendingAt)
4. WHEN the `pending stats` command is invoked with zero pending entries, THE CLI SHALL display pendingCount as 0 and omit oldestPendingAt

### Requirement 7: Property-Based Tests

**User Story:** As a developer, I want property-based tests covering pending operations, so that correctness invariants are verified across randomized inputs.

#### Acceptance Criteria

1. FOR ALL arrays of DevMemoryEntry where some entries have `deleted === true`, THE promotePendingMemory function SHALL only modify entries where `deleted !== true`
2. FOR ALL arrays of DevMemoryEntry where some entries have `deleted === true`, THE discardPendingMemory function SHALL only modify entries where `deleted !== true`
3. FOR ALL arrays of DevMemoryEntry, promote and discard operations SHALL never modify entries where `deleted === true`
4. FOR ALL arrays of DevMemoryEntry, THE prune operation in dry-run mode SHALL return the same Pending_Store contents as before invocation
5. FOR ALL arrays of non-deleted DevMemoryEntry, THE promoteAll operation SHALL return an updatedIds count equal to the number of non-deleted pending entries in the input
