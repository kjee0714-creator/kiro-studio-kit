# Requirements Document

## Introduction

This feature implements the Trust Lifecycle for the Dev Memory System. It provides automated and manual trust level transitions based on accumulated usage statistics and feedback data. The system conservatively upgrades entries from `probation` to `trusted` when positive signals accumulate, degrades entries when negative feedback dominates, and reserves `verified` status exclusively for manual human approval.

## Glossary

- **TrustLevel**: One of `"probation"`, `"trusted"`, `"verified"` — representing increasing confidence in a memory entry's value
- **TrustScore**: A numeric score (0–100) computed by `assessMemoryTrust` reflecting overall trust signals
- **Auto-Upgrade**: Automatic promotion from `probation` to `trusted` when usage/feedback criteria are met
- **Auto-Degrade**: Automatic demotion from `trusted` to `probation` when rejection signals dominate
- **Manual Verify**: Human-initiated promotion to `verified` — the only path to this level
- **Lifecycle Run**: A batch operation that evaluates all eligible active entries and applies trust transitions
- **Active_Store**: The JSONL file at `.kiro/ksk/dev-memory.jsonl`
- **Audit_Log**: The append-only JSONL file at `.kiro/ksk/dev-memory-audit.jsonl`

## Requirements

### Requirement 1: Trust Lifecycle Assessment

**User Story:** As a developer, I want the system to assess each memory entry's trust lifecycle action based on usage and feedback data, so that trust levels reflect actual value over time.

#### Acceptance Criteria

1. WHEN `assessTrustLifecycleAction` is invoked on an entry with `trustLevel === "probation"`, `successfulSelections >= 3`, `rejectedSelections === 0`, `selectedCount >= 3`, `deleted !== true`, `enabled === true`, and `captureStatus !== "discarded"`, THE function SHALL return action `"upgrade_to_trusted"`
2. WHEN `assessTrustLifecycleAction` is invoked on an entry with `rejectedSelections >= 3` AND `rejectedSelections > successfulSelections`, THE function SHALL return action `"degrade_to_probation"` if current trustLevel is `"trusted"`, or `"degrade_to_probation"` if current trustLevel is `"probation"` (no further auto-degrade below probation)
3. WHEN `assessTrustLifecycleAction` is invoked on an entry with `trustLevel === "verified"`, THE function SHALL return action `"none"` regardless of usage/feedback signals (verified entries are not auto-modified)
4. WHEN `assessTrustLifecycleAction` is invoked on an entry with `deleted === true`, THE function SHALL return action `"none"`
5. WHEN `assessTrustLifecycleAction` is invoked on an entry with `enabled === false`, THE function SHALL return action `"none"`
6. WHEN `assessTrustLifecycleAction` is invoked on an entry with `captureStatus === "discarded"`, THE function SHALL return action `"none"`
7. THE function SHALL never return action `"manual_verify"` — this action exists only for documentation and is never produced by automated assessment

### Requirement 2: Apply Trust Lifecycle

**User Story:** As a developer, I want to run a trust lifecycle pass over all active entries, so that trust levels are kept up-to-date with accumulated signals.

#### Acceptance Criteria

1. WHEN the `trust lifecycle` command is invoked, THE CLI SHALL read all entries from Active_Store, assess each with `assessTrustLifecycleAction`, and apply transitions for entries with action !== `"none"`
2. WHEN the `trust lifecycle` command is invoked without `--dry-run`, THE CLI SHALL rewrite the Active_Store with updated trust levels and record one `trust_update` audit event per modified entry
3. WHEN the `trust lifecycle --dry-run` command is invoked, THE CLI SHALL display the list of entries that would be modified without changing the Active_Store or creating audit events
4. WHEN the audit event recording fails during lifecycle application, THE CLI SHALL complete the trust update successfully without blocking on the audit failure
5. WHEN no entries qualify for trust transitions, THE CLI SHALL print a message indicating zero candidates and exit with code 0
6. THE lifecycle run SHALL skip entries where `deleted === true`, `enabled === false`, or `captureStatus === "discarded"`

### Requirement 3: Manual Verify

**User Story:** As a developer, I want to manually promote a memory entry to `verified` status, so that I can mark high-value entries as human-approved.

#### Acceptance Criteria

1. WHEN the `trust verify <id>` command is invoked with a valid active entry ID, THE CLI SHALL set `trustLevel` to `"verified"`, set `verifiedAt` to the current ISO timestamp, and update `trustScore` to reflect verified status
2. WHEN the `trust verify <id>` command is invoked with an ID that does not exist, THE CLI SHALL print an error message and exit with code 1
3. WHEN the `trust verify <id>` command is invoked with an ID of a deleted entry, THE CLI SHALL print an error message and exit with code 1
4. WHEN the `trust verify <id>` command is invoked with an ID of a disabled entry, THE CLI SHALL print an error message and exit with code 1
5. WHEN the `trust verify <id>` command is invoked, THE CLI SHALL record a `trust_update` audit event with reason including any user-provided `--reason` text
6. WHEN the audit event recording fails during manual verify, THE CLI SHALL complete the verify operation successfully without blocking on the audit failure
7. THE `verified` trust level SHALL only be reachable through this manual command — no automated process shall set trustLevel to `"verified"`

### Requirement 4: Manual Degrade

**User Story:** As a developer, I want to manually degrade a memory entry's trust level, so that I can demote entries that are no longer reliable.

#### Acceptance Criteria

1. WHEN the `trust degrade <id>` command is invoked with a valid active entry ID, THE CLI SHALL set `trustLevel` to `"probation"`, set `degradedAt` to the current ISO timestamp, and update `trustScore` accordingly
2. WHEN the `trust degrade <id>` command is invoked with an ID that does not exist, THE CLI SHALL print an error message and exit with code 1
3. WHEN the `trust degrade <id>` command is invoked with an ID of a deleted entry, THE CLI SHALL print an error message and exit with code 1
4. WHEN the `trust degrade <id>` command is invoked, THE CLI SHALL record a `trust_update` audit event with reason including any user-provided `--reason` text
5. WHEN the audit event recording fails during manual degrade, THE CLI SHALL complete the degrade operation successfully without blocking on the audit failure

### Requirement 5: Trust Health Integration

**User Story:** As a developer, I want the health report to surface trust lifecycle candidates, so that I can see which entries need attention.

#### Acceptance Criteria

1. WHEN the health report is generated, THE report stats SHALL include `trustUpgradeCandidateCount` indicating the number of entries eligible for auto-upgrade
2. WHEN the health report is generated, THE report stats SHALL include `trustDegradeCandidateCount` indicating the number of entries eligible for auto-degrade
3. WHEN `trustDegradeCandidateCount > 0`, THE health report SHALL include a warning-level finding with type `"stale"` and a message indicating degrade candidates exist
4. WHEN `trustUpgradeCandidateCount > 0`, THE health report SHALL include an info-level finding with type `"stale"` and a message indicating upgrade candidates exist

### Requirement 6: Property-Based Tests

**User Story:** As a developer, I want property-based tests covering trust lifecycle operations, so that correctness invariants are verified across randomized inputs.

#### Acceptance Criteria

1. FOR ALL DevMemoryEntry inputs, THE `assessTrustLifecycleAction` function SHALL never return `"manual_verify"`
2. FOR ALL DevMemoryEntry inputs, THE `assessTrustLifecycleAction` function SHALL never return an action that would set trustLevel to `"verified"`
3. FOR ALL DevMemoryEntry inputs where `deleted === true`, THE `assessTrustLifecycleAction` function SHALL return action `"none"`
4. FOR ALL arrays of DevMemoryEntry, THE lifecycle dry-run SHALL not modify any entry in the store
5. FOR ALL DevMemoryEntry inputs, THE `verified` trust level SHALL only be reachable through `applyTrustLifecycleDecision` with action `"manual_verify"` — never through `"upgrade_to_trusted"` or `"degrade_to_probation"`
