# Tasks

## 1. Inspect Existing Injection Flow

- [x] 1.1 Review `memoryInjector.ts` for `injectMemorySection` pipeline and `MemoryInjectionMeta` type
- [x] 1.2 Review `memorySelector.ts` for `selectMemoryEntries` output structure
- [x] 1.3 Review `promptGenerator.ts` for usage persistence integration point
- [x] 1.4 Review `memoryValidator.ts` for `autoCaptured`, `usageStats`, `trustLevel` fields

## 2. Create Memory Injection Policy Module

- [ ] 2.1 Create `src/core/memoryInjectionPolicy.ts` with type definitions: `MemoryInjectionPolicyConfig`, `MemoryInjectionPolicyDecision`, `MemoryInjectionPolicyResult`
- [ ] 2.2 Add `DEFAULT_MEMORY_INJECTION_POLICY` constant
- [ ] 2.3 Implement `isHighRejectionMemory(entry)` helper
- [ ] 2.4 Implement `isAutoCapturedMemory(entry)` helper
- [ ] 2.5 Implement `getTrustPriority(entry)` helper
- [ ] 2.6 Implement `applyMemoryInjectionPolicy(entries, config?)` pure function

## 3. Extend Memory Injection Meta

- [ ] 3.1 Add optional `policy` field to `MemoryInjectionMeta` interface in `memoryInjector.ts`

## 4. Integrate Policy into Injection Pipeline

- [ ] 4.1 Import and call `applyMemoryInjectionPolicy` in `injectMemorySection` after `selectMemoryEntries`
- [ ] 4.2 Update meta to use post-policy counts and IDs
- [ ] 4.3 Return post-policy `selectedEntries` (usage persistence already uses this)

## 5. Update Public API Exports

- [ ] 5.1 Export types: `MemoryInjectionPolicyConfig`, `MemoryInjectionPolicyDecision`, `MemoryInjectionPolicyResult`
- [ ] 5.2 Export functions: `applyMemoryInjectionPolicy`, `isHighRejectionMemory`, `isAutoCapturedMemory`, `getTrustPriority`
- [ ] 5.3 Export constant: `DEFAULT_MEMORY_INJECTION_POLICY`

## 6. Unit Tests

- [ ] 6.1 Create `src/__tests__/memoryInjectionPolicy.test.ts`
- [ ] 6.2 Test: empty input returns empty result
- [ ] 6.3 Test: deleted entries are excluded
- [ ] 6.4 Test: disabled entries are excluded
- [ ] 6.5 Test: discarded entries are excluded
- [ ] 6.6 Test: high rejection entries excluded when suppressHighRejection=true
- [ ] 6.7 Test: high rejection entries included when suppressHighRejection=false
- [ ] 6.8 Test: result respects maxTotalEntries
- [ ] 6.9 Test: probation entries limited to maxProbationEntries
- [ ] 6.10 Test: autoCaptured ratio enforced
- [ ] 6.11 Test: trust priority ordering (verified > trusted > probation)
- [ ] 6.12 Test: stable sort preserves input order within same trust level
- [ ] 6.13 Test: does not mutate input entries
- [ ] 6.14 Test: decisions array documents each entry
- [ ] 6.15 Test: stats are accurate
- [ ] 6.16 Test: isHighRejectionMemory helper
- [ ] 6.17 Test: isAutoCapturedMemory helper
- [ ] 6.18 Test: getTrustPriority helper

## 7. Property-Based Tests

- [ ] 7.1 Create `src/__tests__/memoryInjectionPolicy.property.test.ts`
- [ ] 7.2 Property: result length <= maxTotalEntries (100 runs)
- [ ] 7.3 Property: probation included count <= maxProbationEntries (100 runs)
- [ ] 7.4 Property: deleted/disabled/discarded entries never in selectedEntries (100 runs)
- [ ] 7.5 Property: high rejection entries excluded when suppressHighRejection=true (100 runs)
- [ ] 7.6 Property: applyMemoryInjectionPolicy does not mutate input entries (100 runs)

## 8. Quality Gates

- [ ] 8.1 Run `npm run typecheck` and verify zero errors
- [ ] 8.2 Run `npm run lint` and verify zero errors
- [ ] 8.3 Run `npm run test` and verify all tests pass
- [ ] 8.4 Run `npm run build` and verify successful compilation

