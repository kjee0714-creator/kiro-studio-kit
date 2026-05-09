/**
 * secretsGuard.ts
 * Detects potential secret patterns in DevMemoryEntry text fields.
 * Advisory only — warns but does not block writes.
 */

import type { DevMemoryEntry } from "./memoryValidator.js";

/** Patterns that indicate potential secrets (case-insensitive) */
export const SECRET_PATTERNS: readonly RegExp[] = [
  /sk-/i,
  /BEGIN PRIVATE KEY/i,
  /password=/i,
  /api_key/i,
  /secret/i,
];

/** Text fields to check for secrets */
const TEXT_FIELDS_TO_CHECK: readonly (keyof DevMemoryEntry)[] = [
  "summary",
  "trigger",
  "fix",
  "futurePromptHint",
];

/**
 * Check text fields for secret patterns.
 * Returns warning messages (empty array = clean).
 */
export function checkForSecrets(entry: DevMemoryEntry): string[] {
  const warnings: string[] = [];

  for (const field of TEXT_FIELDS_TO_CHECK) {
    const value = entry[field];
    if (typeof value !== "string") continue;

    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(value)) {
        warnings.push(
          `⚠️  Potential secret detected in "${field}": matches pattern ${pattern.source}`,
        );
      }
    }
  }

  return warnings;
}
