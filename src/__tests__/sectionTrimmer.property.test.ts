import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { trimSection } from "../core/sectionTrimmer.js";

/**
 * 非空白文字のみを抽出するヘルパー関数。
 * 空白の除去・圧縮のみで文字の追加・削除・並べ替えが行われないことを検証するために使用。
 */
function extractNonWhitespace(s: string): string {
  return s.replace(/\s/g, "");
}

describe("sectionTrimmer property tests", () => {
  /**
   * Property 4: セクショントリミングの冪等性
   * 任意の文字列に対して trimSection(trimSection(x)) === trimSection(x) を検証
   * **Validates: Requirements 4.5**
   */
  it("Property 4: trimSection は冪等である（2回適用しても結果が変わらない）", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const once = trimSection(text);
        const twice = trimSection(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 1000 },
    );
  });

  /**
   * Property 5: セクショントリミング後に末尾空白が存在しない
   * 任意の文字列に対して trimSection(text) の各行に末尾空白がないことを検証
   * **Validates: Requirements 4.3**
   */
  it("Property 5: trimSection 後の各行に末尾空白が存在しない", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const result = trimSection(text);
        const lines = result.split("\n");
        for (const line of lines) {
          expect(line).toBe(line.trimEnd());
        }
      }),
      { numRuns: 1000 },
    );
  });

  /**
   * Property 7: コンパクト変換が意味的内容を保持する
   * 任意の文字列に対して extractNonWhitespace(trimSection(text)) === extractNonWhitespace(text) を検証
   * **Validates: Requirements 4.4**
   */
  it("Property 7: trimSection は意味的内容（非空白文字の順序）を保持する", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const result = trimSection(text);
        expect(extractNonWhitespace(result)).toBe(extractNonWhitespace(text));
      }),
      { numRuns: 1000 },
    );
  });
});
