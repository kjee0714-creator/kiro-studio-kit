# Design: Prompt Budget Gate (Phase 4-P)

## Module: `src/core/promptBudgetGate.ts`
## Modes: minimal (3 memories), compact (6), full (12)
## Risk: inferred from task text keywords; high→full, medium→compact, low→minimal
## Integration: after applyMemoryInjectionPolicy, before formatMemorySection
## Governance: renderExecutionGovernanceSection gets optional `detail` param
## CLI: `ksk budget inspect`
## Meta: budget stats in MemoryInjectionMeta
