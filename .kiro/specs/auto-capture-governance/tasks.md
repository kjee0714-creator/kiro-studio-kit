# Tasks: Auto Capture Governance MVP

## Phase 1: Extended Data Model

- [ ] 1.1 Add governance type definitions to memoryValidator.ts (MemorySource, CaptureStatus, TrustLevel, Authority, CaptureEvidence, CaptureAssessment)
- [ ] 1.2 Extend DevMemoryEntry interface with optional governance fields (source, captureStatus, trustLevel, authority, evidence, captureAssessment, duplicateOf, occurrences, lastSeenAt)
- [ ] 1.3 Add validation logic for governance fields in validateDevMemoryEntry (enum checks, object shape validation)
- [ ] 1.4 Add exported constants: VALID_SOURCES, VALID_CAPTURE_STATUSES, VALID_TRUST_LEVELS, VALID_AUTHORITIES
- [ ] 1.5 Run typecheck and lint to verify model changes compile cleanly

## Phase 2: Pending/Quarantine Store

- [ ] 2.1 Add PENDING_STORE_PATH constant to memoryStore.ts
- [ ] 2.2 Implement readPendingMemoryEntries function in memoryStore.ts
- [ ] 2.3 Implement appendPendingMemoryEntry function in memoryStore.ts
- [ ] 2.4 Implement clearPendingStore function in memoryStore.ts
- [ ] 2.5 Add pending store exports to src/index.ts
- [ ] 2.6 Run typecheck and lint to verify pending store compiles cleanly

## Phase 3: Capture Module — Signal Extraction

- [ ] 3.1 Create src/core/memoryCapture.ts with CaptureSignals and MemoryCaptureCandidate type definitions
- [ ] 3.2 Implement extractCaptureSignals function (detect failed/passed gates, file paths, error/fix/forbidden signals)
- [ ] 3.3 Write unit tests for extractCaptureSignals: lint failure detection, typecheck failure detection, test failure detection, file path extraction, forbidden signal detection (5 tests)
- [ ] 3.4 Run tests to verify signal extraction works correctly

## Phase 4: Capture Module — Candidate Generation

- [ ] 4.1 Implement generateCaptureCandidates function (map gate failures to candidate kinds, set autoCaptured/source/trustLevel/authority)
- [ ] 4.2 Write unit tests for generateCaptureCandidates: creates lint_fix candidate, returns empty for no signals (2 tests)
- [ ] 4.3 Run tests to verify candidate generation works correctly

## Phase 5: Capture Module — RCA-CAR Assessment

- [ ] 5.1 Implement assessCaptureCandidate function (compute all six scores and totalScore)
- [ ] 5.2 Write unit tests for assessCaptureCandidate: correct scores for strong candidate, high risk for weak candidate (2 tests)
- [ ] 5.3 Run tests to verify assessment scoring works correctly

## Phase 6: Capture Module — Decision Policy

- [ ] 6.1 Implement decideCaptureStatus function (active/quarantined/discarded thresholds)
- [ ] 6.2 Implement CaptureDecision type export
- [ ] 6.3 Write unit tests for decideCaptureStatus: returns active for strong, quarantined for medium, discarded for weak (3 tests)
- [ ] 6.4 Run tests to verify decision policy works correctly

## Phase 7: Capture Module — Deduplication and Redaction

- [ ] 7.1 Implement findSimilarMemory function (match by kind + overlapping relatedFiles)
- [ ] 7.2 Implement redactCaptureText function (remove sk-, password=, api_key=, BEGIN PRIVATE KEY patterns)
- [ ] 7.3 Write unit tests for findSimilarMemory: finds duplicate, returns undefined when no match (2 tests)
- [ ] 7.4 Write unit tests for redactCaptureText: removes sk- tokens, removes password values (2 tests)
- [ ] 7.5 Run tests to verify deduplication and redaction work correctly

## Phase 8: CLI Integration

- [ ] 8.1 Implement handleMemoryCapture function in memoryCommands.ts (parse args, run pipeline, dry-run/apply modes, health check post-apply)
- [ ] 8.2 Implement handleMemoryPending function in memoryCommands.ts (list, clear --apply, clear dry-run)
- [ ] 8.3 Add "capture" and "pending" cases to handleMemory switch in memoryCommands.ts
- [ ] 8.4 Update showMemoryUsage help text with capture and pending commands
- [ ] 8.5 Write unit tests for CLI: capture --dry-run displays without writing, capture --apply writes to stores (2 tests)
- [ ] 8.6 Run typecheck and lint to verify CLI integration compiles cleanly

## Phase 9: Public API Exports

- [ ] 9.1 Add memoryCapture.ts function exports to src/index.ts
- [ ] 9.2 Add governance type exports to src/index.ts
- [ ] 9.3 Run typecheck to verify all exports resolve correctly

## Phase 10: Property-Based Tests

- [ ] 10.1 Create src/__tests__/memoryCapture.property.test.ts with arbitrary generators for CaptureAssessment, CaptureSignals, and log text
- [ ] 10.2 Implement Property 1: Redaction removes secret patterns (100 runs)
- [ ] 10.3 Implement Property 2: Decision determinism — same input produces same output (100 runs)
- [ ] 10.4 Implement Property 3: Active requires strong evidence — evidenceScore >= 6 AND riskScore <= 3 (100 runs)
- [ ] 10.5 Implement Property 4: Quarantined entries are disabled — pipeline sets enabled: false for quarantined status (100 runs)
- [ ] 10.6 Implement Property 5: Auto-captured entries never have authority "constraint" (100 runs)
- [ ] 10.7 Run all property tests and verify they pass

## Phase 11: Quality Gate Verification

- [ ] 11.1 Run full test suite (npm test) and verify all tests pass
- [ ] 11.2 Run typecheck (npm run typecheck) and verify zero errors
- [ ] 11.3 Run lint (npm run lint) and verify zero errors
- [ ] 11.4 Run build (npm run build) and verify successful compilation

