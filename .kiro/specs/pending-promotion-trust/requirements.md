# Requirements Document

## Introduction

Phase 4-C adds a trust promotion and usage tracking system to the Kiro Studio Kit development memory. Memory entries progress through trust levels (probation → trusted → verified) based on usage statistics, evidence quality, and health signals. This enables the memory selector to prioritize high-trust entries during prompt injection and provides CLI commands for manual trust management and auditing.

## Glossary

- **Trust_Module**: The `src/core/memoryTrust.ts` module containing pure functions for trust assessment and usage recording
- **Trust_Score**: An integer value from 0 to 100 representing the computed trustworthiness of a memory entry
- **Trust_Level**: One of "probation", "trusted", or "verified" — derived from Trust_Score thresholds
- **Usage_Stats**: A record tracking how many times a memory entry has been selected for prompt injection and whether those selections were successful
- **Memory_Selector**: The `src/core/memorySelector.ts` module responsible for scoring and selecting entries for prompt injection
- **Health_Monitor**: The `src/core/memoryHealth.ts` module that computes health reports for the memory store
- **Active_Store**: The primary JSONL file at `.kiro/ksk/dev-memory.jsonl` containing promoted memory entries
- **Pending_Store**: The quarantine JSONL file at `.kiro/ksk/dev-memory.pending.jsonl` containing entries awaiting promotion
- **CLI**: The command-line interface exposed via `kiro-studio-kit` binary

## Requirements

### Requirement 1: Usage Statistics Tracking

**User Story:** As a developer, I want memory entries to track how often they are selected for prompt injection, so that frequently-used entries can be identified and promoted.

#### Acceptance Criteria

1. THE Trust_Module SHALL define a `MemoryUsageStats` interface with fields: `selectedCount` (number), `successfulSelections` (number), `rejectedSelections` (number), `lastSelectedAt` (optional ISO string), `lastSuccessfulAt` (optional ISO string)
2. THE Trust_Module SHALL export a `recordMemorySelection` function that accepts a DevMemoryEntry and optional Date, and returns a new DevMemoryEntry with `usageStats.selectedCount` incremented by 1 and `usageStats.lastSelectedAt` updated
3. WHEN `recordMemorySelection` is called on an entry without existing `usageStats`, THE Trust_Module SHALL initialize `usageStats` with `selectedCount: 1`, `successfulSelections: 0`, `rejectedSelections: 0`
4. FOR ALL calls to `recordMemorySelection`, THE Trust_Module SHALL monotonically increase `selectedCount` (never decrease)

### Requirement 2: Trust Score Computation

**User Story:** As a developer, I want each memory entry to have a computed trust score, so that the system can objectively assess entry quality.

#### Acceptance Criteria

1. THE Trust_Module SHALL export an `assessMemoryTrust` function that accepts a DevMemoryEntry and optional context (now, healthReport), and returns a `TrustAssessment` with `trustScore`, `recommendedTrustLevel`, and `reasons`
2. THE Trust_Module SHALL compute `trustScore` as the sum of applicable bonuses minus applicable penalties, clamped to the range 0-100
3. THE Trust_Module SHALL apply the following bonuses: +10 for selectedCount >= 5, +10 for selectedCount >= 20, +15 for successfulSelections >= 3, +10 for occurrences >= 3, +15 for confidence === "high", +10 for authority === "rule", +10 for source === "manual", +15 for verifiedAt existing, +10 for no conflictKey, +10 for no duplicateOf, +5 for age >= 30 days
4. THE Trust_Module SHALL apply the following penalties: -20 for conflictKey existing, -15 for duplicateOf existing, -15 for health conflictScore >= 50, -10 for confidence === "low", -10 for probation trust level older than 30 days without any selection, -10 for never selected (selectedCount === 0 or undefined), -20 for captureStatus === "quarantined", -30 for deleted === true
5. FOR ALL DevMemoryEntry inputs, THE Trust_Module SHALL produce a trustScore in the range 0-100 inclusive

### Requirement 3: Trust Level Thresholds

**User Story:** As a developer, I want trust levels to be derived from trust scores using clear thresholds, so that promotion decisions are transparent and predictable.

#### Acceptance Criteria

1. WHEN trustScore is in the range 0-39, THE Trust_Module SHALL recommend trustLevel "probation"
2. WHEN trustScore is in the range 40-74, THE Trust_Module SHALL recommend trustLevel "trusted"
3. WHEN trustScore is in the range 75-100, THE Trust_Module SHALL recommend trustLevel "verified"
4. FOR ALL entries with captureStatus === "quarantined", THE Trust_Module SHALL never recommend trustLevel "verified" regardless of score

### Requirement 4: Pending Promotion Command

**User Story:** As a developer, I want to promote a pending entry to the active store, so that quarantined entries can become active after review.

#### Acceptance Criteria

1. WHEN `ksk memory pending promote <id>` is executed with a valid pending entry ID, THE CLI SHALL move the entry from Pending_Store to Active_Store with trustLevel "probation", enabled true, authority "hint", and captureStatus "active"
2. WHEN `ksk memory pending promote <id>` is executed with a valid pending entry ID, THE CLI SHALL set `promotedAt` to the current ISO timestamp on the promoted entry
3. IF the specified ID does not exist in Pending_Store, THEN THE CLI SHALL print an error message and exit with code 1
4. WHEN promotion succeeds, THE CLI SHALL remove the entry from Pending_Store

### Requirement 5: Trust Upgrade Command

**User Story:** As a developer, I want to manually upgrade an entry's trust level, so that I can promote entries that have proven their value.

#### Acceptance Criteria

1. WHEN `ksk memory trust upgrade <id>` is executed, THE CLI SHALL compute the trust assessment for the entry and upgrade its trustLevel if the recommended level is higher than the current level
2. WHEN an upgrade from "probation" to "trusted" occurs, THE CLI SHALL set `promotedAt` to the current ISO timestamp
3. WHEN an upgrade from "trusted" to "verified" occurs, THE CLI SHALL set `verifiedAt` to the current ISO timestamp
4. IF the entry is already at the recommended level or higher, THEN THE CLI SHALL print a message indicating no upgrade is needed
5. IF the specified ID does not exist in Active_Store, THEN THE CLI SHALL print an error message and exit with code 1

### Requirement 6: Trust Degrade Command

**User Story:** As a developer, I want to manually downgrade an entry's trust level, so that I can demote entries that are no longer reliable.

#### Acceptance Criteria

1. WHEN `ksk memory trust degrade <id>` is executed on a "verified" entry, THE CLI SHALL set trustLevel to "trusted" and set `degradedAt` to the current ISO timestamp
2. WHEN `ksk memory trust degrade <id>` is executed on a "trusted" entry, THE CLI SHALL set trustLevel to "probation" and set `degradedAt` to the current ISO timestamp
3. IF the entry is already at "probation" level, THEN THE CLI SHALL print a message indicating the entry cannot be further degraded
4. IF the specified ID does not exist in Active_Store, THEN THE CLI SHALL print an error message and exit with code 1

### Requirement 7: Trust Audit Command

**User Story:** As a developer, I want to audit all active entries for trust level changes, so that I can see which entries should be promoted or demoted.

#### Acceptance Criteria

1. WHEN `ksk memory trust audit` is executed without --apply, THE CLI SHALL compute trust assessments for all active entries and display entries where the recommended level differs from the current level
2. WHEN `ksk memory trust audit --apply` is executed, THE CLI SHALL apply all recommended trust level changes to the Active_Store
3. THE CLI SHALL display a summary showing counts of upgrades and downgrades (proposed or applied)

### Requirement 8: Selector Trust Bonus

**User Story:** As a developer, I want the memory selector to prefer higher-trust entries during prompt injection, so that verified knowledge is prioritized.

#### Acceptance Criteria

1. WHILE scoring entries for selection, THE Memory_Selector SHALL add +15 points for entries with trustLevel "verified"
2. WHILE scoring entries for selection, THE Memory_Selector SHALL add +8 points for entries with trustLevel "trusted"
3. WHILE scoring entries for selection, THE Memory_Selector SHALL add +0 points for entries with trustLevel "probation" or undefined trustLevel
4. THE trust bonus SHALL be additive to the existing score computation without replacing any existing scoring logic

### Requirement 9: Health Report Trust Distribution

**User Story:** As a developer, I want the health report to show trust level distribution, so that I can monitor the overall trust quality of my memory store.

#### Acceptance Criteria

1. THE Health_Monitor SHALL include trust distribution counts (probation, trusted, verified) in the health report stats
2. WHEN the ratio of probation entries to total active entries exceeds 0.7, THE Health_Monitor SHALL add a finding with type "stale" and severity "warning" indicating high probation ratio

### Requirement 10: DevMemoryEntry Schema Extension

**User Story:** As a developer, I want the memory entry schema to support trust-related fields, so that trust state is persisted correctly.

#### Acceptance Criteria

1. THE DevMemoryEntry interface SHALL include optional fields: `promotedAt` (string), `verifiedAt` (string), `degradedAt` (string), `usageStats` (MemoryUsageStats), `trustScore` (number)
2. THE validator SHALL accept entries with or without the new optional fields (backward compatible)
3. WHEN `trustScore` is provided, THE validator SHALL verify it is a number
4. WHEN `usageStats` is provided, THE validator SHALL verify `selectedCount`, `successfulSelections`, and `rejectedSelections` are numbers

### Requirement 11: Property-Based Test Coverage

**User Story:** As a developer, I want property-based tests to verify trust invariants, so that edge cases are caught automatically.

#### Acceptance Criteria

1. FOR ALL arbitrary DevMemoryEntry inputs, THE Trust_Module SHALL produce a trustScore in the range 0-100 (clamped invariant)
2. FOR ALL entries where trustScore >= 75, THE Trust_Module SHALL recommend "verified" (unless quarantined)
3. FOR ALL entries with captureStatus === "quarantined", THE Trust_Module SHALL never recommend "verified"
4. FOR ALL calls to `recordMemorySelection`, the resulting `selectedCount` SHALL be greater than or equal to the input `selectedCount`
5. FOR ALL entries with deleted === true, THE Trust_Module SHALL never recommend a trust level higher than "probation"
