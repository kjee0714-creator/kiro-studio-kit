import { readFile, writeFile, mkdir, access } from "fs/promises";
import { dirname } from "path";

/**
 * ファイルを UTF-8 テキストとして読み込む。
 * ファイルが存在しない場合は「ファイルが見つかりません: {path}」エラーをスロー。
 * 権限エラーの場合は「ファイルを読み込めません: {path}」エラーをスロー。
 */
export async function readTextFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, { encoding: "utf-8" });
  } catch (error: unknown) {
    if (isNodeError(error)) {
      if (error.code === "ENOENT") {
        throw new Error(`ファイルが見つかりません: ${filePath}`, { cause: error });
      }
      if (error.code === "EACCES") {
        throw new Error(`ファイルを読み込めません: ${filePath}`, { cause: error });
      }
    }
    throw error;
  }
}

/**
 * テキストをファイルに書き出す。
 * 親ディレクトリが存在しない場合は recursive: true で作成する。
 */
export async function writeTextFile(
  filePath: string,
  content: string,
): Promise<void> {
  try {
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
  } catch (error: unknown) {
    if (isNodeError(error)) {
      throw new Error(`ディレクトリを作成できません: ${dirname(filePath)}`, { cause: error });
    }
    throw error;
  }

  try {
    await writeFile(filePath, content, { encoding: "utf-8" });
  } catch (error: unknown) {
    if (isNodeError(error)) {
      throw new Error(`ファイルを書き込めません: ${filePath}`, { cause: error });
    }
    throw error;
  }
}

/**
 * ファイルの存在確認。
 * ファイルが存在すれば true、存在しなければ false を返す。
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Node.js のファイルシステムエラーかどうかを判定する型ガード */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
