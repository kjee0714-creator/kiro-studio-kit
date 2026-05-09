# Requirements Document

## Introduction

Phase 4-B: Auto Capture Governance MVP adds automated memory capture from CI/build log files with a quality-gated pipeline. The system extracts signals from log text, generates memory candidates, scores them using RCA-CAR methodology, and decides whether entries are saved as active, quarantined for review, or discarded. A separate pending store isolates quarantined entries from prompt injection. Secret redaction ensures no credentials leak into memory.

## Glossary

- **Capture_Pipeline**: The end-to-end process of extracting signals from log text, generating candidates, assessing quality, and deciding capture status.
- **Pending_Store**: A separate JSONL file (`.kiro/ksk/dev-memory.pending.jsonl`) that holds quarantined entries not injected into prompts.
- **Memory_Store**: The primary JSONL file (`.kiro/ksk/dev-memory.jsonl`) holding active DevMemoryEntry records.
- **Signal_Extractor**: The pure function that detects failed/passed gates, file paths, error signals, fix signals, and forbidden signals from log text.
- **Candidate_Generator**: The pure function that creates MemoryCaptureCandidate objects from extracted signals.
- **Assessment_Engine**: The pure function that computes RCA-CAR scores for a candidate.
- **Decision_Policy**: The pure function that maps assessment scores to active/quarantined/discarded status.
- **Redactor**: The pure function that removes secret patterns from text before saving.
- **RCA-CAR**: Root Cause Analysis — Corrective Action Review scoring methodology with six dimensions: incident, evidence, rootCause, correctiveAction, reusability, risk.
- **CLI_Capture_Command**: The `ksk memory capture <log-file>` subcommand.
- **CLI_Pending_Command**: The `ksk memory pending list|clear` subcommands.

## Requirements

### Requirement 1: Extended Data Model

**User Story:** As a developer, I want memory entries to carry governance metadata, so that the system can track provenance, trust level, and capture quality.

#### Acceptance Criteria

1. THE Memory_Store SHALL accept DevMemoryEntry records containing optional fields: `source`, `captureStatus`, `trustLevel`, `authority`, `evidence`, `captureAssessment`, `duplicateOf`, `occurrences`, `lastSeenAt`.
2. WHEN a DevMemoryEntry omits any governance field, THE Memory_Store SHALL treat the entry as valid (backward compatible).
3. THE Memory_Store SHALL validate `source` as one of "manual", "kiro_log", "imported" when present.
4. THE Memory_Store SHALL validate `captureStatus` as one of "active", "quarantined", "discarded" when present.
5. THE Memory_Store SHALL validate `trustLevel` as one of "probation", "trusted", "verified" when present.
6. THE Memory_Store SHALL validate `authority` as one of "hint", "rule", "constraint" when present.

### Requirement 2: Pending/Quarantine Store

**User Story:** As a developer, I want quarantined entries stored separately, so that unverified memories never pollute prompt injection.

#### Acceptance Criteria

1. THE Pending_Store SHALL persist quarantined entries to `.kiro/ksk/dev-memory.pending.jsonl` in JSONL format.
2. THE Pending_Store SHALL provide a `readPendingMemoryEntries` function that returns all valid entries from the pending file.
3. THE Pending_Store SHALL provide an `appendPendingMemoryEntry` function that appends a validated entry to the pending file.
4. WHEN the prompt injection pipeline runs, THE Memory_Store SHALL exclude entries from the Pending_Store.
5. WHEN the pending file does not exist, THE Pending_Store SHALL return an empty array without error.

### Requirement 3: Signal Extraction

**User Story:** As a developer, I want the system to detect quality gate signals from log text, so that capture candidates have evidence.

#### Acceptance Criteria

1. WHEN log text contains lines matching gate failure patterns (e.g., "FAILED", "error:", "✗"), THE Signal_Extractor SHALL populate `failedGate` in the returned CaptureSignals.
2. WHEN log text contains lines matching gate pass patterns (e.g., "PASSED", "✓", "ok"), THE Signal_Extractor SHALL populate `passedGate` in the returned CaptureSignals.
3. WHEN log text contains file path patterns, THE Signal_Extractor SHALL populate `filesChanged` in the returned CaptureSignals.
4. WHEN log text contains error message patterns, THE Signal_Extractor SHALL populate `errorSignals` in the returned CaptureSignals.
5. WHEN log text contains fix/resolution patterns, THE Signal_Extractor SHALL populate `fixSignals` in the returned CaptureSignals.
6. WHEN log text contains forbidden patterns (secrets, credentials), THE Signal_Extractor SHALL populate `forbiddenSignals` in the returned CaptureSignals.

### Requirement 4: Candidate Generation

**User Story:** As a developer, I want the system to generate structured memory candidates from signals, so that only actionable fix types are captured.

#### Acceptance Criteria

1. THE Candidate_Generator SHALL produce candidates only for kinds: `lint_fix`, `type_fix`, `test_fix`, `build_fix`, `schema_fix`.
2. WHEN signals contain a failed gate matching a supported kind, THE Candidate_Generator SHALL create a MemoryCaptureCandidate with appropriate kind, summary, trigger, fix, and futurePromptHint fields.
3. THE Candidate_Generator SHALL set `autoCaptured: true` and `source: "kiro_log"` on all generated candidates.
4. THE Candidate_Generator SHALL set `confidence: "medium"` and `trustLevel: "probation"` on all generated candidates.
5. IF no signals match any supported kind, THEN THE Candidate_Generator SHALL return an empty array.

### Requirement 5: RCA-CAR Assessment Scoring

**User Story:** As a developer, I want candidates scored on evidence quality, so that only well-evidenced memories become active.

#### Acceptance Criteria

1. THE Assessment_Engine SHALL compute `incidentScore` as: +3 if failedGate present, +2 if filesChanged present, +1 if fixSignals present.
2. THE Assessment_Engine SHALL compute `evidenceScore` as: +3 if failedGate present, +3 if matching passedGate present, +2 if errorSignals present, +2 if filesChanged present.
3. THE Assessment_Engine SHALL compute `rootCauseScore` as: +3 if kind is explicit (lint_fix/type_fix/test_fix/build_fix/schema_fix), +2 if errorSignals present, +1 if relatedSymbols non-empty.
4. THE Assessment_Engine SHALL compute `correctiveActionScore` as: +3 if futurePromptHint non-empty, +2 if fix non-empty, +1 if tags non-empty.
5. THE Assessment_Engine SHALL compute `reusabilityScore` as: +3 if relatedFiles non-empty, +2 if relatedSymbols or tags non-empty, +2 if futurePromptHint length >= 30 characters.
6. THE Assessment_Engine SHALL compute `riskScore` as: +5 if forbiddenSignals present, +4 if kind is design_decision/behavior_change/gotcha, +3 if no failedGate, +3 if no matching passedGate, +2 if no filesChanged, +2 if futurePromptHint is ambiguous (length < 15 characters).
7. THE Assessment_Engine SHALL compute `totalScore` as: incidentScore + evidenceScore + rootCauseScore + correctiveActionScore + reusabilityScore - riskScore.

### Requirement 6: Decision Policy

**User Story:** As a developer, I want deterministic capture decisions, so that the same input always produces the same outcome.

#### Acceptance Criteria

1. WHEN totalScore >= 12 AND riskScore <= 3 AND evidenceScore >= 6 AND correctiveActionScore >= 4, THE Decision_Policy SHALL return status "active".
2. WHEN the active criteria are not met AND (totalScore >= 7 OR (riskScore <= 6 AND evidenceScore >= 3)), THE Decision_Policy SHALL return status "quarantined".
3. WHEN neither active nor quarantine criteria are met, THE Decision_Policy SHALL return status "discarded".
4. THE Decision_Policy SHALL be a pure function producing identical output for identical input.

### Requirement 7: Deduplication

**User Story:** As a developer, I want duplicate candidates merged with existing entries, so that the memory store stays lean.

#### Acceptance Criteria

1. WHEN a candidate matches an existing entry by kind AND overlapping relatedFiles (at least one common file), THE Capture_Pipeline SHALL mark the candidate as `duplicateOf` the existing entry ID.
2. WHEN a duplicate is detected, THE Capture_Pipeline SHALL increment `occurrences` and update `lastSeenAt` on the existing entry instead of creating a new entry.
3. IF no existing entry matches, THEN THE Capture_Pipeline SHALL proceed with normal assessment and save.

### Requirement 8: Secret Redaction

**User Story:** As a developer, I want secrets removed from captured text before saving, so that credentials never persist in memory.

#### Acceptance Criteria

1. THE Redactor SHALL remove patterns matching: `sk-[a-zA-Z0-9]+`, `password=[^\s]+`, `api_key=[^\s]+`, `BEGIN PRIVATE KEY` blocks.
2. THE Redactor SHALL replace removed patterns with `[REDACTED]`.
3. WHEN the Redactor detects secrets that cannot be fully redacted, THE Capture_Pipeline SHALL block active save and set status to "quarantined" or "discarded".
4. FOR ALL input strings, parsing the Redactor output SHALL contain zero matches for the secret patterns (round-trip property).

### Requirement 9: CLI Capture Command

**User Story:** As a developer, I want a CLI command to run the capture pipeline on a log file, so that I can review and apply captures.

#### Acceptance Criteria

1. WHEN `ksk memory capture <log-file>` is invoked without flags, THE CLI_Capture_Command SHALL default to `--dry-run` mode.
2. WHEN `--dry-run` is active, THE CLI_Capture_Command SHALL display candidates and their assessments without writing to any store.
3. WHEN `--apply` is specified, THE CLI_Capture_Command SHALL write active entries to Memory_Store and quarantined entries to Pending_Store.
4. IF the log file does not exist, THEN THE CLI_Capture_Command SHALL print an error and exit with code 1.
5. WHEN `--apply` completes, THE CLI_Capture_Command SHALL run a health check and warn if health level is "warning" or "critical".

### Requirement 10: CLI Pending Commands

**User Story:** As a developer, I want to list and clear pending entries, so that I can review quarantined captures.

#### Acceptance Criteria

1. WHEN `ksk memory pending list` is invoked, THE CLI_Pending_Command SHALL display all entries from the Pending_Store with their ID, kind, summary, and captureAssessment totalScore.
2. WHEN `ksk memory pending clear --apply` is invoked, THE CLI_Pending_Command SHALL delete all entries from the Pending_Store.
3. WHEN `ksk memory pending clear` is invoked without `--apply`, THE CLI_Pending_Command SHALL display the count of entries that would be cleared without modifying the file.

### Requirement 11: Health Integration

**User Story:** As a developer, I want health checks after capture, so that I am warned if auto-capture degrades memory quality.

#### Acceptance Criteria

1. WHEN capture `--apply` completes, THE Capture_Pipeline SHALL invoke `calculateMemoryHealth` on the updated store.
2. WHEN health level is "warning" or "critical", THE Capture_Pipeline SHALL print a warning message with the health score and top finding.

### Requirement 12: Quarantined Entry Properties

**User Story:** As a developer, I want quarantined entries to be disabled by default, so that they cannot accidentally influence prompts.

#### Acceptance Criteria

1. THE Capture_Pipeline SHALL set `enabled: false` on all entries with captureStatus "quarantined".
2. THE Capture_Pipeline SHALL set `authority` to "hint" on all auto-captured entries (never "constraint").

