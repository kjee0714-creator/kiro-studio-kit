# Tasks

## 1. Extend DevMemoryEntry Schema

- [ ] 1.1 Add optional fields to DevMemoryEntry interface in memoryValidator.ts: promotedAt (string), verifiedAt (string), degradedAt (string), usageStats (MemoryUsageStats), trustScore (number)
- [ ] 1.2 Add MemoryUsageStats interface to memoryValidator.ts with fields: selectedCount, successfulSelections, rejectedSelections, lastSelectedAt?, lastSuccessfulAt?
- [ ] 1.3 Add validation logic for new optional fields in validateDevMemoryEntry: promotedAt/verifiedAt/degradedAt as strings, trustScore as number, usageStats as object with required number fields
- [ ] 1.4 Export new types from src/index.ts

## 2. Create memoryTrust.ts Module

- [ ] 2.1 Create src/core/memoryTrust.ts with TrustAssessment and TrustContext interfaces
- [ ] 2.2 Implement assessMemoryTrust function with all bonus rules (+10 selectedCount>=5, +10 selectedCount>=20, +15 successfulSelections>=3, +10 occurrences>=3, +15 confidence high, +10 authority rule, +10 source manual, +15 verifiedAt, +10 no conflict, +10 no duplicate, +5 age>=30d)
- [ ] 2.3 Implement penalty rules in assessMemoryTrust (-20 conflict, -15 duplicate, -15 health conflict high, -10 low confidence, -10 stale probation, -10 never selected, -20 quarantined, -30 deleted)
- [ ] 2.4 Implement trust level threshold mapping (0-39 probation, 40-74 trusted, 75-100 verified) with quarantined cap at trusted
- [ ] 2.5 Implement recordMemorySelection function that returns new entry with incremented selectedCount and updated lastSelectedAt
- [ ] 2.6 Export memoryTrust functions and types from src/index.ts

## 3. Integrate Trust Bonus into Memory Selector

- [ ] 3.1 Add trust level bonus to scoreEntry function: verified +15, trusted +8, probation/undefined +0
- [ ] 3.2 Add trust level bonus to scoreEntryDetailed function with MemoryMatchReason type "trust"
- [ ] 3.3 Verify existing tests still pass after selector changes

## 4. Integrate Trust Distribution into Health Monitor

- [ ] 4.1 Add trustDistribution field (probation/trusted/verified counts) to MemoryHealthReport stats
- [ ] 4.2 Compute trust distribution from active entries in calculateMemoryHealth
- [ ] 4.3 Add finding when probation ratio exceeds 0.7 of active entries (type "stale", severity "warning")
- [ ] 4.4 Verify existing health tests still pass

## 5. Implement CLI Commands

- [ ] 5.1 Implement handlePendingPromote function: read pending store, find entry, move to active store with probation/enabled/hint/active/promotedAt, remove from pending
- [ ] 5.2 Implement handleTrustUpgrade function: read active store, find entry, assess trust, upgrade if recommended is higher, set promotedAt or verifiedAt, persist trustScore
- [ ] 5.3 Implement handleTrustDegrade function: read active store, find entry, downgrade one level (verified→trusted, trusted→probation), set degradedAt
- [ ] 5.4 Implement handleTrustAudit function: assess all active entries, report/apply trust changes with --apply flag
- [ ] 5.5 Add CLI routing for `pending promote`, `trust upgrade`, `trust degrade`, `trust audit` in handleMemory and update usage text

## 6. Write Unit Tests

- [ ] 6.1 Create src/__tests__/memoryTrust.test.ts with test for recordMemorySelection incrementing selectedCount
- [ ] 6.2 Add test for recordMemorySelection initializing usageStats when missing
- [ ] 6.3 Add test for assessMemoryTrust clamping score to 0-100
- [ ] 6.4 Add tests for trust level thresholds (probation at 39, trusted at 40, verified at 75)
- [ ] 6.5 Add test for conflicts reducing trustScore (conflictKey penalty -20)
- [ ] 6.6 Add test for duplicates reducing trustScore (duplicateOf penalty -15)
- [ ] 6.7 Add test for verified entry gaining +15 bonus from verifiedAt
- [ ] 6.8 Add test for pending promote moving entry correctly
- [ ] 6.9 Add test for trust upgrade applying recommended level
- [ ] 6.10 Add test for trust degrade downgrading one level
- [ ] 6.11 Add test for trust audit reporting candidates
- [ ] 6.12 Add test for selector trust bonus affecting ranking (verified +15, trusted +8)
- [ ] 6.13 Add test for quarantined entries never becoming verified
- [ ] 6.14 Add test for health report including trust distribution

## 7. Write Property-Based Tests

- [ ] 7.1 Create src/__tests__/memoryTrust.property.test.ts with fast-check arbitrary for DevMemoryEntry with trust fields
- [ ] 7.2 Property 1: trustScore always in range 0-100 for all arbitrary entries (100 runs)
- [ ] 7.3 Property 2: verified recommendation requires trustScore >= 75 (100 runs)
- [ ] 7.4 Property 3: quarantined entries never receive verified recommendation (100 runs)
- [ ] 7.5 Property 4: recordMemorySelection monotonically increases selectedCount (100 runs)
- [ ] 7.6 Property 5: deleted entries never receive trust level higher than probation (100 runs)

## 8. Quality Gate Verification

- [ ] 8.1 Run npm run typecheck and fix any type errors
- [ ] 8.2 Run npm run lint and fix any lint errors
- [ ] 8.3 Run npm test and verify all tests pass (existing + new)
- [ ] 8.4 Run npm run build and verify successful compilation
