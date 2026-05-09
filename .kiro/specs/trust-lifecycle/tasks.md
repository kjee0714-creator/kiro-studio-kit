# Tasks

## 1. Inspect Existing Trust Model

- [ ] 1.1 Review `memoryTrust.ts` for existing `assessMemoryTrust`, `TrustAssessment`, `TrustLevel` types and scoring logic
- [ ] 1.2 Review `memoryValidator.ts` for `DevMemoryEntry` trust-related fields (`trustLevel`, `trustScore`, `promotedAt`, `verifiedAt`, `degradedAt`, `usageStats`)
- [ ] 1.3 Review `memoryHealth.ts` for existing `MemoryHealthReport` stats structure and finding types
- [ ] 1.4 Review existing `handleTrustUpgrade`/`handleTrustDegrade`/`handleTrustAudit` in `memoryCommands.ts`

## 2. Create Trust Lifecycle Pure Functions

- [ ] 2.1 Add type `TrustLifecycleAction = "none" | "upgrade_to_trusted" | "degrade_to_probation" | "manual_verify"` to `memoryTrust.ts`
- [ ] 2.2 Add interface `TrustLifecycleDecision { action, reason, beforeTrustLevel, afterTrustLevel }` to `memoryTrust.ts`
- [ ] 2.3 Implement `assessTrustLifecycleAction(entry)` — returns decision based on usage/feedback criteria; never returns `"manual_verify"`; returns `"none"` for deleted/disabled/discarded/verified entries
- [ ] 2.4 Implement `applyTrustLifecycleDecision(entry, decision, now?)` — returns new entry with updated trustLevel, trustScore, promotedAt/verifiedAt/degradedAt as appropriate; does not mutate input
- [ ] 2.5 Export new types and functions from `memoryTrust.ts`

## 3. Implement Trust Lifecycle CLI Handler

- [ ] 3.1 Implement `handleTrustLifecycle(args)` in `memoryCommands.ts` — parses `--dry-run` flag, reads active store, filters eligible entries, assesses each, applies decisions, rewrites store, records audit events
- [ ] 3.2 In dry-run mode: display candidates with action/reason, do not write store or audit
- [ ] 3.3 In apply mode: apply decisions, rewrite store, record `trust_update` audit events per entry (try/catch), display summary with updated/skipped counts
- [ ] 3.4 Handle zero-candidate case with informational message and exit(0)

## 4. Implement Manual Verify Handler

- [ ] 4.1 Implement `handleTrustVerify(args)` in `memoryCommands.ts` — parses id and `--reason`, reads store, validates entry (exists, not deleted, enabled), creates manual_verify decision, applies, rewrites store, records audit event
- [ ] 4.2 Error handling: not found → exit(1), deleted → exit(1), disabled → exit(1)
- [ ] 4.3 Audit event with eventType `"trust_update"`, metadata `{ operation: "manual_verify" }`, reason from `--reason` flag or default

## 5. Extend Existing Trust Degrade Handler

- [ ] 5.1 Update existing `handleTrustDegrade` to accept `--reason` flag and record `trust_update` audit event with metadata `{ operation: "manual_degrade" }`
- [ ] 5.2 Ensure audit failure does not block degrade operation (try/catch)

## 6. Add CLI Routing

- [ ] 6.1 Extend `handleMemory` trust subcommand routing to dispatch `"lifecycle"` to `handleTrustLifecycle` and `"verify"` to `handleTrustVerify`
- [ ] 6.2 Update `showMemoryUsage()` help text to include `trust lifecycle [--dry-run]` and `trust verify <id> [--reason <text>]`

## 7. Extend Health Report

- [ ] 7.1 Add `trustUpgradeCandidateCount?: number` and `trustDegradeCandidateCount?: number` to `MemoryHealthReport.stats`
- [ ] 7.2 In `calculateMemoryHealth`, assess lifecycle action for each active entry and count upgrade/degrade candidates
- [ ] 7.3 Add info finding when `trustUpgradeCandidateCount > 0`
- [ ] 7.4 Add warning finding when `trustDegradeCandidateCount > 0`

## 8. Update Public API Exports

- [ ] 8.1 Export `TrustLifecycleAction`, `TrustLifecycleDecision` types from `src/index.ts`
- [ ] 8.2 Export `assessTrustLifecycleAction`, `applyTrustLifecycleDecision` functions from `src/index.ts`
- [ ] 8.3 Export `handleTrustLifecycle`, `handleTrustVerify` handlers from `src/index.ts`

## 9. Unit Tests

- [ ] 9.1 Create `src/__tests__/trustLifecycle.test.ts` with test scaffolding and imports
- [ ] 9.2 Test: `assessTrustLifecycleAction` returns `"upgrade_to_trusted"` for eligible probation entry
- [ ] 9.3 Test: `assessTrustLifecycleAction` returns `"none"` for probation entry with insufficient successes
- [ ] 9.4 Test: `assessTrustLifecycleAction` returns `"none"` for verified entry regardless of stats
- [ ] 9.5 Test: `assessTrustLifecycleAction` returns `"none"` for deleted entry
- [ ] 9.6 Test: `assessTrustLifecycleAction` returns `"none"` for disabled entry
- [ ] 9.7 Test: `assessTrustLifecycleAction` returns `"none"` for discarded entry
- [ ] 9.8 Test: `assessTrustLifecycleAction` returns `"degrade_to_probation"` for trusted entry with 3+ rejections > successes
- [ ] 9.9 Test: `assessTrustLifecycleAction` returns `"none"` for trusted entry with rejections <= successes
- [ ] 9.10 Test: `applyTrustLifecycleDecision` with `"upgrade_to_trusted"` sets trustLevel, promotedAt, trustScore
- [ ] 9.11 Test: `applyTrustLifecycleDecision` with `"degrade_to_probation"` sets trustLevel, degradedAt
- [ ] 9.12 Test: `applyTrustLifecycleDecision` with `"manual_verify"` sets trustLevel to verified, verifiedAt, trustScore=100
- [ ] 9.13 Test: `applyTrustLifecycleDecision` does not mutate input entry
- [ ] 9.14 Test: `handleTrustVerify` errors on not-found ID
- [ ] 9.15 Test: `handleTrustVerify` errors on deleted entry
- [ ] 9.16 Test: `handleTrustVerify` errors on disabled entry
- [ ] 9.17 Test: health report includes trustUpgradeCandidateCount and trustDegradeCandidateCount

## 10. Property-Based Tests

- [ ] 10.1 Create `src/__tests__/trustLifecycle.property.test.ts` with fast-check generators
- [ ] 10.2 Property: `assessTrustLifecycleAction` never returns `"manual_verify"` (100 runs)
- [ ] 10.3 Property: `assessTrustLifecycleAction` never returns an action that would set trustLevel to `"verified"` (100 runs)
- [ ] 10.4 Property: `assessTrustLifecycleAction` returns `"none"` for all entries with `deleted === true` (100 runs)
- [ ] 10.5 Property: `applyTrustLifecycleDecision` does not mutate the input entry (100 runs)
- [ ] 10.6 Property: only `"manual_verify"` action can produce an entry with `trustLevel === "verified"` (100 runs)

## 11. Quality Gates

- [ ] 11.1 Run `npm run typecheck` and verify zero errors
- [ ] 11.2 Run `npm run lint` and verify zero errors
- [ ] 11.3 Run `npm run test` and verify all tests pass (existing 678 + new tests)
- [ ] 11.4 Run `npm run build` and verify successful compilation
