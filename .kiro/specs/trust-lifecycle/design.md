# Design Document

## Overview

This design adds a Trust Lifecycle subsystem to KSK that automatically manages trust level transitions based on accumulated usage statistics and feedback. It introduces pure functions for lifecycle assessment and decision application, a persistence layer for batch lifecycle runs, manual verify/degrade commands, and health report integration.

## Architecture

### File Structure

```
src/core/
  memoryTrust.ts           — Extended with lifecycle pure functions
  memoryCommands.ts        — Extended with lifecycle CLI handlers
  memoryHealth.ts          — Extended with trust lifecycle stats
src/__tests__/
  trustLifecycle.test.ts          — Unit tests
  trustLifecycle.property.test.ts — Property-based tests (5 properties, 100 runs)
```

### Design Decisions

1. **Extend existing `memoryTrust.ts`**: The lifecycle logic is a natural extension of the existing trust assessment module. Adding it here avoids a new module and keeps trust-related pure functions co-located.

2. **Pure function layer**: `assessTrustLifecycleAction` and `applyTrustLifecycleDecision` are pure functions with no I/O. CLI handlers in `memoryCommands.ts` handle persistence and audit.

3. **Conservative auto-transitions**: Auto-upgrade caps at `trusted`. Auto-degrade only triggers on clear negative signals (rejectedSelections >= 3 AND rejections > successes). `verified` is manual-only.

4. **Existing `handleTrustUpgrade`/`handleTrustDegrade` coexistence**: The existing commands use `assessMemoryTrust` score-based recommendations. The new `trust lifecycle` command uses the new `assessTrustLifecycleAction` which has stricter, more conservative rules. Both can coexist — the lifecycle command is the recommended batch operation.

## Existing Trust Model

### TrustLevel Enum
```typescript
type TrustLevel = "probation" | "trusted" | "verified";
```

### TrustScore
- Numeric 0–100, computed by `assessMemoryTrust`
- Thresholds: >= 75 → verified recommendation, >= 40 → trusted, < 40 → probation
- Stored on entry as `trustScore?: number`

### Trust-Related Fields on DevMemoryEntry
```typescript
trustLevel?: TrustLevel;      // Current trust level
trustScore?: number;          // Last computed score
promotedAt?: string;          // When promoted to trusted
verifiedAt?: string;          // When verified
degradedAt?: string;          // When last degraded
usageStats?: MemoryUsageStats; // selectedCount, successfulSelections, rejectedSelections, etc.
```

## Lifecycle Decision Rules

### Auto-Upgrade: probation → trusted

All conditions must be met:
```
entry.trustLevel === "probation" (or undefined, treated as probation)
entry.usageStats.successfulSelections >= 3
entry.usageStats.rejectedSelections === 0
entry.usageStats.selectedCount >= 3
entry.deleted !== true
entry.enabled === true
entry.captureStatus !== "discarded"
```

Result: `{ action: "upgrade_to_trusted", reason: "Auto-upgrade: 3+ successful selections, 0 rejections" }`

### Auto-Degrade: trusted → probation

All conditions must be met:
```
entry.trustLevel === "trusted"
entry.usageStats.rejectedSelections >= 3
entry.usageStats.rejectedSelections > entry.usageStats.successfulSelections
entry.deleted !== true
entry.enabled === true
```

Result: `{ action: "degrade_to_probation", reason: "Auto-degrade: 3+ rejections exceeding successes" }`

### No-Op Cases (action: "none")
- `entry.deleted === true`
- `entry.enabled === false`
- `entry.captureStatus === "discarded"`
- `entry.trustLevel === "verified"` (never auto-modified)
- Entry does not meet upgrade or degrade criteria

### Manual Verify (action: "manual_verify")
- Never returned by `assessTrustLifecycleAction`
- Only used when `applyTrustLifecycleDecision` is called with an explicit manual_verify decision
- Sets `trustLevel = "verified"`, `verifiedAt = now`, `trustScore = 100`

## Module Extensions: `memoryTrust.ts`

### New Types

```typescript
export type TrustLifecycleAction =
  | "none"
  | "upgrade_to_trusted"
  | "degrade_to_probation"
  | "manual_verify";

export interface TrustLifecycleDecision {
  action: TrustLifecycleAction;
  reason: string;
  beforeTrustLevel: TrustLevel;
  afterTrustLevel: TrustLevel;
}
```

### New Functions

```typescript
/**
 * Assess what lifecycle action should be taken for an entry.
 * Pure function — never returns "manual_verify".
 */
export function assessTrustLifecycleAction(entry: DevMemoryEntry): TrustLifecycleDecision;

/**
 * Apply a lifecycle decision to an entry. Returns a new entry.
 * Pure function — does not mutate input.
 */
export function applyTrustLifecycleDecision(
  entry: DevMemoryEntry,
  decision: TrustLifecycleDecision,
  now?: Date,
): DevMemoryEntry;
```

## CLI Routing Changes

### New Commands

| Command | Handler | Description |
|---------|---------|-------------|
| `trust lifecycle` | `handleTrustLifecycle(args)` | Batch lifecycle run |
| `trust lifecycle --dry-run` | `handleTrustLifecycle(args)` | Preview only |
| `trust verify <id> [--reason]` | `handleTrustVerify(args)` | Manual verify |
| `trust degrade <id> [--reason]` | Existing `handleTrustDegrade(args)` extended | Manual degrade with audit |

### Routing Extension in `handleMemory`

The existing `trust` subcommand routing is extended:
```typescript
case "trust": {
  const trustSub = args[1];
  if (trustSub === "lifecycle") {
    await handleTrustLifecycle(args.slice(2));
  } else if (trustSub === "verify") {
    await handleTrustVerify(args.slice(2));
  } else if (trustSub === "upgrade") {
    await handleTrustUpgrade(args.slice(2));
  } else if (trustSub === "degrade") {
    await handleTrustDegrade(args.slice(2));
  } else if (trustSub === "audit") {
    await handleTrustAudit(args.slice(2));
  }
}
```

### `handleTrustLifecycle` Flow

```
CLI args → handleTrustLifecycle(args)
  → parse --dry-run flag
  → readMemoryEntries()
  → filter eligible entries (not deleted, enabled, not discarded)
  → assessTrustLifecycleAction(entry) for each
  → collect entries with action !== "none"
  → if dry-run: display candidates, return
  → applyTrustLifecycleDecision(entry, decision, now) for each
  → rewriteMemoryEntries(updated)
  → appendMemoryAuditEvent(...) for each [non-blocking]
  → display summary
```

### `handleTrustVerify` Flow

```
CLI args → handleTrustVerify(args)
  → parse id, --reason
  → readMemoryEntries()
  → find entry by id
  → validate: not deleted, enabled, exists
  → create manual_verify decision
  → applyTrustLifecycleDecision(entry, decision, now)
  → rewriteMemoryEntries(updated)
  → appendMemoryAuditEvent(...) [non-blocking]
  → display success
```

## Audit Event Schema

### trust_update Event

```typescript
{
  eventType: "trust_update",
  actor: "cli",
  memoryId: entry.id,
  source: "memoryCommands.handleTrustLifecycle" | "memoryCommands.handleTrustVerify" | "memoryCommands.handleTrustDegrade",
  reason: decision.reason,
  before: { trustLevel: beforeLevel, trustScore: beforeScore },
  after: { trustLevel: afterLevel, trustScore: afterScore },
  metadata: { operation: "lifecycle" | "manual_verify" | "manual_degrade" }
}
```

## Health Integration

### New Stats Fields

```typescript
stats: {
  // ... existing fields ...
  trustUpgradeCandidateCount?: number;
  trustDegradeCandidateCount?: number;
}
```

### New Findings

- `trustUpgradeCandidateCount > 0`: info finding, type `"stale"`, message: `"${n} entries eligible for trust upgrade (run: memory trust lifecycle)"`
- `trustDegradeCandidateCount > 0`: warning finding, type `"stale"`, message: `"${n} entries have high rejection rates and may need trust degrade"`

## Dry-Run Behavior

- `--dry-run` flag on `trust lifecycle` command
- When active: display candidates with their proposed action and reason
- No store writes
- No audit events
- Exit code 0 regardless of candidate count

## Error Handling

- **Entry not found**: Print error, exit(1)
- **Deleted entry targeted**: Print error, exit(1)
- **Disabled entry targeted** (for verify): Print error, exit(1)
- **Audit failures**: Wrapped in try/catch, never propagate
- **Empty store / no candidates**: Print message, exit(0)

## Dependencies

- No new runtime dependencies
- Uses existing: `memoryStore.ts`, `memoryAuditLog.ts`, `memoryValidator.ts`
- Test dependencies: `vitest`, `fast-check` (already in devDependencies)

## Public API Exports

From `src/index.ts`:
- Types: `TrustLifecycleAction`, `TrustLifecycleDecision`
- Functions: `assessTrustLifecycleAction`, `applyTrustLifecycleDecision`
- Handlers: `handleTrustLifecycle`, `handleTrustVerify`

## Correctness Properties

| # | Property | Pattern | Testable |
|---|----------|---------|----------|
| 1 | Auto-assessment never returns manual_verify | Invariant | yes - property |
| 2 | Auto-assessment never upgrades to verified | Invariant | yes - property |
| 3 | Deleted entries always get action "none" | Invariant | yes - property |
| 4 | Dry-run is side-effect-free | Idempotence | yes - property |
| 5 | Only manual_verify action can set verified | Invariant | yes - property |
