# Tasks

## 1. Inspect Existing Flow
- [x] 1.1 Review `promptGenerator.ts` for `generatePrompt` pipeline and `GenerateResult`
- [x] 1.2 Review `cli.ts` for command routing structure
- [x] 1.3 Review existing validation style (hand-written, no zod)

## 2. Create Execution Governance Module
- [ ] 2.1 Create `src/core/executionGovernance.ts` with type definitions
- [ ] 2.2 Add default constants and file path constants
- [ ] 2.3 Implement schema validation helpers
- [ ] 2.4 Implement `loadExecutionGovernance(options?)`
- [ ] 2.5 Implement `renderExecutionGovernanceSection(config)`

## 3. Integrate into Prompt Generator
- [ ] 3.1 Add `governance` field to `GenerateResult` interface
- [ ] 3.2 Call `loadExecutionGovernance` and `renderExecutionGovernanceSection` in `generatePrompt`
- [ ] 3.3 Append governance section to prompt content (after memory, before write)
- [ ] 3.4 Populate governance metadata in result

## 4. Add CLI Command
- [ ] 4.1 Add `governance` case to CLI switch in `cli.ts`
- [ ] 4.2 Implement `handleGovernanceInspect()` display

## 5. Update Public API Exports
- [ ] 5.1 Export types, functions, and constants from `src/index.ts`

## 6. Unit Tests
- [ ] 6.1 Create `src/__tests__/executionGovernance.test.ts`
- [ ] 6.2 Test: load with missing files returns defaults
- [ ] 6.3 Test: load with valid files uses file content
- [ ] 6.4 Test: load with invalid JSON returns defaults + warning
- [ ] 6.5 Test: load with invalid schema returns defaults + warning
- [ ] 6.6 Test: load with empty escalation rules returns default + warning
- [ ] 6.7 Test: render includes required gates
- [ ] 6.8 Test: render includes stop conditions
- [ ] 6.9 Test: render includes escalation rules
- [ ] 6.10 Test: render with empty gates array does not throw
- [ ] 6.11 Test: render with warnings does not throw

## 7. Property-Based Tests
- [ ] 7.1 Create `src/__tests__/executionGovernance.property.test.ts`
- [ ] 7.2 Property: renderExecutionGovernanceSection never throws for valid configs
- [ ] 7.3 Property: required gates appear in rendered section
- [ ] 7.4 Property: stop condition numbers appear in rendered section
- [ ] 7.5 Property: loading with missing files returns defaults
- [ ] 7.6 Property: warning count matches warnings array length

## 8. Quality Gates
- [ ] 8.1 Run `npm run typecheck`
- [ ] 8.2 Run `npm run lint`
- [ ] 8.3 Run `npm run test`
- [ ] 8.4 Run `npm run build`
