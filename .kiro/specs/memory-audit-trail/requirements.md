# Requirements Document

## Introduction

Phase 4-E adds an append-only audit trail to the Dev Memory system. Every significant memory lifecycle event (capture, promote, discard, usage persistence, usage reset, trust updates, etc.) is recorded as a structured JSONL event. This provides full traceability of memory state changes, supports debugging, and enables CLI inspection of the audit history for any memory entry.

## Glossary

- **Audit_Log**: The append-only JSONL file at `.kiro/ksk/dev-memory-audit.jsonl` that stores all audit events
- **Audit_Event**: A single structured record in the Audit_Log representing one memory lifecycle action
- **Memory_Entry**: A DevMemoryEntry stored in the Dev Memory JSONL store
- **CLI**: The `kiro-studio-kit` command-line interface binary
- **Actor**: The subsystem or user that triggered the audit event (system, cli, auto_capture, prompt_generator, user)
- **Event_Type**: One of the defined audit event categories (capture, capture_decision, promote, discard, quarantine, trust_update, usage_persist, usage_reset, manual_update, health_check, feedback)

## Requirements

### Requirement 1: Append-Only Audit Event Storage

**User Story:** As a developer, I want all memory lifecycle events recorded in an append-only log, so that I have a complete, tamper-evident history of memory state changes.

#### Acceptance Criteria

1. WHEN an audit event is appended, THE Audit_Log SHALL write a single JSONL line containing id (UUID), timestamp (ISO 8601), eventType, and actor fields
2. THE Audit_Log SHALL never overwrite or delete existing event lines
3. WHEN the Audit_Log file does not exist, THE Audit_Log SHALL create the file and parent directories before appending
4. WHEN an audit event is appended, THE Audit_Log SHALL generate a unique UUID for the id field
5. WHEN an audit event is appended, THE Audit_Log SHALL set the timestamp field to the current time in ISO 8601 format
6. IF the Audit_Log write fails, THEN THE Audit_Log SHALL throw an error without corrupting existing events

### Requirement 2: Usage Persistence Audit Events

**User Story:** As a developer, I want usage persistence operations recorded in the audit trail, so that I can trace when and how memory usage stats changed.

#### Acceptance Criteria

1. WHEN persistMemorySelections updates a memory entry's usage stats, THE Audit_Log SHALL receive a usage_persist event with the memoryId of the updated entry
2. WHEN a usage_persist event is recorded, THE Audit_Log SHALL include before and after fields showing the previous and new selectedCount and lastSelectedAt values
3. WHEN a usage_persist event is recorded, THE Audit_Log SHALL set actor to "prompt_generator"
4. IF the audit event write fails during usage persistence, THEN THE Audit_Log failure SHALL NOT prevent the persistence operation from completing

### Requirement 3: Usage Reset Audit Events

**User Story:** As a developer, I want usage reset operations recorded in the audit trail, so that I can see when stats were manually cleared.

#### Acceptance Criteria

1. WHEN handleMemoryUsageReset completes a reset, THE Audit_Log SHALL receive a usage_reset event with the memoryId of the reset entry
2. WHEN a usage_reset event is recorded, THE Audit_Log SHALL include before and after fields showing the previous and new usageStats objects
3. WHEN a usage_reset event is recorded, THE Audit_Log SHALL set actor to "cli"
4. IF the audit event write fails during usage reset, THEN THE Audit_Log failure SHALL NOT prevent the reset operation from completing

### Requirement 4: Capture Decision Audit Events

**User Story:** As a developer, I want capture decisions recorded in the audit trail, so that I can review why candidates were accepted, quarantined, or discarded.

#### Acceptance Criteria

1. WHEN handleMemoryCapture runs with --apply, THE Audit_Log SHALL receive a capture_decision event for each processed candidate
2. WHEN a capture_decision event is recorded, THE Audit_Log SHALL include metadata containing the decision status, assessment totalScore, and candidate kind
3. WHEN a capture_decision event is recorded for a new entry, THE Audit_Log SHALL set memoryId to the newly assigned entry ID
4. WHEN a capture_decision event is recorded, THE Audit_Log SHALL set actor to "auto_capture"
5. IF the audit event write fails during capture, THEN THE Audit_Log failure SHALL NOT prevent the capture operation from completing

### Requirement 5: Audit CLI Log Command

**User Story:** As a developer, I want to view recent audit events from the command line, so that I can quickly check what happened to the memory system.

#### Acceptance Criteria

1. WHEN the user runs `ksk memory audit log`, THE CLI SHALL display the 20 most recent audit events in reverse chronological order
2. WHEN the user runs `ksk memory audit log --limit N`, THE CLI SHALL display the N most recent audit events in reverse chronological order
3. WHEN the Audit_Log is empty or missing, THE CLI SHALL display a message indicating no audit events exist
4. THE CLI SHALL display each event showing timestamp, eventType, actor, and memoryId (if present)

### Requirement 6: Audit CLI Inspect Command

**User Story:** As a developer, I want to view all audit events for a specific memory entry, so that I can trace the full history of that entry.

#### Acceptance Criteria

1. WHEN the user runs `ksk memory audit inspect <memoryId>`, THE CLI SHALL display all audit events where the memoryId field matches the specified ID
2. WHEN no audit events match the specified memoryId, THE CLI SHALL display a message indicating no events were found
3. THE CLI SHALL display matching events in chronological order (oldest first)

### Requirement 7: Property-Based Test Coverage

**User Story:** As a developer, I want property-based tests verifying audit log invariants, so that I have high confidence in correctness across diverse inputs.

#### Acceptance Criteria

1. FOR ALL sequences of N appended events, reading the Audit_Log SHALL return exactly N events in append order with no existing events modified
2. FOR ALL appended events, the generated id fields SHALL be unique across the entire log
3. FOR ALL calls to findMemoryAuditEvents with a memoryId, the result SHALL contain only events whose memoryId matches the specified value
4. FOR ALL usage_reset audit events, the event SHALL contain both before and after fields
5. FOR ALL calls to findMemoryAuditEvents with a memoryId, events with unrelated memoryIds SHALL NOT appear in the result
