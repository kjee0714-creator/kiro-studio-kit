# Requirements: Prompt Budget Gate (Phase 4-P)

## Requirement 1: Budget Modes
- minimal/compact/full/auto; auto resolves based on taskRisk; high-risk → full

## Requirement 2: Apply Budget Gate
- Limits memory count per mode; does not mutate input; records omitted memories/context; estimatedTokensAfter <= Before

## Requirement 3: Memory Injection Integration
- Applied after Injection Policy; formatMemorySection uses budget-gated memories; usage persistence targets budget-gated memories only; meta includes budget info

## Requirement 4: Governance Detail Control
- full→full governance; minimal→short; compact→full; does not break existing rendering

## Requirement 5: CLI Inspect
- `ksk budget inspect` displays modes/limits/risk rules; read-only

## Requirement 6: Property-Based Tests
- includedMemories.length <= mode maxMemories (100 runs)
- omittedMemories count matches excluded (100 runs)
- input not mutated (100 runs)
- high-risk auto → full (100 runs)
- estimatedTokensAfter <= estimatedTokensBefore (100 runs)
