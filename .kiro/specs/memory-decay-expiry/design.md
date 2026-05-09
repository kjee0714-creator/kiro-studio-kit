# Design: Memory Decay / Expiry (Phase 4-N)

## Schema: Reuse `expiresAt`, add `lastReviewedAt?: string`, `staleAfterDays?: number`
## Module: `src/core/memoryDecay.ts`
## Injection Policy: Add expired exclusion as Step 2 (after ineligible, before scope)
## CLI: `memory decay inspect|list|review|set-expiry|disable-expired`
## Health: Add decay stats and findings
## Audit: `manual_update` with operations `mark_reviewed`/`set_expiry`/`disable_expired`
