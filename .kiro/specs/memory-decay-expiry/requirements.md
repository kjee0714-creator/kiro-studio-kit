# Requirements: Memory Decay / Expiry (Phase 4-N)

## Requirement 1: Schema Extension
- Reuse existing `expiresAt?: string`; add `lastReviewedAt?: string`, `staleAfterDays?: number`
- Validation rejects invalid types; backward compatible

## Requirement 2: Decay Status
- expired: `expiresAt < now`; stale: no review within staleAfterDays; reviewDue: expired OR stale OR temporary without expiresAt
- Stale does NOT auto-disable

## Requirement 3: Injection Policy Expiry Handling
- Expired entries never selected; stale entries NOT excluded solely for being stale
- Stats include `expiredExcludedCount`

## Requirement 4: Decay Persistence Operations
- markMemoryReviewed / setMemoryExpiry / disableExpiredMemories
- dry-run does not modify store/audit; no physical deletion; audit non-blocking

## Requirement 5: CLI Decay Commands
- `decay inspect|list|review|set-expiry|disable-expired`

## Requirement 6: Health Integration
- expiredCount/staleCount/reviewDueCount/temporaryWithoutExpiryCount in stats

## Requirement 7: Property-Based Tests
- expired never selected (100 runs); stale not excluded solely for staleness (100 runs)
- markMemoryReviewed updates exactly requested IDs (100 runs)
- disableExpiredMemories dry-run does not modify store (100 runs)
- disableExpiredMemories never physically deletes (100 runs)
