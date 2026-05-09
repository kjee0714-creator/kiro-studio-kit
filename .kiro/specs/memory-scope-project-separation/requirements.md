# Requirements: Memory Scope / Project Separation (Phase 4-M)

## Requirement 1: Schema Extension
- Reuse existing `project?: string` as projectId
- Add `scope?: "global" | "project" | "domain" | "temporary"` 
- Add `domains?: string[]`
- Validation rejects invalid types; backward compatible

## Requirement 2: Load Scope Context
- Load `.kiro/memory-scope.json`; missing → default; invalid → default + warning
- Never block prompt generation

## Requirement 3: Scope Filtering
- global: included when `includeGlobal=true`
- project: included when `projectId` matches `currentProjectId`
- domain: included when `domains` intersects `allowedDomains`
- temporary: included when `includeTemporary=true`
- unscoped (no scope field): included when `includeUnscoped=true`
- Scope-excluded entries get decisions/stats

## Requirement 4: Injection Integration
- `injectMemorySection` loads scope context and passes to policy
- Meta includes scope info; usage persistence uses post-policy entries

## Requirement 5: Scope CLI Commands
- `scope inspect` / `set` / `show` / `list`

## Requirement 6: Property-Based Tests
- project scoped with non-matching projectId never selected (100 runs)
- global entries selected when includeGlobal=true (100 runs)
- unscoped excluded when includeUnscoped=false (100 runs)
- setMemoryScope updates exactly requested IDs (100 runs)
- scope filtering does not mutate input entries (100 runs)
