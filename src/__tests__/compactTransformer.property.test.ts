import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  compactTransform,
  compressConsecutiveBlankLines,
  normalizeListItemSpacing,
} from "../core/compactTransformer.js";
import { estimateTokensFromChars } from "../core/tokenLedger.js";

describe("compactTransformer property tests", () => {
  /**
   * Property 2: コンパクト変換後に見出し行が存在しない
   * 任意の文字列に対して `compactTransform(text, { removeHeadings: true, ... })` の出力に
   * `^#+\s` にマッチする行がないことを検証
   * **Validates: Requirements 2.2**
   */
  it("Property 2: compactTransform 後に見出し行（^#+\\s）が存在しない", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const result = compactTransform(text, {
          removeHeadings: true,
          compressBlankLines: false,
          normalizeListSpacing: false,
        });
        const lines = result.split("\n");
        for (const line of lines) {
          expect(line).not.toMatch(/^#+\s/);
        }
      }),
      { numRuns: 1000 },
    );
  });

  /**
   * Property 3: コンパクト変換後に3行以上の連続空行が存在しない
   * 任意の文字列に対して `compressConsecutiveBlankLines(text)` の出力に
   * `\n{3,}` パターンがないことを検証
   * **Validates: Requirements 2.3**
   */
  it("Property 3: compressConsecutiveBlankLines 後に3行以上の連続空行が存在しない", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const result = compressConsecutiveBlankLines(text);
        expect(result).not.toMatch(/\n{3,}/);
      }),
      { numRuns: 1000 },
    );
  });

  /**
   * Property 8: 箇条書き正規化後のフォーマット一貫性
   * 任意の文字列に対して `normalizeListItemSpacing(text)` の箇条書き行が
   * `[-*+] ` 形式（記号 + 空白1つ + 非空白文字）で始まることを検証
   * **Validates: Requirements 2.4**
   */
  it("Property 8: normalizeListItemSpacing 後の箇条書き行が [-*+] 形式で始まる", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const result = normalizeListItemSpacing(text);
        const lines = result.split("\n");
        for (const line of lines) {
          if (line.match(/^[-*+]\s/) && line.match(/^[-*+]\s+\S/)) {
            // 箇条書き記号の後に空白+非空白文字がある行は、空白が1つであること
            expect(line).toMatch(/^[-*+] \S/);
          }
        }
      }),
      { numRuns: 1000 },
    );
  });

  /**
   * Property 6: トークン削減量は非負
   * 任意の入力に対して `estimateTokensFromChars(compactTransform(input)) <= estimateTokensFromChars(input)` を検証
   * **Validates: Requirements 3.1**
   */
  it("Property 6: compactTransform 後のトークン数は元のトークン数以下（削減量は非負）", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const originalTokens = estimateTokensFromChars(text);
        const compactedTokens = estimateTokensFromChars(compactTransform(text));
        expect(compactedTokens).toBeLessThanOrEqual(originalTokens);
      }),
      { numRuns: 1000 },
    );
  });
});
