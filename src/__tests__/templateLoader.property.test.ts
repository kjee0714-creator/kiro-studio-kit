import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { stripExplanations } from "../core/templateLoader.js";

/**
 * コードブロック内のコマンド行を抽出するヘルパー関数。
 * ``` で囲まれたブロック内の非空行をすべて返す。
 */
function extractCodeBlockCommands(template: string): string[] {
  const lines = template.split("\n");
  const commands: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock && line.trim().length > 0) {
      commands.push(line);
    }
  }

  return commands;
}

/**
 * 品質ゲートテンプレートのジェネレーター。
 * コードブロック内にコマンド行を含み、その前後に見出しや説明文を配置する。
 */
const qualityGateTemplateArb = fc
  .record({
    heading: fc.constantFrom(
      "## Quality Gates",
      "## 品質ゲート",
      "## Build Checks",
    ),
    description: fc.constantFrom(
      "以下の品質ゲートを実行してください：",
      "Run the following quality gates:",
      "Execute these checks:",
    ),
    codeBlockLang: fc.constantFrom("bash", "sh", ""),
    commands: fc.array(
      fc.constantFrom(
        "npm run typecheck",
        "npm run lint",
        "npm run test",
        "npm run build",
        "npx tsc --noEmit",
        "eslint src/",
        "vitest --run",
      ),
      { minLength: 1, maxLength: 6 },
    ),
    rules: fc.array(
      fc.constantFrom(
        "- 存在しない script はスキップし報告",
        "- 失敗時は原因・修正・再実行結果を記録",
        "- 全結果を最終報告に含める",
        "- 品質ゲート未実行のまま完了扱いにしない",
        "* Check all results before proceeding",
        "+ Report failures with details",
      ),
      { minLength: 0, maxLength: 4 },
    ),
    trailingText: fc.constantFrom(
      "",
      "### 補足説明\n\nこれは追加の説明です。",
      "Additional notes go here.",
    ),
  })
  .map(({ heading, description, codeBlockLang, commands, rules, trailingText }) => {
    const langSuffix = codeBlockLang ? codeBlockLang : "";
    const parts = [
      heading,
      "",
      description,
      "",
      "```" + langSuffix,
      ...commands,
      "```",
    ];
    if (rules.length > 0) {
      parts.push("", ...rules);
    }
    if (trailingText) {
      parts.push("", trailingText);
    }
    return parts.join("\n");
  });

describe("templateLoader property tests", () => {
  /**
   * Property 9: stripExplanations がコマンドを保持する
   * 任意の品質ゲートテンプレートに対して、コードブロック内のコマンド行がすべて保持されることを検証
   * **Validates: Requirements 6.5**
   */
  it("Property 9: stripExplanations はコードブロック内のコマンド行をすべて保持する", () => {
    fc.assert(
      fc.property(qualityGateTemplateArb, (template) => {
        const commands = extractCodeBlockCommands(template);
        const stripped = stripExplanations(template);

        for (const cmd of commands) {
          expect(stripped).toContain(cmd);
        }
      }),
      { numRuns: 1000 },
    );
  });
});
