/**
 * プロンプト文字列をトリミングする。
 * - 末尾の空白行を除去
 * - 3行以上の連続空行を1行に圧縮
 * - 各行の末尾空白を除去
 *
 * 冪等性: trimSection(trimSection(x)) === trimSection(x)
 */
export function trimSection(text: string): string {
  let result = text;
  // 各行の末尾空白を除去
  result = result.replace(/[^\S\n]+$/gm, "");
  // 3行以上の連続空行を1行に圧縮
  result = result.replace(/\n{3,}/g, "\n\n");
  // 末尾の空白行を除去
  result = result.replace(/\n+$/, "\n");
  return result;
}
