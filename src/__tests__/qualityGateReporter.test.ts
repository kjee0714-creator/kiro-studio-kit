import { describe, it, expect } from "vitest";
import {
  formatGateResults,
  determineSkippableGates,
} from "../core/qualityGateReporter.js";
import type { GateResult, QualityGateReport } from "../core/qualityGateReporter.js";

describe("qualityGateReporter", () => {
  describe("formatGateResults", () => {
    it("成功したゲートを1行サマリーで報告する", () => {
      const report: QualityGateReport = {
        results: [{ name: "typecheck", status: "pass", durationMs: 1200 }],
        format: "compact",
      };
      const output = formatGateResults(report);
      expect(output).toContain("| typecheck | PASS | 1200ms |");
    });

    it("失敗したゲートの詳細（エラー・修正・再実行結果）を報告する", () => {
      const report: QualityGateReport = {
        results: [
          {
            name: "lint",
            status: "fail",
            durationMs: 800,
            error: "no-unused-vars",
            fix: "removed unused import",
            retryResult: "pass",
          },
        ],
        format: "full",
      };
      const output = formatGateResults(report);
      expect(output).toContain("| lint | FAIL | 800ms |");
      expect(output).toContain("  Error: no-unused-vars");
      expect(output).toContain("  Fix: removed unused import");
      expect(output).toContain("  Retry: PASS");
    });

    it("スキップされたゲートを1行で報告する", () => {
      const report: QualityGateReport = {
        results: [
          { name: "build", status: "skip", skipReason: ".md files only" },
        ],
        format: "compact",
      };
      const output = formatGateResults(report);
      expect(output).toContain("| build | SKIP | .md files only |");
    });

    it("テーブルヘッダーが含まれる", () => {
      const report: QualityGateReport = {
        results: [],
        format: "compact",
      };
      const output = formatGateResults(report);
      expect(output).toContain("| Gate | Result | Duration |");
      expect(output).toContain("|---|---|---|");
    });

    it("durationMs が未指定の場合はハイフンを表示する", () => {
      const report: QualityGateReport = {
        results: [{ name: "typecheck", status: "pass" }],
        format: "compact",
      };
      const output = formatGateResults(report);
      expect(output).toContain("| typecheck | PASS | -ms |");
    });

    it("失敗ゲートで error のみ指定された場合は Error 行のみ出力する", () => {
      const report: QualityGateReport = {
        results: [
          { name: "test", status: "fail", durationMs: 500, error: "assertion failed" },
        ],
        format: "full",
      };
      const output = formatGateResults(report);
      expect(output).toContain("  Error: assertion failed");
      expect(output).not.toContain("  Fix:");
      expect(output).not.toContain("  Retry:");
    });

    it("失敗ゲートで retryResult が fail の場合は FAIL と表示する", () => {
      const report: QualityGateReport = {
        results: [
          { name: "build", status: "fail", durationMs: 3000, retryResult: "fail" },
        ],
        format: "full",
      };
      const output = formatGateResults(report);
      expect(output).toContain("  Retry: FAIL");
    });

    it("skipReason が未指定の場合は空文字を表示する", () => {
      const report: QualityGateReport = {
        results: [{ name: "lint", status: "skip" }],
        format: "compact",
      };
      const output = formatGateResults(report);
      expect(output).toContain("| lint | SKIP |  |");
    });

    it("複数ゲートの混在結果を正しく出力する", () => {
      const results: GateResult[] = [
        { name: "typecheck", status: "pass", durationMs: 1000 },
        { name: "lint", status: "fail", durationMs: 500, error: "semi", fix: "added semicolons" },
        { name: "build", status: "skip", skipReason: "docs only" },
        { name: "test", status: "pass", durationMs: 2000 },
      ];
      const report: QualityGateReport = { results, format: "full" };
      const output = formatGateResults(report);

      expect(output).toContain("| typecheck | PASS | 1000ms |");
      expect(output).toContain("| lint | FAIL | 500ms |");
      expect(output).toContain("  Error: semi");
      expect(output).toContain("  Fix: added semicolons");
      expect(output).toContain("| build | SKIP | docs only |");
      expect(output).toContain("| test | PASS | 2000ms |");
    });
  });

  describe("determineSkippableGates", () => {
    it("変更ファイルが .md のみの場合に typecheck, lint, build を返す", () => {
      const result = determineSkippableGates(["README.md", "CHANGELOG.md"]);
      expect(result).toEqual(["typecheck", "lint", "build"]);
    });

    it("単一の .md ファイルでもスキップ対象を返す", () => {
      const result = determineSkippableGates(["docs/guide.md"]);
      expect(result).toEqual(["typecheck", "lint", "build"]);
    });

    it(".md 以外のファイルが混在する場合は空配列を返す", () => {
      const result = determineSkippableGates(["README.md", "src/index.ts"]);
      expect(result).toEqual([]);
    });

    it("すべて .ts ファイルの場合は空配列を返す", () => {
      const result = determineSkippableGates(["src/cli.ts", "src/core/utils.ts"]);
      expect(result).toEqual([]);
    });

    it("空配列の場合は空配列を返す", () => {
      const result = determineSkippableGates([]);
      expect(result).toEqual([]);
    });

    it(".md 拡張子の大文字小文字を区別する（.MD はスキップ対象外）", () => {
      const result = determineSkippableGates(["README.MD"]);
      expect(result).toEqual([]);
    });

    it(".markdown 拡張子はスキップ対象外", () => {
      const result = determineSkippableGates(["doc.markdown"]);
      expect(result).toEqual([]);
    });
  });
});
