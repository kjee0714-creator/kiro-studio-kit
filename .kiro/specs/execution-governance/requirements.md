# Requirements Document

## Introduction

This feature adds Execution Governance to KSK. It allows governance rules (quality gates, stop conditions, escalation rules) to be loaded from configuration files and injected into generated prompts. The governance section instructs AI implementers on what quality gates to run, when to stop, and when to escalate to humans. This phase does NOT auto-execute any commands — it only renders rules into the prompt.

## Requirements

### Requirement 1: Load Quality Gate Manifest

**User Story:** As a developer, I want quality gate configuration loaded from `.kiro/quality-gates.json`, so that my project's required gates are included in prompts.

#### Acceptance Criteria

1. WHEN `.kiro/quality-gates.json` exists and is valid, THE loader SHALL use its contents
2. WHEN `.kiro/quality-gates.json` does not exist, THE loader SHALL use default values without error
3. WHEN `.kiro/quality-gates.json` contains invalid JSON, THE loader SHALL use defaults and add a warning
4. WHEN `.kiro/quality-gates.json` contains valid JSON but invalid schema, THE loader SHALL use defaults and add a warning
5. THE loader SHALL never cause prompt generation to fail

### Requirement 2: Load Stop Conditions

**User Story:** As a developer, I want stop conditions loaded from `.kiro/stop-conditions.json`, so that AI agents know when to halt.

#### Acceptance Criteria

1. WHEN `.kiro/stop-conditions.json` exists and is valid, THE loader SHALL use its contents
2. WHEN `.kiro/stop-conditions.json` does not exist, THE loader SHALL use default values without error
3. WHEN `.kiro/stop-conditions.json` contains invalid JSON or schema, THE loader SHALL use defaults and add a warning
4. THE loader SHALL never cause prompt generation to fail

### Requirement 3: Load Escalation Rules

**User Story:** As a developer, I want escalation rules loaded from `.kiro/escalation-rules.md`, so that AI agents know when to ask for human help.

#### Acceptance Criteria

1. WHEN `.kiro/escalation-rules.md` exists and has content, THE loader SHALL use its contents
2. WHEN `.kiro/escalation-rules.md` does not exist, THE loader SHALL use default escalation text
3. WHEN `.kiro/escalation-rules.md` is empty, THE loader SHALL use defaults and add a warning
4. THE loader SHALL never cause prompt generation to fail

### Requirement 4: Render Governance Section

**User Story:** As a developer, I want governance rules rendered into a prompt section, so that AI agents can follow them during implementation.

#### Acceptance Criteria

1. THE rendered section SHALL include required quality gates as a list
2. THE rendered section SHALL include stop conditions as human-readable rules
3. THE rendered section SHALL include escalation rules
4. WHEN warnings exist, THE section SHALL still render without error
5. WHEN required gates array is empty, THE section SHALL render without error

### Requirement 5: Prompt Generation Integration

**User Story:** As a developer, I want governance rules automatically included in generated prompts.

#### Acceptance Criteria

1. WHEN `generatePrompt` is called, THE governance section SHALL be appended to the prompt content
2. THE `GenerateResult` SHALL include a `governance` metadata field with source info and warning count
3. WHEN governance loading fails entirely, THE prompt generation SHALL still complete successfully
4. THE governance section SHALL be separate from the memory injection section

### Requirement 6: CLI Inspect

**User Story:** As a developer, I want to inspect the current governance configuration via CLI.

#### Acceptance Criteria

1. WHEN `ksk governance inspect` is invoked, THE CLI SHALL display quality gates, stop conditions, escalation rules, sources, and warnings
2. THE CLI SHALL indicate whether each config came from file or default

### Requirement 7: Property-Based Tests

#### Acceptance Criteria

1. FOR ALL valid ExecutionGovernanceConfig, `renderExecutionGovernanceSection` SHALL not throw
2. FOR ALL configs with required gates, those gates SHALL appear in the rendered section
3. FOR ALL configs with stop condition numbers, those numbers SHALL appear in the rendered section
4. FOR ALL missing-file scenarios, loading SHALL return defaults without throwing
5. FOR ALL configs, warning count in metadata SHALL match the warnings array length
