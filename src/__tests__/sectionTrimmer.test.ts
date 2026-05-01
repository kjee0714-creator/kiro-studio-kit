import { describe, it, expect } from "vitest";
import { trimSection } from "../core/sectionTrimmer.js";

describe("sectionTrimmer", () => {
  describe("trimSection - 末尾空白行の除去", () => {
    it("末尾の空白行を除去し、末尾に改行1つを残す", () => {
      const input = "line1\nline2\n\n\n";
      const result = trimSection(input);
      expect(result).toBe("line1\nline2\n");
    });

    it("末尾に複数の空白行がある場合もすべて除去する", () => {
      const input = "content\n\n\n\n\n";
      const result = trimSection(input);
      expect(result).toBe("content\n");
    });

    it("末尾に改行が1つだけの場合はそのまま保持する", () => {
      const input = "line1\nline2\n";
      const result = trimSection(input);
      expect(result).toBe("line1\nline2\n");
    });

    it("末尾に改行がない場合はそのまま返す（改行は追加しない）", () => {
      const input = "line1\nline2";
      const result = trimSection(input);
      expect(result).toBe("line1\nline2");
    });

    it("本文の途中の空行は保持する", () => {
      const input = "line1\n\nline2\n";
      const result = trimSection(input);
      expect(result).toBe("line1\n\nline2\n");
    });
  });

  describe("trimSection - 連続空行の圧縮", () => {
    it("3行の連続空行を1行に圧縮する", () => {
      const input = "line1\n\n\nline2\n";
      const result = trimSection(input);
      expect(result).toBe("line1\n\nline2\n");
    });

    it("4行以上の連続空行を1行に圧縮する", () => {
      const input = "line1\n\n\n\n\nline2\n";
      const result = trimSection(input);
      expect(result).toBe("line1\n\nline2\n");
    });

    it("2行の連続空行はそのまま保持する", () => {
      const input = "line1\n\nline2\n";
      const result = trimSection(input);
      expect(result).toBe("line1\n\nline2\n");
    });

    it("複数箇所の連続空行をそれぞれ圧縮する", () => {
      const input = "a\n\n\n\nb\n\n\n\n\nc\n";
      const result = trimSection(input);
      expect(result).toBe("a\n\nb\n\nc\n");
    });

    it("連続空行がない場合は変更しない", () => {
      const input = "line1\nline2\nline3\n";
      const result = trimSection(input);
      expect(result).toBe("line1\nline2\nline3\n");
    });
  });

  describe("trimSection - 行末空白の除去", () => {
    it("各行の末尾スペースを除去する", () => {
      const input = "line1   \nline2  \nline3\n";
      const result = trimSection(input);
      expect(result).toBe("line1\nline2\nline3\n");
    });

    it("各行の末尾タブを除去する", () => {
      const input = "line1\t\nline2\t\t\nline3\n";
      const result = trimSection(input);
      expect(result).toBe("line1\nline2\nline3\n");
    });

    it("行末空白がない行は変更しない", () => {
      const input = "line1\nline2\n";
      const result = trimSection(input);
      expect(result).toBe("line1\nline2\n");
    });

    it("行の先頭インデントは保持する", () => {
      const input = "  indented line  \n    deeper indent\t\n";
      const result = trimSection(input);
      expect(result).toBe("  indented line\n    deeper indent\n");
    });

    it("空白のみの行は空行になる", () => {
      const input = "line1\n   \nline2\n";
      const result = trimSection(input);
      expect(result).toBe("line1\n\nline2\n");
    });
  });

  describe("trimSection - 複合ケース", () => {
    it("行末空白・連続空行・末尾空白行をすべて処理する", () => {
      const input = "line1   \n\n\n\nline2  \n\n\n";
      const result = trimSection(input);
      expect(result).toBe("line1\n\nline2\n");
    });

    it("実際のプロンプト断片に対して正しく動作する", () => {
      const input =
        "## Role: Director   \n\nYou are a director.   \n\n\n\nYour task is to plan.  \n\n\n";
      const result = trimSection(input);
      expect(result).toBe("## Role: Director\n\nYou are a director.\n\nYour task is to plan.\n");
    });
  });

  describe("trimSection - エッジケース", () => {
    it("空文字列はそのまま返す", () => {
      const result = trimSection("");
      expect(result).toBe("");
    });

    it("空白のみの文字列は空文字列を返す", () => {
      const result = trimSection("   ");
      expect(result).toBe("");
    });

    it("改行のみの文字列は改行1つを返す", () => {
      // \n{3,} → \n\n に圧縮後、末尾の \n+ → \n に置換されるため \n が残る
      const result = trimSection("\n\n\n");
      expect(result).toBe("\n");
    });

    it("空白と改行のみの文字列は改行1つを返す", () => {
      // 各行の末尾空白除去後に空行のみになり、末尾の \n+ → \n に置換
      const result = trimSection("  \n  \n  \n");
      expect(result).toBe("\n");
    });

    it("1行のみのテキストを正しく処理する（末尾空白を除去）", () => {
      // 末尾に改行がないため \n+$ パターンにマッチせず、改行は追加されない
      const result = trimSection("single line  ");
      expect(result).toBe("single line");
    });

    it("改行を含まない空白のみの文字列を処理する", () => {
      const result = trimSection("     ");
      expect(result).toBe("");
    });
  });

  describe("trimSection - 冪等性", () => {
    it("同じ入力に2回適用した結果が1回適用した結果と同一である", () => {
      const inputs = [
        "line1   \n\n\n\nline2  \n\n\n",
        "## Heading\n\ncontent\n",
        "  indented  \n\n\n  more  \n",
        "",
        "single line",
        "\n\n\n",
        "  \n  \n  \n",
      ];
      for (const input of inputs) {
        const once = trimSection(input);
        const twice = trimSection(once);
        expect(twice).toBe(once);
      }
    });
  });
});
