# Implementation Plan: Development Memory

## Overview

Implement the Development Memory feature for kiro-studio-kit — a structured "lessons learned" system that stores typed memory entries in JSONL and injects relevant entries into generated prompts via rule-based scoring. Implementation follows a foundation-first approach: types/validation → storage → scoring/selection → formatting/injection → CLI commands → prompt integration → logging.

## Tasks

- [x] 1. Implement memoryValidator module
  - [x] 1.1 Create `src/core/memoryValidator.ts` with type definitions and validation
    - Define `DevMemoryKind`, `Severity`, `Confidence`, `MemoryMode` types
    - Define `DevMemoryEntry` interface with all required and optional fields
    - Export `VALID_KINDS`, `VALID_SEVERITIES`, `VALID_CONFIDENCES` constants
    - Implement `validateDevMemoryEntry(input: unknown): ValidationResult` with field-level error messages
    - Implement `isValidDevMemoryEntry` type guard
    - Validation checks: non-null object, non-empty required strings, valid enum values, correct array types, boolean enabled
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [x] 1.2 Write property test for memoryValidator
    - **Property 1: Validation accepts valid entries and rejects invalid entries**
    - Create `src/__tests__/memoryValidator.property.test.ts`
    - Use fast-check to generate valid DevMemoryEntry objects → assert `success: true, errors: []`
    - Use fast-check to generate objects with at least one invalid field → assert `success: false` with non-empty errors
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8**

  - [x] 1.3 Write unit tests for memoryValidator
    - Create `src/__tests__/memoryValidator.test.ts`
    - Test specific valid entry passes validation
    - Test empty summary, invalid kind, missing enabled, non-array relatedFiles
    - Test optional fields accepted when present
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [x] 2. Implement secretsGuard module
  - [x] 2.1 Create `src/core/secretsGuard.ts` with secret pattern detection
    - Export `SECRET_PATTERNS` array of RegExp patterns for: `sk-`, `BEGIN PRIVATE KEY`, `password=`, `api_key`, `secret`
    - Implement `checkForSecrets(entry: DevMemoryEntry): string[]` that checks summary, trigger, fix, futurePromptHint
    - Use case-insensitive matching
    - Return warning messages (empty array = clean)
    - _Requirements: 9.1, 9.2_

  - [x] 2.2 Write property test for secretsGuard
    - **Property 11: Secrets guard detects known patterns**
    - Create `src/__tests__/secretsGuard.property.test.ts`
    - Use fast-check to generate entries with secret patterns injected into text fields → assert non-empty warnings
    - **Validates: Requirements 9.1**

  - [x] 2.3 Write unit tests for secretsGuard
    - Create `src/__tests__/secretsGuard.test.ts`
    - Test each pattern individually (sk-, BEGIN PRIVATE KEY, password=, api_key, secret)
    - Test clean entry returns empty array
    - Test detection is advisory (does not throw)
    - _Requirements: 9.1, 9.2_

- [x] 3. Implement memoryStore module
  - [x] 3.1 Create `src/core/memoryStore.ts` with CRUD operations
    - Define `MEMORY_STORE_PATH` constant as `.kiro/ksk/dev-memory.jsonl`
    - Implement `readMemoryEntries(storePath?)` using existing `readJsonlFile` from jsonlLogger.ts
    - Filter out invalid entries using `isValidDevMemoryEntry` during read
    - Implement `appendMemoryEntry(entry, storePath?)` using existing `appendJsonlRecord`
    - Validate entry before writing; throw on validation failure
    - Run `checkForSecrets` and emit warnings to stderr before writing
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 3.2 Write property test for memoryStore round-trip
    - **Property 2: JSONL serialization round-trip**
    - Create `src/__tests__/memoryStore.property.test.ts`
    - Use fast-check to generate valid DevMemoryEntry → write to temp file → read back → assert deep equality
    - **Validates: Requirements 2.3, 2.4, 12.19**

  - [x] 3.3 Write unit tests for memoryStore
    - Create `src/__tests__/memoryStore.test.ts`
    - Test auto-creation of store file and parent directories
    - Test reading from non-existent file returns empty array
    - Test corrupt JSONL lines are skipped
    - Test validation failure throws on write
    - _Requirements: 12.5, 12.6, 12.7_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement memorySelector module
  - [x] 5.1 Create `src/core/memorySelector.ts` with scoring and selection logic
    - Implement exclusion filters: disabled, low confidence, expired, superseded
    - Implement `scoreEntry(entry, taskText): number` as a pure function with additive scoring
    - Implement kind relevance mapping (test_fix → "test"/"spec"/"vitest"/"jest", etc.)
    - Implement `selectMemoryEntries(entries, taskText, mode): SelectionResult`
    - Auto mode: score > 0, top 5, ≤ 2000 chars, sorted by score descending
    - Full mode: enabled && confidence ≠ "low", ≤ 10000 chars
    - Off mode: return empty selection
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 6.13, 6.14_

  - [x] 5.2 Write property tests for memorySelector
    - Create `src/__tests__/memorySelector.property.test.ts`
    - **Property 3: Exclusion filter correctness** — never includes disabled/low-confidence/expired/superseded entries
    - **Property 4: Scoring additivity** — score equals sum of individual scoring rules
    - **Property 5: Auto mode respects constraints** — at most 5 entries, all score > 0, ≤ 2000 chars, sorted descending
    - **Property 6: Full mode respects constraints** — only enabled && confidence ≠ "low", ≤ 10000 chars
    - **Property 7: Off mode returns empty selection** — selectedCount === 0
    - **Validates: Requirements 6.1–6.14**

  - [x] 5.3 Write unit tests for memorySelector
    - Create `src/__tests__/memorySelector.test.ts`
    - Test specific scoring scenarios with known entries and task text
    - Test exclusion of disabled, low-confidence, expired, superseded entries
    - Test auto mode limit of 5 entries
    - Test score 0 entries excluded in auto mode
    - _Requirements: 12.8, 12.9, 12.10, 12.11, 12.12, 12.13, 12.14, 12.15_

- [x] 6. Implement memoryInjector module
  - [x] 6.1 Create `src/core/memoryInjector.ts` with formatting and injection pipeline
    - Implement `formatMemorySection(entries: DevMemoryEntry[]): string`
    - Format with `## Development Memory / 再発防止メモ` header and disclaimer
    - Number each entry with summary, kind, related, trigger, fix, futurePromptHint
    - Return empty string when entries array is empty
    - Implement `injectMemorySection(taskText, mode, storePath?)` that orchestrates: read store → select → format
    - Return `{ section, meta: MemoryInjectionMeta }`
    - _Requirements: 7.4, 7.5, 7.6, 7.7_

  - [x] 6.2 Write property tests for memoryInjector
    - Create `src/__tests__/memoryInjector.property.test.ts`
    - **Property 8: Memory section presence is determined by selection count** — non-empty entries → non-empty section with header; empty entries → empty string
    - **Property 9: Formatted entry contains all required fields** — output contains summary, kind, trigger, fix, futurePromptHint as substrings
    - **Validates: Requirements 7.4, 7.5, 7.6**

  - [x] 6.3 Write unit tests for memoryInjector
    - Create `src/__tests__/memoryInjector.test.ts`
    - Test format output structure (header, disclaimer, numbered entries)
    - Test empty entries returns empty string
    - Test injection pipeline end-to-end with mock store
    - _Requirements: 7.4, 7.5, 7.6, 7.7_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement memoryCommands module and CLI integration
  - [x] 8.1 Create `src/core/memoryCommands.ts` with CLI handlers
    - Implement `handleMemoryAdd(args)`: parse --kind, --summary, --trigger, --fix, --hint, --files, --symbols, --tags, --severity, --confidence
    - Generate UUID via `crypto.randomUUID()`, set createdAt to ISO string
    - Apply defaults: severity="medium", confidence="high", enabled=true, arrays=[]
    - Validate required flags; display usage + exit 1 on missing
    - Implement `handleMemoryList(args)`: read entries, filter enabled, sort by createdAt desc, display id/kind/summary/createdAt
    - Implement `handleMemorySearch(args)`: case-insensitive partial match across summary/trigger/fix/futurePromptHint/tags/relatedSymbols/relatedFiles
    - Implement `handleMemory(args)` router for add/list/search subcommands
    - _Requirements: 3.1–3.12, 4.1–4.3, 5.1–5.4_

  - [x] 8.2 Write property test for search case-insensitivity
    - Create `src/__tests__/memorySearch.property.test.ts`
    - **Property 10: Search is case-insensitive** — searching with any casing returns same set of matching entry ids
    - **Validates: Requirements 5.4**

  - [x] 8.3 Write unit tests for memoryCommands
    - Create `src/__tests__/memoryCommands.test.ts`
    - Test flag parsing and defaults for `memory add`
    - Test missing required flags shows error
    - Test `memory list` output format
    - Test `memory search` with matching and non-matching queries
    - _Requirements: 3.1–3.12, 4.1–4.3, 5.1–5.4_

  - [x] 8.4 Integrate `memory` subcommand into `src/cli.ts`
    - Import `handleMemory` from memoryCommands.ts
    - Add `"memory"` case to the switch statement in `main()`
    - Update `showUsage()` to include memory subcommand documentation
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 9. Integrate memory injection into promptGenerator
  - [x] 9.1 Add `--memory` option parsing to CLI and wire into generatePrompt
    - Add `parseMemoryMode(args)` function to `src/cli.ts`
    - Pass memory mode through `GenerateOptions` to `generatePrompt`
    - Add `memory?: MemoryMode` to `GenerateOptions` interface
    - Validate --memory value (auto/off/full); error + exit 1 on invalid
    - Default to "auto" when --memory is omitted
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 9.2 Modify `generatePrompt` in `src/core/promptGenerator.ts` to inject memory section
    - Import `injectMemorySection` from memoryInjector.ts
    - After prompt assembly, call `injectMemorySection(taskContent, memoryMode)`
    - Append returned section string to `finalPromptContent` (before output)
    - Ensure existing promptMode/compactMode/output behavior is preserved
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.8_

  - [x] 9.3 Extend ExperimentRecord with memory metadata
    - Add `developmentMemory?: MemoryInjectionMeta` to ExperimentRecord interface in experimentLogger.ts
    - Pass memory injection metadata into experiment log record in generatePrompt
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 9.4 Write integration tests for memory injection in prompt generation
    - Test `generatePrompt` with memory mode "auto" produces memory section when entries exist
    - Test `generatePrompt` with memory mode "off" produces no memory section
    - Test experiment log contains `developmentMemory` metadata
    - _Requirements: 12.16, 12.17, 12.18_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Update public API exports and README
  - [x] 11.1 Update `src/index.ts` with new public exports
    - Export types: `DevMemoryEntry`, `DevMemoryKind`, `Severity`, `Confidence`, `MemoryMode`, `SelectionResult`, `MemoryInjectionMeta`
    - Export functions: `validateDevMemoryEntry`, `isValidDevMemoryEntry`, `readMemoryEntries`, `appendMemoryEntry`, `selectMemoryEntries`, `scoreEntry`, `formatMemorySection`, `injectMemorySection`, `checkForSecrets`
    - _Requirements: 1.1, 1.2_

  - [x] 11.2 Update README.md with Development Memory documentation
    - Add Development Memory section explaining feature overview
    - Document three modes (auto/off/full) and their behavior
    - Document CLI commands: `memory add`, `memory list`, `memory search` with all options
    - Update `prompt` command signature to include `--memory` option
    - Add security note about not storing secrets in memory entries
    - _Requirements: 11.1, 11.2, 11.3_

- [x] 12. Final checkpoint - Ensure all tests pass and quality gates pass
  - Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document and are required for quality assurance
- Unit tests validate specific examples and edge cases
- All 6 new modules are in `src/core/` following existing project conventions
- Reuses existing `jsonlLogger.ts` infrastructure — no new JSONL implementation needed
- Zero runtime dependencies maintained — hand-written validation instead of Zod
