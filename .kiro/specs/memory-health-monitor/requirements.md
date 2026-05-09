# Requirements Document

## Introduction

The Memory Health Monitor is a diagnostic subsystem for kiro-studio-kit that analyzes the DevMemory store and produces a quantitative health report. It detects bloat, conflicts, duplicates, staleness, and injection risk — surfacing actionable findings and recommendations. The feature adds a new `memory health` CLI command and integrates a warning into the `prompt` command when memory quality degrades.

## Glossary

- **Health_Monitor**: The pure-function module (`src/core/memoryHealth.ts`) that computes health scores and findings from DevMemoryEntry arrays.
- **Health_Report**: The `MemoryHealthReport` object containing scores, level, findings, recommendations, and stats.
- **Health_Level**: A categorical classification of overall memory health: "ok", "warning", or "critical".
- **Finding**: A single diagnostic observation (type, severity, message, optional entry IDs, optional suggested command).
- **Bloat_Score**: A 0–100 metric measuring store size and entry volume relative to healthy thresholds.
- **Conflict_Score**: A 0–100 metric measuring contradictory or redundant active entries sharing the same conflict key or overlapping metadata.
- **Duplication_Score**: A 0–100 metric measuring clusters of entries with highly overlapping kind, tags, symbols, and text content.
- **Staleness_Score**: A 0–100 metric measuring the proportion of active entries that are old, expired, or low-confidence.
- **Injection_Risk_Score**: A 0–100 metric measuring the likelihood that memory injection will degrade prompt quality.
- **Overall_Score**: A weighted composite of all sub-scores (bloat×0.25 + conflict×0.25 + duplication×0.20 + staleness×0.15 + injectionRisk×0.15), rounded to an integer.
- **Duplicate_Cluster**: A group of two or more entries sharing the same kind, at least two overlapping tags, and at least one overlapping related symbol.
- **CLI**: The kiro-studio-kit command-line interface binary.
- **Validator**: The `memoryValidator.ts` module responsible for DevMemoryEntry schema validation.
- **Prompt_Generator**: The `promptGenerator.ts` module that assembles prompts with optional memory injection.

## Requirements

### Requirement 1: Health Score Calculation

**User Story:** As a developer, I want to compute a quantitative health report from my memory store, so that I can understand the quality and maintainability of my development memory.

#### Acceptance Criteria

1. WHEN an array of DevMemoryEntry objects is provided, THE Health_Monitor SHALL return a Health_Report containing overallScore, level, bloatScore, conflictScore, duplicationScore, stalenessScore, and injectionRiskScore.
2. THE Health_Monitor SHALL clamp all individual sub-scores to the integer range 0–100 inclusive.
3. THE Health_Monitor SHALL compute overallScore as: round(bloatScore×0.25 + conflictScore×0.25 + duplicationScore×0.20 + stalenessScore×0.15 + injectionRiskScore×0.15).
4. WHEN overallScore is 0–49, THE Health_Monitor SHALL set level to "ok".
5. WHEN overallScore is 50–74, THE Health_Monitor SHALL set level to "warning".
6. WHEN overallScore is 75–100, THE Health_Monitor SHALL set level to "critical".
7. WHEN an empty array is provided, THE Health_Monitor SHALL return overallScore of 0 and level of "ok".

### Requirement 2: Bloat Score Computation

**User Story:** As a developer, I want to know when my memory store is growing too large, so that I can prune or compact it before it degrades prompt quality.

#### Acceptance Criteria

1. WHEN activeEntries count is 50 or fewer, THE Health_Monitor SHALL assign a low base bloat contribution.
2. WHEN activeEntries count is between 51 and 150, THE Health_Monitor SHALL assign a medium base bloat contribution.
3. WHEN activeEntries count exceeds 150, THE Health_Monitor SHALL assign a high base bloat contribution.
4. WHEN storeSizeKb is 500 or greater, THE Health_Monitor SHALL add an additional bloat penalty.
5. WHEN the ratio of autoCaptured entries to total active entries is 60 percent or greater, THE Health_Monitor SHALL add an additional bloat penalty.

### Requirement 3: Conflict Score Computation

**User Story:** As a developer, I want to detect contradictory memory entries, so that conflicting advice does not confuse prompt generation.

#### Acceptance Criteria

1. WHEN two or more active entries share the same non-empty conflictKey, THE Health_Monitor SHALL increase the conflictScore.
2. WHEN three or more active entries share the same kind and have overlapping relatedSymbols and tags, THE Health_Monitor SHALL increase the conflictScore.
3. WHEN active entries contain negation pairs in their summary or futurePromptHint fields (one contains a phrase and another negates it), THE Health_Monitor SHALL increase the conflictScore.

### Requirement 4: Duplication Score Computation

**User Story:** As a developer, I want to identify duplicate memory entries, so that I can consolidate them and reduce noise.

#### Acceptance Criteria

1. WHEN two or more active entries share the same kind, have at least two overlapping tags, and at least one overlapping relatedSymbol, THE Health_Monitor SHALL increase the duplicationScore.
2. WHEN entries in a duplicate cluster also have significant token overlap in their summary or futurePromptHint fields, THE Health_Monitor SHALL further increase the duplicationScore.

### Requirement 5: Staleness Score Computation

**User Story:** As a developer, I want to know when my memory entries are outdated, so that I can refresh or remove stale advice.

#### Acceptance Criteria

1. WHEN active entries are older than 180 days, THE Health_Monitor SHALL increase the stalenessScore proportionally to the count of stale entries.
2. WHEN expired entries exist in the store, THE Health_Monitor SHALL increase the stalenessScore.
3. WHEN low-confidence entries are active, THE Health_Monitor SHALL increase the stalenessScore.

### Requirement 6: Injection Risk Score Computation

**User Story:** As a developer, I want to assess the risk that memory injection will degrade my prompts, so that I can take corrective action before generating prompts.

#### Acceptance Criteria

1. WHEN the active candidate count is high relative to selection limits, THE Health_Monitor SHALL increase the injectionRiskScore.
2. WHEN low-confidence entries are active, THE Health_Monitor SHALL increase the injectionRiskScore.
3. WHEN the autoCaptured ratio among active entries is high, THE Health_Monitor SHALL increase the injectionRiskScore.
4. WHEN duplicate clusters exist, THE Health_Monitor SHALL increase the injectionRiskScore.
5. WHEN conflict candidates exist, THE Health_Monitor SHALL increase the injectionRiskScore.

### Requirement 7: Duplicate Cluster Detection

**User Story:** As a developer, I want to identify groups of near-duplicate entries, so that I can consolidate or remove redundant memories.

#### Acceptance Criteria

1. THE Health_Monitor SHALL expose a findDuplicateClusters function that accepts an array of DevMemoryEntry objects.
2. WHEN entries share the same kind, at least two overlapping tags, and at least one overlapping relatedSymbol, THE Health_Monitor SHALL group them into a Duplicate_Cluster.
3. THE Health_Monitor SHALL return each Duplicate_Cluster with an array of entry IDs (minimum two) and a human-readable reason string.
4. WHEN no duplicates exist, THE Health_Monitor SHALL return an empty array.

### Requirement 8: Health Findings and Recommendations

**User Story:** As a developer, I want actionable findings and recommendations from the health report, so that I know exactly what to fix.

#### Acceptance Criteria

1. WHEN a sub-score exceeds a warning threshold, THE Health_Monitor SHALL generate a Finding with the appropriate type, severity, message, affected entry IDs, and suggested command.
2. THE Health_Monitor SHALL generate recommendations as human-readable strings suggesting specific CLI commands to resolve issues.
3. WHEN deleted entries exist, THE Health_Monitor SHALL recommend running `memory compact`.
4. WHEN stale entries exist, THE Health_Monitor SHALL recommend running `memory prune`.

### Requirement 9: Health Stats

**User Story:** As a developer, I want summary statistics in the health report, so that I have a quick overview of my memory store composition.

#### Acceptance Criteria

1. THE Health_Report SHALL include totalEntries, activeEntries, deletedEntries, disabledEntries, supersededEntries, expiredEntries, lowConfidenceEntries, and autoCapturedEntries counts.
2. WHEN storeSizeKb is provided as an option, THE Health_Report SHALL include it in the stats object.

### Requirement 10: CLI Health Command

**User Story:** As a developer, I want a `memory health` CLI command, so that I can check my memory store health from the terminal.

#### Acceptance Criteria

1. WHEN the user runs `kiro-studio-kit memory health`, THE CLI SHALL compute and display the full Health_Report.
2. THE CLI SHALL display the overall score, level, all sub-scores, stats, findings, and recommendations in a human-readable format.
3. IF the memory store file does not exist, THEN THE CLI SHALL display a score of 0 with level "ok" and a message indicating no entries.

### Requirement 11: Prompt Health Warning

**User Story:** As a developer, I want to be warned during prompt generation when my memory health is poor, so that I can address issues before they affect prompt quality.

#### Acceptance Criteria

1. WHEN memory mode is not "off" AND (overallScore >= 75 OR conflictScore >= 70 OR bloatScore >= 85 OR injectionRiskScore >= 75), THE Prompt_Generator SHALL print a short warning to stderr.
2. THE Prompt_Generator SHALL not alter the prompt output content when displaying the health warning.
3. WHEN memory mode is "off", THE Prompt_Generator SHALL not compute or display any health warning.

### Requirement 12: Validator Extension

**User Story:** As a developer, I want the entry validator to accept autoCaptured and conflictKey fields, so that the health monitor can use these metadata fields for analysis.

#### Acceptance Criteria

1. THE Validator SHALL accept an optional `autoCaptured` field of type boolean on DevMemoryEntry.
2. THE Validator SHALL accept an optional `conflictKey` field of type string on DevMemoryEntry.
3. IF `autoCaptured` is provided and is not a boolean, THEN THE Validator SHALL return a validation error.
4. IF `conflictKey` is provided and is not a string, THEN THE Validator SHALL return a validation error.
