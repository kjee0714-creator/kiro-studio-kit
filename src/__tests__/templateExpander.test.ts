import { describe, it, expect } from "vitest";
import { expandTemplate } from "../core/templateExpander.js";

describe("expandTemplate", () => {
  it("{{goal}} が展開される", () => {
    const result = expandTemplate("Task: {{goal}}", { goal: "認証機能を実装する" });
    expect(result).toBe("Task: 認証機能を実装する");
  });

  it("{{scope}} が展開される", () => {
    const result = expandTemplate("Scope: {{scope}}", { scope: "バックエンドのみ" });
    expect(result).toBe("Scope: バックエンドのみ");
  });

  it("{{nonGoals}} が展開される", () => {
    const result = expandTemplate("Skip: {{nonGoals}}", { nonGoals: "フロントエンド" });
    expect(result).toBe("Skip: フロントエンド");
  });

  it("{{qualityGates}} が展開される", () => {
    const result = expandTemplate("Gates: {{qualityGates}}", { qualityGates: "typecheck, test" });
    expect(result).toBe("Gates: typecheck, test");
  });

  it("{{completionCriteria}} が展開される", () => {
    const result = expandTemplate("Done: {{completionCriteria}}", { completionCriteria: "全テスト通過" });
    expect(result).toBe("Done: 全テスト通過");
  });

  it("複数の変数を同時に展開する", () => {
    const template = "Goal: {{goal}}, Scope: {{scope}}";
    const result = expandTemplate(template, { goal: "A", scope: "B" });
    expect(result).toBe("Goal: A, Scope: B");
  });

  it("未定義の変数は空文字列に置換される", () => {
    const result = expandTemplate("Value: {{unknown}}", {});
    expect(result).toBe("Value: ");
  });

  it("変数を含まないテンプレートはそのまま返す", () => {
    const template = "No variables here";
    const result = expandTemplate(template, { goal: "test" });
    expect(result).toBe("No variables here");
  });

  it("空文字列テンプレートは空文字列を返す", () => {
    expect(expandTemplate("", {})).toBe("");
  });

  it("日本語の値が正しく展開される", () => {
    const result = expandTemplate(
      "目標: {{goal}}\nスコープ: {{scope}}",
      { goal: "ユーザー認証機能を実装する", scope: "バックエンド API のみ" },
    );
    expect(result).toContain("ユーザー認証機能を実装する");
    expect(result).toContain("バックエンド API のみ");
  });

  it("同じ変数が複数回出現しても全て展開される", () => {
    const result = expandTemplate("{{goal}} and {{goal}}", { goal: "test" });
    expect(result).toBe("test and test");
  });
});
