/**
 * コンパクトモード時の変換ロジックを集約する純粋関数モジュール。
 * - 見出し行（# で始まる行）を除去
 * - 3行以上の連続空行を1行に圧縮
 * - 箇条書き記号後の余分な空白を正規化
 */

export interface CompactOptions {
  removeHeadings: boolean;
  compressBlankLines: boolean;
  normalizeListSpacing: boolean;
}

const DEFAULT_OPTIONS: CompactOptions = {
  removeHeadings: true,
  compressBlankLines: true,
  normalizeListSpacing: true,
};

/**
 * テキストをコンパクト形式に変換する。
 * オプションに応じて見出し除去、空行圧縮、箇条書き正規化を適用する。
 */
export function compactTransform(
  text: string,
  options: CompactOptions = DEFAULT_OPTIONS,
): string {
  let result = text;
  if (options.removeHeadings) {
    result = removeHeadingLines(result);
  }
  if (options.compressBlankLines) {
    result = compressConsecutiveBlankLines(result);
  }
  if (options.normalizeListSpacing) {
    result = normalizeListItemSpacing(result);
  }
  return result;
}

/** 見出し行（`#+\s` で始まる行）を除去する */
export function removeHeadingLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.match(/^#+\s/))
    .join("\n");
}

/** 3行以上の連続空行を1行の空行に圧縮する */
export function compressConsecutiveBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n");
}

/** 箇条書き記号（-*+）後の余分な空白を1つに正規化する */
export function normalizeListItemSpacing(text: string): string {
  return text.replace(/^([-*+])\s{2,}/gm, "$1 ");
}
