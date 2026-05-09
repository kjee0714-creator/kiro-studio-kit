# Requirements Document

## Introduction

Phase 4-F: Selection Feedback extends the Dev Memory system with explicit success/rejection feedback recording. After a memory entry is selected and injected into a prompt, the user can mark the selection as successful (the memory helped) or rejected (the memory was irrelevant or harmful). This feedback updates usage statistics, records audit events, integrates with health monitoring, and surfaces success rates in the CLI usage stats display.

## Glossary

- **Feedback_Recorder**: The pure-function module (`memoryTrust.ts`) that computes updated `DevMemoryEntry` objects with incremented feedback counters and timestamps
- **Feedback_Persister**: The persistence module (`memoryUsagePersistence.ts`) that reads the store, applies pure feedback functions, rewrites the store, and records audit events
- **Usage_Stats_Display**: The CLI handler that formats and outputs memory usage statistics including feedback metrics
- **Health_Monitor**: The pure-function health analysis module that computes diagnostic scores and findings from memory entries
- **Audit_Logger**: The append-only audit trail module that records structured lifecycle events to a JSONL file
- **CLI_Router**: The command-line interface routing layer that dispatches subcommands to appropriate handlers
- **DevMemoryEntry**: A single development memory record stored in the JSONL store
- **MemoryUsageStats**: The usage statistics sub-object within a DevMemoryEntry tracking selection and feedback counts
- **Success_Rate**: The ratio of successfulSelections to (successfulSelections + rejectedSelections), expressed as a value in [0, 1]

## Requirements

### Requirement 1: Record Successful Selection Feedback

**User Story:** As a developer, I want to mark a memory selection as successful, so that the system tracks which memories provide value and can prioritize them in future selections.

#### Acceptance Criteria

1. WHEN `recordMemorySelectionSuccess` is called with a DevMemoryEntry, THE Feedback_Recorder SHALL return a new DevMemoryEntry with `usageStats.successfulSelections` incremented by 1
2. WHEN `recordMemorySelectionSuccess` is called with a DevMemoryEntry, THE Feedback_Recorder SHALL update `usageStats.lastSuccessfulAt` to the provided timestamp in ISO 8601 format
3. WHEN `recordMemorySelectionSuccess` is called with a DevMemoryEntry, THE Feedback_Recorder SHALL preserve `usageStats.selectedCount` and `usageStats.rejectedSelections` unchanged
4. WHEN `recordMemorySelectionSuccess` is called with a DevMemoryEntry that has undefined usageStats, THE Feedback_Recorder SHALL initialize usageStats with selectedCount=0, successfulSelections=1, rejectedSelections=0, and set lastSuccessfulAt
5. THE Feedback_Recorder SHALL return a new object without mutating the input DevMemoryEntry
6. WHEN `markMemorySelectionSuccess` is called with a valid memory ID, THE Feedback_Persister SHALL read the store, apply the pure function, rewrite the store, and return `{ updatedId: id }`
7. WHEN `markMemorySelectionSuccess` is called with an ID that matches a deleted entry, THE Feedback_Persister SHALL return `{ error: "entry_deleted" }` without modifying the store
8. WHEN `markMemorySelectionSuccess` is called with an ID not found in the store, THE Feedback_Persister SHALL return `{ error: "not_found" }` without modifying the store
9. WHEN the user runs `ksk memory usage mark-success <id>`, THE CLI_Router SHALL invoke `markMemorySelectionSuccess` with the provided ID and optional reason

### Requirement 2: Record Rejected Selection Feedback

**User Story:** As a developer, I want to mark a memory selection as rejected, so that the system tracks which memories are unhelpful and can deprioritize them in future selections.

#### Acceptance Criteria

1. WHEN `recordMemorySelectionRejection` is called with a DevMemoryEntry, THE Feedback_Recorder SHALL return a new DevMemoryEntry with `usageStats.rejectedSelections` incremented by 1
2. WHEN `recordMemorySelectionRejection` is called with a DevMemoryEntry, THE Feedback_Recorder SHALL update `usageStats.lastRejectedAt` to the provided timestamp in ISO 8601 format
3. WHEN `recordMemorySelectionRejection` is called with a DevMemoryEntry, THE Feedback_Recorder SHALL preserve `usageStats.selectedCount` and `usageStats.successfulSelections` unchanged
4. WHEN `recordMemorySelectionRejection` is called with a DevMemoryEntry that has undefined usageStats, THE Feedback_Recorder SHALL initialize usageStats with selectedCount=0, successfulSelections=0, rejectedSelections=1, and set lastRejectedAt
5. THE Feedback_Recorder SHALL return a new object without mutating the input DevMemoryEntry
6. WHEN `markMemorySelectionRejected` is called with a valid memory ID, THE Feedback_Persister SHALL read the store, apply the pure function, rewrite the store, and return `{ updatedId: id }`
7. WHEN `markMemorySelectionRejected` is called with an ID that matches a deleted entry, THE Feedback_Persister SHALL return `{ error: "entry_deleted" }` without modifying the store
8. WHEN `markMemorySelectionRejected` is called with an ID not found in the store, THE Feedback_Persister SHALL return `{ error: "not_found" }` without modifying the store
9. WHEN `markMemorySelectionRejected` is called with an ID that matches a quarantined entry, THE Feedback_Persister SHALL allow the operation and return `{ updatedId: id }`
10. WHEN the user runs `ksk memory usage mark-rejected <id>`, THE CLI_Router SHALL invoke `markMemorySelectionRejected` with the provided ID and optional reason

### Requirement 3: Feedback Audit Events

**User Story:** As a developer, I want feedback actions to be recorded in the audit trail, so that I can trace the history of feedback decisions for any memory entry.

#### Acceptance Criteria

1. WHEN `markMemorySelectionSuccess` completes a store update, THE Feedback_Persister SHALL append an audit event with eventType "feedback" and metadata.feedback = "success"
2. WHEN `markMemorySelectionRejected` completes a store update, THE Feedback_Persister SHALL append an audit event with eventType "feedback" and metadata.feedback = "rejected"
3. THE Feedback_Persister SHALL include `before` and `after` fields in the audit event containing the usageStats object before and after the update
4. THE Feedback_Persister SHALL include the memory ID in the audit event `memoryId` field
5. IF the audit event append fails, THEN THE Feedback_Persister SHALL continue without error and return the successful persistence result
6. WHERE a reason option is provided, THE Feedback_Persister SHALL include the reason in the audit event `reason` field

### Requirement 4: Usage Stats Feedback Display

**User Story:** As a developer, I want to see feedback statistics in the usage stats display, so that I can understand the overall effectiveness of my memory entries.

#### Acceptance Criteria

1. WHEN the user runs `ksk memory usage stats`, THE Usage_Stats_Display SHALL show the total successfulSelections count across all active entries
2. WHEN the user runs `ksk memory usage stats`, THE Usage_Stats_Display SHALL show the total rejectedSelections count across all active entries
3. WHEN the user runs `ksk memory usage stats`, THE Usage_Stats_Display SHALL show the overall successRate as success/(success+rejected) rounded to 2 decimal places
4. WHEN the denominator (successfulSelections + rejectedSelections) is 0, THE Usage_Stats_Display SHALL show successRate as "n/a"

### Requirement 5: Health Feedback Integration

**User Story:** As a developer, I want the health monitor to track feedback patterns, so that I can identify memories with high rejection rates that may need attention.

#### Acceptance Criteria

1. WHEN `calculateMemoryHealth` is called, THE Health_Monitor SHALL include `feedbackRecordedCount` in the stats object representing the total number of entries with at least one feedback event (successfulSelections > 0 or rejectedSelections > 0)
2. WHEN `calculateMemoryHealth` is called, THE Health_Monitor SHALL include `highRejectionCount` in the stats object representing the number of active entries where rejectedSelections > successfulSelections and rejectedSelections >= 3
3. WHEN `highRejectionCount` is greater than 0, THE Health_Monitor SHALL emit a warning-severity finding of type "stale" with a message indicating the count of high-rejection entries

### Requirement 6: Schema Extension and Validation

**User Story:** As a developer, I want the `lastRejectedAt` field to be validated, so that the schema remains consistent and data integrity is maintained.

#### Acceptance Criteria

1. THE MemoryUsageStats interface SHALL include an optional `lastRejectedAt` field of type string
2. WHEN `validateDevMemoryEntry` is called with a usageStats object containing a non-string `lastRejectedAt`, THE Feedback_Recorder SHALL report a validation error
3. WHEN `validateDevMemoryEntry` is called with a usageStats object containing a valid string `lastRejectedAt`, THE Feedback_Recorder SHALL pass validation

### Requirement 7: Property-Based Tests

**User Story:** As a developer, I want property-based tests to verify feedback invariants, so that edge cases are caught across randomized inputs.

#### Acceptance Criteria

1. FOR ALL valid DevMemoryEntry inputs, `recordMemorySelectionSuccess` SHALL increment only `successfulSelections` by exactly 1 (property test, 100 runs)
2. FOR ALL valid DevMemoryEntry inputs, `recordMemorySelectionRejection` SHALL increment only `rejectedSelections` by exactly 1 (property test, 100 runs)
3. FOR ALL valid DevMemoryEntry inputs, `selectedCount` SHALL remain unchanged after either feedback function is applied (property test, 100 runs)
4. FOR ALL valid DevMemoryEntry inputs where (successfulSelections + rejectedSelections) > 0, the computed successRate SHALL be in the range [0, 1] (property test, 100 runs)
5. FOR ALL feedback audit events, the event SHALL contain both `before` and `after` usageStats fields with valid numeric counts (property test, 100 runs)
