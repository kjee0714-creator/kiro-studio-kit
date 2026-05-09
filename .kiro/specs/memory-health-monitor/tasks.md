# Tasks

## 1. Extend DevMemoryEntry Validator
- [ ] 1.1 Add `autoCaptured?: boolean` field to the DevMemoryEntry interface in `src/core/memoryValidator.ts`
- [ ] 1.2 Add `conflictKey?: string` field to the DevMemoryEntry interface in `src/core/memoryValidator.ts`
- [ ] 1.3 Add validation rule: if `autoCaptured` is provided and is not a boolean, return a validation error
- [ ] 1.4 Add validation rule: if `conflictKey` is provided and is not a string, return a validation error
- [ ] 1.5 Add unit tests for autoCaptured and conflictKey validation in `src/__tests__/memoryValidator.test.ts`

## 2. Implement Core Health Module Types and Helpers
- [ ] 2.1 Create `src/core/memoryHealth.ts` with type exports: MemoryHealthLevel, MemoryHealthFindingType, MemoryHealthFindingSeverity, MemoryHealthFinding, MemoryHealthReport
- [ ] 2.2 Implement `tokenOverlap` helper function (word-level Jaccard similarity)
- [ ] 2.3 Implement negation detection helper using pattern matching for conflict pairs
- [ ] 2.4 Implement `findDuplicateClusters` function: detect clusters of entries with same kind + tags overlap >= 2 + relatedSymbols overlap >= 1, returning arrays of { entryIds, reason }

## 3. Implement Scoring Functions
- [ ] 3.1 Implement `computeBloatScore` internal function: activeEntries thresholds, storeSizeKb penalty, autoCaptured ratio penalty, clamped 0-100
- [ ] 3.2 Implement `computeConflictScore` internal function: conflictKey groups, overlap groups (3+ same kind/symbols/tags), negation pairs, clamped 0-100
- [ ] 3.3 Implement `computeDuplicationScore` internal function: cluster count, token overlap bonus, clamped 0-100
- [ ] 3.4 Implement `computeStalenessScore` internal function: stale ratio (>180 days), expired count, low confidence count, clamped 0-100
- [ ] 3.5 Implement `computeInjectionRiskScore` internal function: candidate ratio, low confidence, autoCaptured ratio, duplicate clusters, conflict level, clamped 0-100

## 4. Implement calculateMemoryHealth
- [ ] 4.1 Implement stats computation: totalEntries, activeEntries, deletedEntries, disabledEntries, supersededEntries, expiredEntries, lowConfidenceEntries, autoCapturedEntries, storeSizeKb
- [ ] 4.2 Implement overall score calculation: weighted formula (bloat×0.25 + conflict×0.25 + duplication×0.20 + staleness×0.15 + injectionRisk×0.15), rounded integer
- [ ] 4.3 Implement level determination: 0-49=ok, 50-74=warning, 75-100=critical
- [ ] 4.4 Implement findings generation based on score thresholds (bloat, conflict, duplicate, stale, injection_risk)
- [ ] 4.5 Implement recommendations generation based on findings and stats (compact, prune, supersede, review conflicts, reduce store)

## 5. Unit Tests for Health Module
- [ ] 5.1 Test empty store returns score 0, level ok, empty findings, zero stats
- [ ] 5.2 Test high active count produces high bloatScore
- [ ] 5.3 Test deleted entries produce compact recommendation and correct deletedEntries stat
- [ ] 5.4 Test expired and old entries produce high stalenessScore
- [ ] 5.5 Test duplicate-like entries produce high duplicationScore
- [ ] 5.6 Test same conflictKey entries produce high conflictScore
- [ ] 5.7 Test level thresholds: verify ok/warning/critical boundaries
- [ ] 5.8 Test recommendations are present when findings exist
- [ ] 5.9 Test findDuplicateClusters returns correct clusters with reason strings
- [ ] 5.10 Test findDuplicateClusters returns empty array when no duplicates exist

## 6. Property-Based Tests for Health Module
- [ ] 6.1 Property test: all scores (overallScore, bloatScore, conflictScore, duplicationScore, stalenessScore, injectionRiskScore) are integers in range [0, 100] for any valid input (minimum 100 runs)
- [ ] 6.2 Property test: empty store always returns overallScore === 0 and level === "ok" (minimum 100 runs)
- [ ] 6.3 Property test: adding a deleted entry does not decrease stats.deletedEntries count (minimum 100 runs)
- [ ] 6.4 Property test: every cluster from findDuplicateClusters has entryIds.length >= 2 (minimum 100 runs)
- [ ] 6.5 Property test: overallScore equals round(bloatScore×0.25 + conflictScore×0.25 + duplicationScore×0.20 + stalenessScore×0.15 + injectionRiskScore×0.15) (minimum 100 runs)

## 7. CLI Integration: memory health Command
- [ ] 7.1 Implement `handleMemoryHealth` function in `src/core/memoryCommands.ts`: read entries, get store size, call calculateMemoryHealth, format and print report
- [ ] 7.2 Add `health` case to the `handleMemory` router switch statement
- [ ] 7.3 Update `showMemoryUsage` help text to include `memory health`
- [ ] 7.4 Update `showUsage` in `src/cli.ts` to include `memory health` in the usage output
- [ ] 7.5 Add unit test: `memory health` command displays report with scores, stats, findings, recommendations
- [ ] 7.6 Add unit test: `memory health` with no store file displays score 0 and level ok

## 8. Prompt Health Warning Integration
- [ ] 8.1 Add health check in `src/core/promptGenerator.ts`: after memory injection, when mode != "off", compute health and print warning to stderr if thresholds exceeded
- [ ] 8.2 Add unit test: prompt command shows warning when overallScore >= 75
- [ ] 8.3 Add unit test: prompt command shows warning when conflictScore >= 70
- [ ] 8.4 Add unit test: prompt command shows warning when bloatScore >= 85
- [ ] 8.5 Add unit test: prompt command shows warning when injectionRiskScore >= 75
- [ ] 8.6 Add unit test: --memory off suppresses health warning entirely
- [ ] 8.7 Add unit test: health warning does not alter prompt output content

## 9. Public API Exports
- [ ] 9.1 Export calculateMemoryHealth, findDuplicateClusters from `src/index.ts`
- [ ] 9.2 Export all new types (MemoryHealthLevel, MemoryHealthFindingType, MemoryHealthFindingSeverity, MemoryHealthFinding, MemoryHealthReport) from `src/index.ts`

## 10. Quality Gates Verification
- [ ] 10.1 Run `npm run typecheck` and verify zero errors
- [ ] 10.2 Run `npm run lint` and verify zero errors
- [ ] 10.3 Run `npm test` and verify all tests pass (including new property-based tests)
- [ ] 10.4 Run `npm run build` and verify successful compilation
