import { describe, it, expect } from "vitest";
import { selectPromptModeFromTask } from "../core/autoModeResolver.js";
import type { ParsedTask } from "../core/promptGenerator.js";

/** ヘルパー: goal のみ指定した ParsedTask を作成する */
function taskWithGoal(goal: string): ParsedTask {
  return { goal, scope: "", nonGoals: "" };
}

describe("autoModeResolver - selectPromptModeFromTask", () => {
  describe("Safety_Keyword による full 強制", () => {
    it("Safety_Keyword を含むタスクで 'full' を返す (e.g., 'schema migration needed')", () => {
      const task = taskWithGoal("schema migration needed");
      const decision = selectPromptModeFromTask(task);
      expect(decision.resolvedMode).toBe("full");
      expect(decision.requestedMode).toBe("auto");
    });
  });

  describe("Minimal_Keyword のみのタスク", () => {
    it("Minimal_Keyword のみのタスクで 'minimal' を返す (e.g., 'typo fix in README')", () => {
      const task = taskWithGoal("typo fix in README");
      const decision = selectPromptModeFromTask(task);
      expect(decision.resolvedMode).toBe("minimal");
      expect(decision.score).toBeLessThanOrEqual(0);
    });
  });

  describe("キーワードなしのデフォルト動作", () => {
    it("キーワードなしのタスクで 'compact' を返す (e.g., 'update something')", () => {
      const task = taskWithGoal("update something");
      const decision = selectPromptModeFromTask(task);
      expect(decision.resolvedMode).toBe("compact");
    });
  });

  describe("refactor / リファクタ キーワード", () => {
    it("'refactor' を含むタスクで 'full' を返す", () => {
      const task = taskWithGoal("refactor the module structure");
      const decision = selectPromptModeFromTask(task);
      expect(decision.resolvedMode).toBe("full");
    });

    it("'リファクタ' を含むタスクで 'full' を返す", () => {
      const task = taskWithGoal("コードのリファクタリングを行う");
      const decision = selectPromptModeFromTask(task);
      expect(decision.resolvedMode).toBe("full");
    });
  });

  describe("英語キーワードの単語境界マッチング", () => {
    it("'capability' が 'api' にマッチしないこと", () => {
      const task = taskWithGoal("improve capability of the system");
      const decision = selectPromptModeFromTask(task);
      // "api" は "capability" の部分文字列だが、単語境界マッチにより検出されない
      const hasApiReason = decision.reasons.some((r) => r.includes("API"));
      expect(hasApiReason).toBe(false);
    });
  });

  describe("日本語キーワードの部分文字列マッチング", () => {
    it("'設計変更' が '設計' にマッチすること", () => {
      const task = taskWithGoal("設計変更を実施する");
      const decision = selectPromptModeFromTask(task);
      const hasDesignReason = decision.reasons.some((r) => r.includes("設計"));
      expect(hasDesignReason).toBe(true);
    });
  });

  describe("reasons の内容", () => {
    it("キーワードなし時に reasons に 'no keyword matched → default compact' が含まれること", () => {
      const task = taskWithGoal("do something ordinary");
      const decision = selectPromptModeFromTask(task);
      expect(decision.reasons).toContain("no keyword matched → default compact");
    });
  });

  describe("Full_Keyword と Minimal_Keyword の混合時のスコア判定", () => {
    it("Full_Keyword と Minimal_Keyword の混合時にスコアに基づいて判定されること", () => {
      // "feature" (+1) と "typo" (-1) → score = 0 → minimal
      // ただし safety keyword がないので score で判定
      const task = taskWithGoal("feature typo");
      const decision = selectPromptModeFromTask(task);
      expect(decision.score).toBe(0);
      expect(decision.resolvedMode).toBe("minimal");

      // 複数の Full_Keyword で score >= 1 → compact
      const task2 = taskWithGoal("feature API typo");
      const decision2 = selectPromptModeFromTask(task2);
      expect(decision2.score).toBe(1); // +1 (feature) +1 (API) -1 (typo) = 1
      expect(decision2.resolvedMode).toBe("compact");
    });
  });

  describe("nonGoals はスコアリング対象外", () => {
    it("nonGoals の 'schema変更はしない' では full にならない", () => {
      const task: ParsedTask = {
        goal: "CLIの出力メッセージを改善する",
        scope: "既存挙動を維持",
        nonGoals: "schema変更はしない",
      };
      const decision = selectPromptModeFromTask(task);
      expect(decision.resolvedMode).not.toBe("full");
      const hasSchemaReason = decision.reasons.some((r) => r.includes("schema"));
      expect(hasSchemaReason).toBe(false);
    });

    it("nonGoals の 'API変更はしない' は加点されない", () => {
      const task: ParsedTask = {
        goal: "表示文言を調整する",
        scope: "通常の表示文言",
        nonGoals: "API変更はしない",
      };
      const decision = selectPromptModeFromTask(task);
      const hasApiReason = decision.reasons.some((r) => r.includes("API"));
      expect(hasApiReason).toBe(false);
    });

    it("nonGoals の '設計変更はしない' は加点されない", () => {
      const task: ParsedTask = {
        goal: "表示文言を調整する",
        scope: "通常の表示文言",
        nonGoals: "設計変更はしない",
      };
      const decision = selectPromptModeFromTask(task);
      const hasDesignReason = decision.reasons.some((r) => r.includes("設計"));
      expect(hasDesignReason).toBe(false);
    });

    it("goal に schema がある場合は従来通り full", () => {
      const task: ParsedTask = {
        goal: "schema を変更する",
        scope: "",
        nonGoals: "",
      };
      const decision = selectPromptModeFromTask(task);
      expect(decision.resolvedMode).toBe("full");
    });

    it("scope に schema がある場合は従来通り full", () => {
      const task: ParsedTask = {
        goal: "DBを更新する",
        scope: "schema migration を含む",
        nonGoals: "",
      };
      const decision = selectPromptModeFromTask(task);
      expect(decision.resolvedMode).toBe("full");
    });

    it("goal に refactor がある場合は従来通り full", () => {
      const task: ParsedTask = {
        goal: "refactor the module",
        scope: "",
        nonGoals: "",
      };
      const decision = selectPromptModeFromTask(task);
      expect(decision.resolvedMode).toBe("full");
    });

    it("goal に リファクタ がある場合は従来通り full", () => {
      const task: ParsedTask = {
        goal: "コードのリファクタリング",
        scope: "",
        nonGoals: "",
      };
      const decision = selectPromptModeFromTask(task);
      expect(decision.resolvedMode).toBe("full");
    });
  });
});
