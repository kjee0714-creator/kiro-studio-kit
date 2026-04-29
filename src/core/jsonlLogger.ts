import { appendFile, mkdir, readFile } from "fs/promises";
import { dirname } from "path";
import { fileExists } from "./fileUtils.js";

/**
 * JSONL ファイルに1行追記する。
 * 親ディレクトリが存在しない場合は自動作成する。
 *
 * @param filePath - 追記先の JSONL ファイルパス
 * @param record - 追記するレコード（JSON シリアライズ可能なオブジェクト）
 * @param label - エラーメッセージ用のラベル（例: "実験ログ", "トークン台帳"）
 * @returns 追記先のファイルパス
 */
export async function appendJsonlRecord<T>(
  filePath: string,
  record: T,
  label: string,
): Promise<string> {
  const dir = dirname(filePath);

  try {
    await mkdir(dir, { recursive: true });
  } catch (error: unknown) {
    throw new Error(`${label}ディレクトリを作成できません: ${dir}`, { cause: error });
  }

  const line = JSON.stringify(record) + "\n";

  try {
    await appendFile(filePath, line, { encoding: "utf-8" });
  } catch {
    // 1回だけリトライ
    try {
      await appendFile(filePath, line, { encoding: "utf-8" });
    } catch (retryError: unknown) {
      throw new Error(`${label}を書き込めません: ${filePath}`, { cause: retryError });
    }
  }

  return filePath;
}

/**
 * JSONL 文字列を行ごとにパースする。
 * 壊れた行はスキップする。
 */
export function parseJsonlLines<T>(content: string): T[] {
  const results: T[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      results.push(JSON.parse(trimmed) as T);
    } catch {
      // 壊れた行はスキップ
    }
  }
  return results;
}

/**
 * JSONL ファイルを安全に読み込む。
 * ファイルが存在しない場合は空配列を返す。
 * 壊れた行はスキップする。
 */
export async function readJsonlFile<T>(filePath: string): Promise<T[]> {
  if (!(await fileExists(filePath))) {
    return [];
  }
  const content = await readFile(filePath, { encoding: "utf-8" });
  return parseJsonlLines<T>(content);
}
