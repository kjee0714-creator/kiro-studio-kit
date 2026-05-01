import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseTaskFile, assemblePrompt, assembleMinimalPrompt, resolvePromptMode, escapeRegExp } from "../core/promptGenerator.js";
import type {
  ParsedTask,
  RoleTemplates,
  RuleTemplates,
  GenerateOptions,
  TokenReduction,
} from "../core/promptGenerator.js";
import { compactTransform } from "../core/compactTransformer.js";
import { trimSection } from "../core/sectionTrimmer.js";
import { estimateTokensFromChars } from "../core/tokenLedger.js";

describe("parseTaskFile", () => {
  const DEFAULT_SCOPE =
    "（Scope は task.md に記載されていません。必要に応じて定義してください。）";
  const DEFAULT_NON_GOALS =
    "（Non-goals は task.md に記載されていません。必要に応じて定義してください。）";

  it("空ファイル入力時にデフォルト値を返す", () => {
    const result = parseTaskFile("");

    expect(result.goal).toBe("");
    expect(result.scope).toBe(DEFAULT_SCOPE);
    expect(result.nonGoals).toBe(DEFAULT_NON_GOALS);
  });

  it("Goal のみ含むファイルを正しく解析する", () => {
    const content = `## Goal
タスク管理ツールを作成する
`;

    const result = parseTaskFile(content);

    expect(result.goal).toBe("タスク管理ツールを作成する");
    expect(result.scope).toBe(DEFAULT_SCOPE);
    expect(result.nonGoals).toBe(DEFAULT_NON_GOALS);
  });

  it("全セクション含むファイルを正しく解析する", () => {
    const content = `## Goal
プロンプト生成ツールを作成する

## Scope
Phase 1 の CLI 実装のみ

## Non-goals
LLM API 連携は対象外
`;

    const result = parseTaskFile(content);

    expect(result.goal).toBe("プロンプト生成ツールを作成する");
    expect(result.scope).toBe("Phase 1 の CLI 実装のみ");
    expect(result.nonGoals).toBe("LLM API 連携は対象外");
  });

  it("セクション順序が異なる場合でも正しく解析する", () => {
    const content = `## Non-goals
テストは対象外

## Goal
新機能を実装する

## Scope
バックエンドのみ
`;

    const result = parseTaskFile(content);

    expect(result.goal).toBe("新機能を実装する");
    expect(result.scope).toBe("バックエンドのみ");
    expect(result.nonGoals).toBe("テストは対象外");
  });

  it("余分な空白が trim される", () => {
    const content = `## Goal

  前後に空白がある内容  

## Scope

  スコープの内容  

## Non-goals

  非目標の内容  

`;

    const result = parseTaskFile(content);

    expect(result.goal).toBe("前後に空白がある内容");
    expect(result.scope).toBe("スコープの内容");
    expect(result.nonGoals).toBe("非目標の内容");
  });
});

/**
 * Arbitrary that generates strings safe for embedding inside markdown sections.
 * Excludes '#' entirely so generated content cannot accidentally form `## ` headers.
 */
const safeStringArb = fc.stringOf(
  fc.char().filter((c) => c !== "#"),
);

describe("Property-Based Tests", () => {
  /**
   * **Validates: Requirements 2.2, 2.3, 2.4**
   *
   * For any random Goal, Scope, Non-goals content strings (that don't contain
   * markdown heading markers), embedding them into a document with the
   * appropriate `## ` headers and round-tripping through `parseTaskFile`
   * should yield the original trimmed content.
   */
  it("Feature: kiro-studio-kit, Property 1: セクション抽出ラウンドトリップ", () => {
    fc.assert(
      fc.property(
        safeStringArb,
        safeStringArb,
        safeStringArb,
        (goal, scope, nonGoals) => {
          const markdown = `## Goal\n${goal}\n\n## Scope\n${scope}\n\n## Non-goals\n${nonGoals}\n`;
          const result = parseTaskFile(markdown);
          expect(result.goal).toBe(goal.trim());
          expect(result.scope).toBe(scope.trim());
          expect(result.nonGoals).toBe(nonGoals.trim());
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.5, 2.6**
   *
   * For any Markdown text that does NOT contain `## Scope`, `parseTaskFile`
   * should return the default scope placeholder. Similarly, for any Markdown
   * text that does NOT contain `## Non-goals`, `parseTaskFile` should return
   * the default nonGoals placeholder.
   */
  it("Feature: kiro-studio-kit, Property 2: 欠落セクションのデフォルトプレースホルダー — Scope", () => {
    fc.assert(
      fc.property(
        safeStringArb.filter((s) => !s.includes("## Scope")),
        (content) => {
          const result = parseTaskFile(content);
          expect(result.scope).toBe(
            "（Scope は task.md に記載されていません。必要に応じて定義してください。）",
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Feature: kiro-studio-kit, Property 2: 欠落セクションのデフォルトプレースホルダー — Non-goals", () => {
    fc.assert(
      fc.property(
        safeStringArb.filter((s) => !s.includes("## Non-goals")),
        (content) => {
          const result = parseTaskFile(content);
          expect(result.nonGoals).toBe(
            "（Non-goals は task.md に記載されていません。必要に応じて定義してください。）",
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.2, 4.3**
   *
   * For any random `ParsedTask` and `RoleTemplates`, `assemblePrompt` output
   * must have sections in this fixed order:
   * 1. `## Goal` before `## Scope`
   * 2. `## Scope` before `## Non-goals`
   * 3. `## Non-goals` before `## Role Sequence`
   * 4. `### 1. Director` before `### 2. Architect`
   * 5. `### 2. Architect` before `### 3. Implementer`
   * 6. `### 3. Implementer` before `### 4. QA`
   */
  it("Feature: kiro-studio-kit, Property 3: 出力セクション順序の保証", () => {
    const parsedTaskArb = fc.record({
      goal: safeStringArb,
      scope: safeStringArb,
      nonGoals: safeStringArb,
    });

    const roleTemplatesArb = fc.record({
      director: safeStringArb,
      architect: safeStringArb,
      implementer: safeStringArb,
      qa: safeStringArb,
    });

    fc.assert(
      fc.property(parsedTaskArb, roleTemplatesArb, (task, roles) => {
        const output = assemblePrompt(task, roles);

        const goalIdx = output.indexOf("## Goal");
        const scopeIdx = output.indexOf("## Scope");
        const nonGoalsIdx = output.indexOf("## Non-goals");
        const contextManifestIdx = output.indexOf("## Context Manifest");
        const directorIdx = output.indexOf("### 1. Director");
        const architectIdx = output.indexOf("### 2. Architect");
        const implementerIdx = output.indexOf("### 3. Implementer");
        const qaIdx = output.indexOf("### 4. QA");
        const implRulesIdx = output.indexOf("## Implementation Rules");

        // All sections must be present
        expect(goalIdx).not.toBe(-1);
        expect(scopeIdx).not.toBe(-1);
        expect(nonGoalsIdx).not.toBe(-1);
        expect(contextManifestIdx).not.toBe(-1);
        expect(directorIdx).not.toBe(-1);
        expect(architectIdx).not.toBe(-1);
        expect(implementerIdx).not.toBe(-1);
        expect(qaIdx).not.toBe(-1);
        expect(implRulesIdx).not.toBe(-1);

        // Verify fixed ordering
        expect(goalIdx).toBeLessThan(scopeIdx);
        expect(scopeIdx).toBeLessThan(nonGoalsIdx);
        expect(nonGoalsIdx).toBeLessThan(contextManifestIdx);
        expect(contextManifestIdx).toBeLessThan(directorIdx);
        expect(directorIdx).toBeLessThan(architectIdx);
        expect(architectIdx).toBeLessThan(implementerIdx);
        expect(implementerIdx).toBeLessThan(qaIdx);
        expect(qaIdx).toBeLessThan(implRulesIdx);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.2, 4.3 (extended with rules)**
   *
   * When rules are provided, Token Economy Rules comes after QA,
   * and Anti-Runaway Rules comes after Token Economy Rules.
   */
  it("Feature: kiro-studio-kit, Property 3 extended: ルール付き出力セクション順序の保証", () => {
    const parsedTaskArb = fc.record({
      goal: safeStringArb,
      scope: safeStringArb,
      nonGoals: safeStringArb,
    });

    const roleTemplatesArb = fc.record({
      director: safeStringArb,
      architect: safeStringArb,
      implementer: safeStringArb,
      qa: safeStringArb,
    });

    const ruleTemplatesArb = fc.record({
      tokenEconomy: safeStringArb,
      antiRunaway: safeStringArb,
      qualityGates: safeStringArb,
      completionCriteria: safeStringArb,
    });

    fc.assert(
      fc.property(
        parsedTaskArb,
        roleTemplatesArb,
        ruleTemplatesArb,
        (task, roles, rules) => {
          const output = assemblePrompt(task, roles, rules);

          const goalIdx = output.indexOf("## Goal");
          const scopeIdx = output.indexOf("## Scope");
          const nonGoalsIdx = output.indexOf("## Non-goals");
          const contextManifestIdx = output.indexOf("## Context Manifest");
          const directorIdx = output.indexOf("### 1. Director");
          const architectIdx = output.indexOf("### 2. Architect");
          const implementerIdx = output.indexOf("### 3. Implementer");
          const qaIdx = output.indexOf("### 4. QA");
          const implRulesIdx = output.indexOf("## Implementation Rules");
          const tokenEconomyIdx = output.indexOf("## Token Economy Rules");
          const antiRunawayIdx = output.indexOf("## Anti-Runaway Rules");
          const qualityGatesIdx = output.indexOf("## Quality Gates");
          const completionCriteriaIdx = output.indexOf("## Completion Criteria");
          const requiredFinalReportIdx = output.indexOf("## Required Final Report");

          // All sections must be present
          expect(goalIdx).not.toBe(-1);
          expect(scopeIdx).not.toBe(-1);
          expect(nonGoalsIdx).not.toBe(-1);
          expect(contextManifestIdx).not.toBe(-1);
          expect(directorIdx).not.toBe(-1);
          expect(architectIdx).not.toBe(-1);
          expect(implementerIdx).not.toBe(-1);
          expect(qaIdx).not.toBe(-1);
          expect(implRulesIdx).not.toBe(-1);
          expect(tokenEconomyIdx).not.toBe(-1);
          expect(antiRunawayIdx).not.toBe(-1);
          expect(qualityGatesIdx).not.toBe(-1);
          expect(completionCriteriaIdx).not.toBe(-1);
          expect(requiredFinalReportIdx).not.toBe(-1);

          // Verify fixed ordering including rules
          expect(goalIdx).toBeLessThan(scopeIdx);
          expect(scopeIdx).toBeLessThan(nonGoalsIdx);
          expect(nonGoalsIdx).toBeLessThan(contextManifestIdx);
          expect(contextManifestIdx).toBeLessThan(directorIdx);
          expect(directorIdx).toBeLessThan(architectIdx);
          expect(architectIdx).toBeLessThan(implementerIdx);
          expect(implementerIdx).toBeLessThan(qaIdx);
          expect(qaIdx).toBeLessThan(implRulesIdx);
          expect(implRulesIdx).toBeLessThan(tokenEconomyIdx);
          expect(tokenEconomyIdx).toBeLessThan(antiRunawayIdx);
          expect(antiRunawayIdx).toBeLessThan(qualityGatesIdx);
          expect(qualityGatesIdx).toBeLessThan(completionCriteriaIdx);
          expect(completionCriteriaIdx).toBeLessThan(requiredFinalReportIdx);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.6**
   *
   * For any random `ParsedTask` and `RoleTemplates`, `assemblePrompt` output
   * must contain ALL of these required sections:
   * - `## Goal`
   * - `## Scope`
   * - `## Non-goals`
   * - `## Role Sequence`
   * - `### 1. Director`
   * - `### 2. Architect`
   * - `### 3. Implementer`
   * - `### 4. QA`
   */
  it("Feature: kiro-studio-kit, Property 4: ラウンドトリップ完全性", () => {
    const parsedTaskArb = fc.record({
      goal: safeStringArb,
      scope: safeStringArb,
      nonGoals: safeStringArb,
    });

    const roleTemplatesArb = fc.record({
      director: safeStringArb,
      architect: safeStringArb,
      implementer: safeStringArb,
      qa: safeStringArb,
    });

    fc.assert(
      fc.property(parsedTaskArb, roleTemplatesArb, (task, roles) => {
        const output = assemblePrompt(task, roles);

        expect(output).toContain("## Goal");
        expect(output).toContain("## Scope");
        expect(output).toContain("## Non-goals");
        expect(output).toContain("## Context Manifest");
        expect(output).toContain("## Role Sequence");
        expect(output).toContain("### 1. Director");
        expect(output).toContain("### 2. Architect");
        expect(output).toContain("### 3. Implementer");
        expect(output).toContain("### 4. QA");
        expect(output).toContain("## Implementation Rules");
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.6 (extended with rules)**
   *
   * When rules are provided, output must also contain Token Economy Rules
   * and Anti-Runaway Rules sections.
   */
  it("Feature: kiro-studio-kit, Property 4 extended: ルール付きラウンドトリップ完全性", () => {
    const parsedTaskArb = fc.record({
      goal: safeStringArb,
      scope: safeStringArb,
      nonGoals: safeStringArb,
    });

    const roleTemplatesArb = fc.record({
      director: safeStringArb,
      architect: safeStringArb,
      implementer: safeStringArb,
      qa: safeStringArb,
    });

    const ruleTemplatesArb = fc.record({
      tokenEconomy: safeStringArb,
      antiRunaway: safeStringArb,
      qualityGates: safeStringArb,
      completionCriteria: safeStringArb,
    });

    fc.assert(
      fc.property(
        parsedTaskArb,
        roleTemplatesArb,
        ruleTemplatesArb,
        (task, roles, rules) => {
          const output = assemblePrompt(task, roles, rules);

          expect(output).toContain("## Goal");
          expect(output).toContain("## Scope");
          expect(output).toContain("## Non-goals");
          expect(output).toContain("## Context Manifest");
          expect(output).toContain("## Role Sequence");
          expect(output).toContain("### 1. Director");
          expect(output).toContain("### 2. Architect");
          expect(output).toContain("### 3. Implementer");
          expect(output).toContain("### 4. QA");
          expect(output).toContain("## Token Economy Rules");
          expect(output).toContain("## Anti-Runaway Rules");
          expect(output).toContain("## Quality Gates");
          expect(output).toContain("## Completion Criteria");
          expect(output).toContain("## Required Final Report");
          expect(output).toContain("## Implementation Rules");
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("assemblePrompt", () => {
  const sampleTask: ParsedTask = {
    goal: "テストゴール",
    scope: "テストスコープ",
    nonGoals: "テスト非目標",
  };

  const sampleRoles: RoleTemplates = {
    director: "ディレクター内容",
    architect: "アーキテクト内容",
    implementer: "実装者内容",
    qa: "QA内容",
  };

  const sampleRules: RuleTemplates = {
    tokenEconomy: "トークンエコノミー内容",
    antiRunaway: "アンチランナウェイ内容",
    qualityGates: "品質ゲート内容",
    completionCriteria: "完了基準内容",
  };

  it("出力に全必須セクションが含まれる", () => {
    const output = assemblePrompt(sampleTask, sampleRoles);

    expect(output).toContain("## Goal");
    expect(output).toContain("## Scope");
    expect(output).toContain("## Non-goals");
    expect(output).toContain("## Context Manifest");
    expect(output).toContain("## Role Sequence");
    expect(output).toContain("### 1. Director");
    expect(output).toContain("### 2. Architect");
    expect(output).toContain("### 3. Implementer");
    expect(output).toContain("### 4. QA");
    expect(output).toContain("## Implementation Rules");
  });

  it("セクション順序が正しい", () => {
    const output = assemblePrompt(sampleTask, sampleRoles);

    const goalIdx = output.indexOf("## Goal");
    const scopeIdx = output.indexOf("## Scope");
    const nonGoalsIdx = output.indexOf("## Non-goals");
    const contextManifestIdx = output.indexOf("## Context Manifest");
    const roleSeqIdx = output.indexOf("## Role Sequence");
    const directorIdx = output.indexOf("### 1. Director");
    const architectIdx = output.indexOf("### 2. Architect");
    const implementerIdx = output.indexOf("### 3. Implementer");
    const qaIdx = output.indexOf("### 4. QA");
    const implRulesIdx = output.indexOf("## Implementation Rules");

    expect(goalIdx).toBeLessThan(scopeIdx);
    expect(scopeIdx).toBeLessThan(nonGoalsIdx);
    expect(nonGoalsIdx).toBeLessThan(contextManifestIdx);
    expect(contextManifestIdx).toBeLessThan(roleSeqIdx);
    expect(directorIdx).toBeLessThan(architectIdx);
    expect(architectIdx).toBeLessThan(implementerIdx);
    expect(implementerIdx).toBeLessThan(qaIdx);
    expect(qaIdx).toBeLessThan(implRulesIdx);
  });

  it("ロールテンプレートの内容が出力に含まれる", () => {
    const output = assemblePrompt(sampleTask, sampleRoles);

    expect(output).toContain("ディレクター内容");
    expect(output).toContain("アーキテクト内容");
    expect(output).toContain("実装者内容");
    expect(output).toContain("QA内容");
  });

  it("rules 未指定時に Token Economy / Anti-Runaway セクションが含まれない（後方互換）", () => {
    const output = assemblePrompt(sampleTask, sampleRoles);

    expect(output).not.toContain("## Token Economy Rules");
    expect(output).not.toContain("## Anti-Runaway Rules");
    expect(output).not.toContain("## Quality Gates");
    expect(output).not.toContain("## Completion Criteria");
    expect(output).not.toContain("## Required Final Report");
  });

  it("rules 指定時に ## Token Economy Rules セクションが含まれる", () => {
    const output = assemblePrompt(sampleTask, sampleRoles, sampleRules);

    expect(output).toContain("## Token Economy Rules");
  });

  it("rules 指定時に ## Anti-Runaway Rules セクションが含まれる", () => {
    const output = assemblePrompt(sampleTask, sampleRoles, sampleRules);

    expect(output).toContain("## Anti-Runaway Rules");
  });

  it("rules 指定時にトークンエコノミーテンプレート内容が出力に含まれる", () => {
    const output = assemblePrompt(sampleTask, sampleRoles, sampleRules);

    expect(output).toContain("トークンエコノミー内容");
  });

  it("rules 指定時にアンチランナウェイテンプレート内容が出力に含まれる", () => {
    const output = assemblePrompt(sampleTask, sampleRoles, sampleRules);

    expect(output).toContain("アンチランナウェイ内容");
  });

  it("rules 指定時のセクション順序: Token Economy Rules は QA の後、Anti-Runaway Rules は Token Economy Rules の後", () => {
    const output = assemblePrompt(sampleTask, sampleRoles, sampleRules);

    const qaIdx = output.indexOf("### 4. QA");
    const implRulesIdx = output.indexOf("## Implementation Rules");
    const tokenEconomyIdx = output.indexOf("## Token Economy Rules");
    const antiRunawayIdx = output.indexOf("## Anti-Runaway Rules");

    expect(qaIdx).toBeLessThan(implRulesIdx);
    expect(implRulesIdx).toBeLessThan(tokenEconomyIdx);
    expect(tokenEconomyIdx).toBeLessThan(antiRunawayIdx);
  });

  it("rules 指定時に ## Quality Gates セクションが含まれる", () => {
    const output = assemblePrompt(sampleTask, sampleRoles, sampleRules);

    expect(output).toContain("## Quality Gates");
  });

  it("rules 指定時に ## Completion Criteria セクションが含まれる", () => {
    const output = assemblePrompt(sampleTask, sampleRoles, sampleRules);

    expect(output).toContain("## Completion Criteria");
  });

  it("rules 指定時に ## Required Final Report セクションが含まれる", () => {
    const output = assemblePrompt(sampleTask, sampleRoles, sampleRules);

    expect(output).toContain("## Required Final Report");
  });

  it("Required Final Report に静的項目 Summary と Changed files が含まれる", () => {
    const output = assemblePrompt(sampleTask, sampleRoles, sampleRules);

    expect(output).toContain("Summary");
    expect(output).toContain("Changed files");
  });

  it("rules 指定時に品質ゲートテンプレート内容が出力に含まれる", () => {
    const output = assemblePrompt(sampleTask, sampleRoles, sampleRules);

    expect(output).toContain("品質ゲート内容");
  });

  it("rules 指定時に完了基準テンプレート内容が出力に含まれる", () => {
    const output = assemblePrompt(sampleTask, sampleRoles, sampleRules);

    expect(output).toContain("完了基準内容");
  });

  it("セクション順序: Quality Gates は Anti-Runaway の後、Completion Criteria は Quality Gates の後、Required Final Report は Completion Criteria の後", () => {
    const output = assemblePrompt(sampleTask, sampleRoles, sampleRules);

    const antiRunawayIdx = output.indexOf("## Anti-Runaway Rules");
    const qualityGatesIdx = output.indexOf("## Quality Gates");
    const completionCriteriaIdx = output.indexOf("## Completion Criteria");
    const requiredFinalReportIdx = output.indexOf("## Required Final Report");

    expect(antiRunawayIdx).toBeLessThan(qualityGatesIdx);
    expect(qualityGatesIdx).toBeLessThan(completionCriteriaIdx);
    expect(completionCriteriaIdx).toBeLessThan(requiredFinalReportIdx);
  });

  it("出力に ## Context Manifest セクションが含まれる", () => {
    const output = assemblePrompt(sampleTask, sampleRoles);

    expect(output).toContain("## Context Manifest");
  });
});

describe("escapeRegExp", () => {
  it("通常の文字列はそのまま返す", () => {
    expect(escapeRegExp("Goal")).toBe("Goal");
    expect(escapeRegExp("Non-goals")).toBe("Non-goals");
  });

  it("正規表現の特殊文字をエスケープする", () => {
    expect(escapeRegExp("test.name")).toBe("test\\.name");
    expect(escapeRegExp("a+b")).toBe("a\\+b");
    expect(escapeRegExp("(group)")).toBe("\\(group\\)");
    expect(escapeRegExp("a*b?c")).toBe("a\\*b\\?c");
    expect(escapeRegExp("price$")).toBe("price\\$");
    expect(escapeRegExp("a{1}")).toBe("a\\{1\\}");
    expect(escapeRegExp("a|b")).toBe("a\\|b");
    expect(escapeRegExp("a[0]")).toBe("a\\[0\\]");
    expect(escapeRegExp("a\\b")).toBe("a\\\\b");
  });

  it("特殊文字を含むセクション名で extractSection が動作する", () => {
    const content = `## Test (v2.0)\nSome content here\n\n## Other\nOther content\n`;
    const result = parseTaskFile(content);
    // "Test (v2.0)" はGoal/Scope/Non-goalsではないのでデフォルト値
    expect(result.goal).toBe("");
  });

  it("空文字列はそのまま返す", () => {
    expect(escapeRegExp("")).toBe("");
  });
});

describe("compact mode pipeline", () => {
  const sampleTask: ParsedTask = {
    goal: "テストゴール",
    scope: "テストスコープ",
    nonGoals: "テスト非目標",
  };

  const sampleRoles: RoleTemplates = {
    director: "## Director Details\nディレクター内容\n\n\n\nExtra spacing",
    architect: "## Architect Details\nアーキテクト内容",
    implementer: "## Implementer Details\n実装者内容",
    qa: "## QA Details\nQA内容",
  };

  const sampleRules: RuleTemplates = {
    tokenEconomy: "トークンエコノミー内容",
    antiRunaway: "アンチランナウェイ内容",
    qualityGates: "## Quality Gate Details\n品質ゲート内容",
    completionCriteria: "完了基準内容",
  };

  it("compact: true 時にプロンプトが圧縮される（見出し行が除去される）", () => {
    const original = assemblePrompt(sampleTask, sampleRoles, sampleRules);
    const compacted = trimSection(compactTransform(original));

    // 元のプロンプトには見出し行がある
    expect(original).toContain("## Goal");
    expect(original).toContain("### 1. Director");

    // コンパクト後は見出し行が除去されている
    const compactedLines = compacted.split("\n");
    const headingLines = compactedLines.filter((line) => line.match(/^#+\s/));
    expect(headingLines).toHaveLength(0);
  });

  it("compact: true 時に連続空行が圧縮される", () => {
    const original = assemblePrompt(sampleTask, sampleRoles, sampleRules);
    const compacted = trimSection(compactTransform(original));

    // 3行以上の連続空行がないことを確認
    expect(compacted).not.toMatch(/\n{3,}/);
  });

  it("TokenReduction の値が正しく計算される", () => {
    const original = assemblePrompt(sampleTask, sampleRoles, sampleRules);
    const beforeTokens = estimateTokensFromChars(original);

    let compacted = compactTransform(original);
    compacted = trimSection(compacted);
    const afterTokens = estimateTokensFromChars(compacted);

    const saved = beforeTokens - afterTokens;
    const reduction: TokenReduction = {
      before: beforeTokens,
      after: afterTokens,
      saved,
      reductionPercent: beforeTokens > 0 ? (saved / beforeTokens) * 100 : 0,
    };

    expect(reduction.before).toBeGreaterThan(0);
    expect(reduction.after).toBeGreaterThan(0);
    expect(reduction.saved).toBeGreaterThanOrEqual(0);
    expect(reduction.before).toBe(reduction.after + reduction.saved);
    expect(reduction.reductionPercent).toBeGreaterThanOrEqual(0);
    expect(reduction.reductionPercent).toBeLessThanOrEqual(100);
  });

  it("compact 省略時に従来通りの出力であること", () => {
    const output = assemblePrompt(sampleTask, sampleRoles, sampleRules);

    // 見出し行が保持されている
    expect(output).toContain("## Goal");
    expect(output).toContain("## Scope");
    expect(output).toContain("### 1. Director");
    expect(output).toContain("## Token Economy Rules");
    expect(output).toContain("## Quality Gates");

    // ロール・ルール内容が含まれている
    expect(output).toContain("ディレクター内容");
    expect(output).toContain("トークンエコノミー内容");
    expect(output).toContain("品質ゲート内容");
  });

  it("GenerateOptions 型が正しく定義されている", () => {
    const opts: GenerateOptions = { compact: true };
    expect(opts.compact).toBe(true);

    const defaultOpts: GenerateOptions = {};
    expect(defaultOpts.compact).toBeUndefined();
  });

  it("TokenReduction 型が正しく定義されている", () => {
    const reduction: TokenReduction = {
      before: 1000,
      after: 800,
      saved: 200,
      reductionPercent: 20,
    };
    expect(reduction.before).toBe(1000);
    expect(reduction.after).toBe(800);
    expect(reduction.saved).toBe(200);
    expect(reduction.reductionPercent).toBe(20);
  });
});

describe("resolvePromptMode", () => {
  it("mode が指定された場合はその値を返す", () => {
    expect(resolvePromptMode({ mode: "full" })).toBe("full");
    expect(resolvePromptMode({ mode: "compact" })).toBe("compact");
    expect(resolvePromptMode({ mode: "minimal" })).toBe("minimal");
  });
  it("mode が未指定で compact: true の場合は 'compact' を返す", () => {
    expect(resolvePromptMode({ compact: true })).toBe("compact");
  });
  it("mode も compact も未指定の場合は 'full' を返す", () => {
    expect(resolvePromptMode({})).toBe("full");
  });
  it("mode と compact が両方指定された場合は mode を優先する", () => {
    expect(resolvePromptMode({ mode: "minimal", compact: true })).toBe("minimal");
    expect(resolvePromptMode({ mode: "full", compact: true })).toBe("full");
  });
});

describe("resolvePromptMode property tests", () => {
  it("Feature: prompt-mode-support, Property 2: resolvePromptMode の優先順位不変条件", () => {
    const modeArb = fc.constantFrom("full" as const, "compact" as const, "minimal" as const);
    fc.assert(fc.property(
      fc.record({
        mode: fc.option(modeArb, { nil: undefined }),
        compact: fc.option(fc.boolean(), { nil: undefined }),
      }),
      (options) => {
        const result = resolvePromptMode(options);
        if (options.mode) {
          expect(result).toBe(options.mode);
        } else if (options.compact) {
          expect(result).toBe("compact");
        } else {
          expect(result).toBe("full");
        }
      }
    ), { numRuns: 100 });
  });
});

describe("assembleMinimalPrompt", () => {
  const sampleTask = {
    goal: "テスト用のゴール",
    scope: "テスト用のスコープ",
    nonGoals: "テスト用のNon-goals",
  };

  it("Goal / Scope / Non-goals が展開される", () => {
    const output = assembleMinimalPrompt(sampleTask);
    expect(output).toContain("テスト用のゴール");
    expect(output).toContain("テスト用のスコープ");
    expect(output).toContain("テスト用のNon-goals");
  });

  it("品質ゲートコマンドが含まれる", () => {
    const output = assembleMinimalPrompt(sampleTask);
    expect(output).toContain("npm run typecheck");
    expect(output).toContain("npm run lint");
    expect(output).toContain("npm run test");
    expect(output).toContain("npm run build");
  });

  it("スキップ理由報告の文言が含まれる", () => {
    const output = assembleMinimalPrompt(sampleTask);
    expect(output).toContain("スキップ");
  });

  it("最終報告フォーマットが含まれる", () => {
    const output = assembleMinimalPrompt(sampleTask);
    expect(output).toContain("変更ファイル");
    expect(output).toContain("変更サマリー");
    expect(output).toContain("品質ゲート結果");
    expect(output).toContain("残課題");
  });

  it("Role Sequence セクションが含まれない", () => {
    const output = assembleMinimalPrompt(sampleTask);
    expect(output).not.toContain("### 1. Director");
    expect(output).not.toContain("### 2. Architect");
    expect(output).not.toContain("### 3. Implementer");
    expect(output).not.toContain("### 4. QA");
  });

  it("# Kiro Prompt (Minimal) ヘッダーが含まれる", () => {
    const output = assembleMinimalPrompt(sampleTask);
    expect(output).toContain("# Kiro Prompt (Minimal)");
  });
});

describe("assembleMinimalPrompt property tests", () => {
  const safeStringArb = fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0);

  it("Feature: prompt-mode-support, Property 3: minimal モードは Goal・Scope・Non-goals を常に含む", () => {
    fc.assert(fc.property(
      fc.record({ goal: safeStringArb, scope: safeStringArb, nonGoals: safeStringArb }),
      (task) => {
        const output = assembleMinimalPrompt(task);
        expect(output).toContain(task.goal);
        expect(output).toContain(task.scope);
        expect(output).toContain(task.nonGoals);
      }
    ), { numRuns: 100 });
  });

  it("Feature: prompt-mode-support, Property 4: minimal モードは Role Sequence セクションを含まない", () => {
    fc.assert(fc.property(
      fc.record({ goal: safeStringArb, scope: safeStringArb, nonGoals: safeStringArb }),
      (task) => {
        const output = assembleMinimalPrompt(task);
        expect(output).not.toContain("### 1. Director");
        expect(output).not.toContain("### 2. Architect");
        expect(output).not.toContain("### 3. Implementer");
        expect(output).not.toContain("### 4. QA");
      }
    ), { numRuns: 100 });
  });

  it("Feature: prompt-mode-support, Property 5: minimal モードのトークン数は full モードより少ない", () => {
    // RoleTemplates と RuleTemplates のアービトラリ
    const templateArb = fc.string({ minLength: 50, maxLength: 500 });
    const roleTemplatesArb = fc.record({
      director: templateArb,
      architect: templateArb,
      implementer: templateArb,
      qa: templateArb,
    });
    const ruleTemplatesArb = fc.record({
      tokenEconomy: templateArb,
      antiRunaway: templateArb,
      qualityGates: templateArb,
      completionCriteria: templateArb,
    });

    fc.assert(fc.property(
      fc.record({ goal: safeStringArb, scope: safeStringArb, nonGoals: safeStringArb }),
      roleTemplatesArb,
      ruleTemplatesArb,
      (task, roles, rules) => {
        const fullOutput = assemblePrompt(task, roles, rules);
        const minimalOutput = assembleMinimalPrompt(task);
        const fullTokens = estimateTokensFromChars(fullOutput);
        const minimalTokens = estimateTokensFromChars(minimalOutput);
        expect(minimalTokens).toBeLessThan(fullTokens);
      }
    ), { numRuns: 100 });
  });
});
