import { describe, it, expect } from "vitest";
import {
  compactTransform,
  removeHeadingLines,
  compressConsecutiveBlankLines,
  normalizeListItemSpacing,
} from "../core/compactTransformer.js";
import type { CompactOptions } from "../core/compactTransformer.js";

describe("compactTransformer", () => {
  describe("removeHeadingLines", () => {
    it("# で始まる見出し行を除去する", () => {
      const input = "# Title\nsome content\n## Subtitle\nmore content";
      const result = removeHeadingLines(input);
      expect(result).toBe("some content\nmore content");
    });

    it("見出し行がない場合はそのまま返す", () => {
      const input = "no headings here\njust text";
      const result = removeHeadingLines(input);
      expect(result).toBe(input);
    });

    it("#の後にスペースがない行は保持する", () => {
      const input = "#hashtag\n# Real Heading\n#another";
      const result = removeHeadingLines(input);
      expect(result).toBe("#hashtag\n#another");
    });

    it("空文字列はそのまま返す", () => {
      expect(removeHeadingLines("")).toBe("");
    });

    it("複数レベルの見出しをすべて除去する", () => {
      const input = "# H1\n## H2\n### H3\n#### H4\ncontent";
      const result = removeHeadingLines(input);
      expect(result).toBe("content");
    });
  });

  describe("compressConsecutiveBlankLines", () => {
    it("3行以上の連続空行を1行の空行に圧縮する", () => {
      const input = "line1\n\n\n\nline2";
      const result = compressConsecutiveBlankLines(input);
      expect(result).toBe("line1\n\nline2");
    });

    it("2行の連続空行はそのまま保持する", () => {
      const input = "line1\n\nline2";
      const result = compressConsecutiveBlankLines(input);
      expect(result).toBe("line1\n\nline2");
    });

    it("複数箇所の連続空行をそれぞれ圧縮する", () => {
      const input = "a\n\n\n\nb\n\n\n\n\nc";
      const result = compressConsecutiveBlankLines(input);
      expect(result).toBe("a\n\nb\n\nc");
    });

    it("空文字列はそのまま返す", () => {
      expect(compressConsecutiveBlankLines("")).toBe("");
    });

    it("改行がない文字列はそのまま返す", () => {
      expect(compressConsecutiveBlankLines("hello")).toBe("hello");
    });
  });

  describe("normalizeListItemSpacing", () => {
    it("箇条書き記号後の余分な空白を1つに正規化する", () => {
      const input = "-  item1\n*   item2\n+    item3";
      const result = normalizeListItemSpacing(input);
      expect(result).toBe("- item1\n* item2\n+ item3");
    });

    it("空白が1つの箇条書きはそのまま保持する", () => {
      const input = "- item1\n* item2\n+ item3";
      const result = normalizeListItemSpacing(input);
      expect(result).toBe(input);
    });

    it("箇条書きでない行は変更しない", () => {
      const input = "normal text\n  indented text\n    code block";
      const result = normalizeListItemSpacing(input);
      expect(result).toBe(input);
    });

    it("空文字列はそのまま返す", () => {
      expect(normalizeListItemSpacing("")).toBe("");
    });

    it("行頭以外の箇条書き記号は変更しない", () => {
      const input = "text -  not a list\nmore *   text";
      const result = normalizeListItemSpacing(input);
      expect(result).toBe(input);
    });
  });

  describe("compactTransform", () => {
    const allEnabled: CompactOptions = {
      removeHeadings: true,
      compressBlankLines: true,
      normalizeListSpacing: true,
    };

    it("全オプション有効時にすべての変換を適用する", () => {
      const input = "# Title\n\n\n\n-  item1\ncontent\n## Sub\n*   item2";
      const result = compactTransform(input, allEnabled);
      expect(result).not.toMatch(/^#+\s/m);
      expect(result).not.toMatch(/\n{3,}/);
      expect(result).not.toMatch(/^[-*+]\s{2,}/m);
    });

    it("removeHeadings のみ有効", () => {
      const options: CompactOptions = {
        removeHeadings: true,
        compressBlankLines: false,
        normalizeListSpacing: false,
      };
      const input = "# Title\n\n\n\n-  item";
      const result = compactTransform(input, options);
      expect(result).not.toMatch(/^#+\s/m);
      // 空行圧縮は無効なので連続空行が残る
      expect(result).toMatch(/\n{3,}/);
      // 箇条書き正規化は無効なので余分な空白が残る
      expect(result).toMatch(/^-\s{2,}/m);
    });

    it("compressBlankLines のみ有効", () => {
      const options: CompactOptions = {
        removeHeadings: false,
        compressBlankLines: true,
        normalizeListSpacing: false,
      };
      const input = "# Title\n\n\n\n-  item";
      const result = compactTransform(input, options);
      // 見出し除去は無効なので見出しが残る
      expect(result).toMatch(/^# Title/m);
      expect(result).not.toMatch(/\n{3,}/);
      // 箇条書き正規化は無効
      expect(result).toMatch(/^-\s{2,}/m);
    });

    it("normalizeListSpacing のみ有効", () => {
      const options: CompactOptions = {
        removeHeadings: false,
        compressBlankLines: false,
        normalizeListSpacing: true,
      };
      const input = "# Title\n\n\n\n-  item";
      const result = compactTransform(input, options);
      // 見出し除去は無効
      expect(result).toMatch(/^# Title/m);
      // 空行圧縮は無効
      expect(result).toMatch(/\n{3,}/);
      expect(result).not.toMatch(/^[-*+]\s{2,}/m);
    });

    it("全オプション無効時は入力をそのまま返す", () => {
      const options: CompactOptions = {
        removeHeadings: false,
        compressBlankLines: false,
        normalizeListSpacing: false,
      };
      const input = "# Title\n\n\n\n-  item";
      const result = compactTransform(input, options);
      expect(result).toBe(input);
    });

    it("デフォルトオプションで全変換が適用される", () => {
      const input = "# Title\n\n\n\n-  item";
      const result = compactTransform(input);
      expect(result).not.toMatch(/^#+\s/m);
      expect(result).not.toMatch(/\n{3,}/);
      expect(result).not.toMatch(/^[-*+]\s{2,}/m);
    });

    it("空文字列はそのまま返す", () => {
      expect(compactTransform("")).toBe("");
    });
  });
});
