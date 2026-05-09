# Design: Memory Scope / Project Separation (Phase 4-M)

## Schema: Reuse `project?: string`, add `scope?: MemoryScope`, `domains?: string[]`
## Module: `src/core/memoryScope.ts` — loader, helpers, persistence
## Config: `.kiro/memory-scope.json`
## Injection Policy: Add `scopeContext` to config, scope filtering after ineligible exclusion (Step 1.5)
## CLI: `memory scope inspect|set|show|list`
## Audit: `manual_update` with `operation: "set_scope"`
