/**
 * memoryStore.ts
 * CRUD operations on the DevMemory JSONL store.
 * Reuses existing jsonlLogger infrastructure with validation layer.
 */

import { appendJsonlRecord, readJsonlFile } from "./jsonlLogger.js";
import { validateDevMemoryEntry, isValidDevMemoryEntry } from "./memoryValidator.js";
import { checkForSecrets } from "./secretsGuard.js";
import { writeTextFile, fileExists } from "./fileUtils.js";
import { mkdir, copyFile } from "fs/promises";
import { dirname } from "path";
import type { DevMemoryEntry } from "./memoryValidator.js";

/** Default store path */
export const MEMORY_STORE_PATH = ".kiro/ksk/dev-memory.jsonl";

/** Pending/quarantine store path */
export const PENDING_STORE_PATH = ".kiro/ksk/dev-memory.pending.jsonl";

/**
 * Read all valid entries from the store.
 * Invalid/corrupt lines are skipped with a warning to stderr.
 */
export async function readMemoryEntries(storePath?: string): Promise<DevMemoryEntry[]> {
  const filePath = storePath ?? MEMORY_STORE_PATH;
  const rawEntries = await readJsonlFile<unknown>(filePath);

  const validEntries: DevMemoryEntry[] = [];
  for (const raw of rawEntries) {
    if (isValidDevMemoryEntry(raw)) {
      validEntries.push(raw);
    } else {
      console.warn(`⚠️  Invalid memory entry skipped in ${filePath}`);
    }
  }

  return validEntries;
}

/**
 * Append a validated entry to the store.
 * Throws on validation failure.
 * Emits warnings to stderr if secrets are detected (does not block).
 */
export async function appendMemoryEntry(
  entry: DevMemoryEntry,
  storePath?: string,
): Promise<string> {
  const filePath = storePath ?? MEMORY_STORE_PATH;

  // Validate before writing
  const validation = validateDevMemoryEntry(entry);
  if (!validation.success) {
    throw new Error(
      `DevMemoryEntry validation failed: ${validation.errors.join("; ")}`,
    );
  }

  // Check for secrets (advisory only)
  const warnings = checkForSecrets(entry);
  for (const warning of warnings) {
    console.warn(warning);
  }

  // Write to store
  await appendJsonlRecord(filePath, entry, "DevMemory");

  return filePath;
}

/**
 * Rewrite the entire memory store with the provided entries.
 * Used for state-change operations (disable, enable, delete, supersede).
 * Validates all entries before writing.
 */
export async function rewriteMemoryEntries(
  entries: DevMemoryEntry[],
  storePath?: string,
): Promise<string> {
  const filePath = storePath ?? MEMORY_STORE_PATH;

  // Validate all entries before writing
  for (const entry of entries) {
    const validation = validateDevMemoryEntry(entry);
    if (!validation.success) {
      throw new Error(
        `DevMemoryEntry validation failed for id="${entry.id}": ${validation.errors.join("; ")}`,
      );
    }
  }

  // Write all entries as JSONL
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const content = entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length > 0 ? "\n" : "");
  await writeTextFile(filePath, content);

  return filePath;
}

/**
 * Create a timestamped backup of the memory store.
 * Returns the backup file path.
 * Format: .kiro/ksk/dev-memory.backup-YYYYMMDD.jsonl
 */
export async function backupMemoryStore(
  storePath?: string,
): Promise<string> {
  const filePath = storePath ?? MEMORY_STORE_PATH;
  const dir = dirname(filePath);

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const backupPath = `${dir}/dev-memory.backup-${dateStr}.jsonl`;

  await mkdir(dir, { recursive: true });

  if (await fileExists(filePath)) {
    await copyFile(filePath, backupPath);
  } else {
    // If store doesn't exist, create empty backup
    await writeTextFile(backupPath, "");
  }

  return backupPath;
}

/**
 * Read all valid entries from the pending store.
 * Invalid/corrupt lines are skipped.
 */
export async function readPendingMemoryEntries(storePath?: string): Promise<DevMemoryEntry[]> {
  const filePath = storePath ?? PENDING_STORE_PATH;
  const rawEntries = await readJsonlFile<unknown>(filePath);

  const validEntries: DevMemoryEntry[] = [];
  for (const raw of rawEntries) {
    if (isValidDevMemoryEntry(raw)) {
      validEntries.push(raw);
    }
  }

  return validEntries;
}

/**
 * Append a validated entry to the pending store.
 * Throws on validation failure.
 */
export async function appendPendingMemoryEntry(
  entry: DevMemoryEntry,
  storePath?: string,
): Promise<string> {
  const filePath = storePath ?? PENDING_STORE_PATH;

  const validation = validateDevMemoryEntry(entry);
  if (!validation.success) {
    throw new Error(
      `DevMemoryEntry validation failed: ${validation.errors.join("; ")}`,
    );
  }

  await appendJsonlRecord(filePath, entry, "PendingMemory");

  return filePath;
}

/**
 * Clear the pending store by writing an empty string.
 */
export async function clearPendingStore(storePath?: string): Promise<void> {
  const filePath = storePath ?? PENDING_STORE_PATH;
  await writeTextFile(filePath, "");
}

/**
 * Rewrite the pending store with the provided entries.
 * Used for removing entries from the pending store after promotion.
 */
export async function rewritePendingMemoryEntries(
  entries: DevMemoryEntry[],
  storePath?: string,
): Promise<string> {
  const filePath = storePath ?? PENDING_STORE_PATH;

  for (const entry of entries) {
    const validation = validateDevMemoryEntry(entry);
    if (!validation.success) {
      throw new Error(
        `DevMemoryEntry validation failed for id="${entry.id}": ${validation.errors.join("; ")}`,
      );
    }
  }

  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const content = entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length > 0 ? "\n" : "");
  await writeTextFile(filePath, content);

  return filePath;
}
