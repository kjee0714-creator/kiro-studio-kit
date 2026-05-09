# Requirements Document

## Introduction

This feature adds a Memory Injection Policy layer to the Dev Memory System. After the existing selector picks candidate entries based on relevance scoring, the injection policy applies trust-based prioritization, probation/autoCaptured limits, and high-rejection suppression to produce the final list of entries injected into the prompt. This ensures prompt quality remains high as the memory store grows.

## Glossary

- **Injection Policy**: A post-selection filter that controls which candidate entries are actually injected into the prompt
- **High Rejection Entry**: An entry with `rejectedSelections >= 3` AND `rejectedSelections > successfulSelections`
- **AutoCaptured Entry**: An entry with `autoCaptured === true`
- **Trust Priority**: Ordering preference: verified > trusted > probation > undefined

## Requirements

### Requirement 1: Apply Injection Policy

**User Story:** As a developer, I want the injection pipeline to apply a policy filter after selection, so that only high-quality entries are injected into my prompt.

#### Acceptance Criteria

1. WHEN `applyMemoryInjectionPolicy` is invoked with selected entries, THE function SHALL return a result containing `selectedEntries` (included) and `excludedEntries` (filtered out)
2. WHEN an entry has `deleted === true`, THE function SHALL exclude it from the result
3. WHEN an entry has `enabled === false`, THE function SHALL exclude it from the result
4. WHEN an entry has `captureStatus === "discarded"`, THE function SHALL exclude it from the result
5. THE result SHALL contain at most `maxTotalEntries` entries in `selectedEntries`
6. THE function SHALL NOT mutate any input entry objects
7. THE function SHALL return a `decisions` array documenting include/exclude reason for each input entry
8. THE function SHALL return `stats` with counts of input, output, excluded, probation included, autoCaptured included, and high rejection excluded

### Requirement 2: Trust-Based Prioritization

**User Story:** As a developer, I want verified and trusted entries to be prioritized over probation entries, so that high-confidence memories appear first.

#### Acceptance Criteria

1. WHEN entries are sorted for inclusion, THE function SHALL prioritize verified entries over trusted, trusted over probation, and probation over entries with undefined trustLevel
2. WHEN entries have the same trust priority, THE function SHALL preserve their original input order (stable sort)
3. THE function SHALL NOT modify any entry's `trustLevel` — trust changes are the responsibility of Trust Lifecycle (Phase 4-H)

### Requirement 3: Probation and AutoCaptured Limits

**User Story:** As a developer, I want limits on probation and auto-captured entries, so that unproven memories don't dominate my prompt.

#### Acceptance Criteria

1. WHEN the number of probation entries in the result would exceed `maxProbationEntries`, THE function SHALL exclude the lowest-priority probation entries
2. WHEN the ratio of autoCaptured entries in the result would exceed `maxAutoCapturedRatio`, THE function SHALL exclude the lowest-priority autoCaptured entries until the ratio is satisfied or only 1 autoCaptured entry remains
3. WHEN all candidate entries are autoCaptured, THE function SHALL still include at least 1 entry (minimum guarantee)
4. THE default `maxProbationEntries` SHALL be 1
5. THE default `maxAutoCapturedRatio` SHALL be 0.5

### Requirement 4: High Rejection Suppression

**User Story:** As a developer, I want entries with high rejection rates to be suppressed from injection, so that repeatedly-rejected memories stop appearing.

#### Acceptance Criteria

1. WHEN `suppressHighRejection` is true AND an entry has `rejectedSelections >= 3` AND `rejectedSelections > successfulSelections`, THE function SHALL exclude that entry
2. WHEN `suppressHighRejection` is false, THE function SHALL NOT exclude entries based on rejection counts
3. THE function SHALL NOT modify the entry's `usageStats` or `trustLevel` — suppression is injection-only
4. THE default `suppressHighRejection` SHALL be true

### Requirement 5: Injection Integration

**User Story:** As a developer, I want the injection policy to be integrated into the prompt generation pipeline, so that policy rules are automatically applied.

#### Acceptance Criteria

1. WHEN `injectMemorySection` is called, THE function SHALL apply the injection policy to the selected entries before formatting
2. THE `MemoryInjectionMeta` SHALL include a `policy` field with stats from the policy application
3. THE `selectedEntries` returned by `injectMemorySection` SHALL be the post-policy entries (not the pre-policy candidates)
4. THE `selectedIds` in meta SHALL reflect the post-policy entry IDs
5. WHEN usage persistence is triggered, IT SHALL only persist selections for post-policy entries (entries excluded by policy do not get selectedCount incremented)

### Requirement 6: Property-Based Tests

**User Story:** As a developer, I want property-based tests covering injection policy operations, so that correctness invariants are verified across randomized inputs.

#### Acceptance Criteria

1. FOR ALL arrays of DevMemoryEntry, THE `applyMemoryInjectionPolicy` result length SHALL be <= `maxTotalEntries`
2. FOR ALL arrays of DevMemoryEntry, THE probation included count SHALL be <= `maxProbationEntries`
3. FOR ALL arrays of DevMemoryEntry, deleted/disabled/discarded entries SHALL never appear in `selectedEntries`
4. FOR ALL arrays of DevMemoryEntry with `suppressHighRejection=true`, high rejection entries SHALL not appear in `selectedEntries`
5. FOR ALL arrays of DevMemoryEntry, THE `applyMemoryInjectionPolicy` function SHALL NOT mutate any input entry

