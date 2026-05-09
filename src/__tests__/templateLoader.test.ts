import { describe, it, expect, vi, afterEach } from "vitest";
import {
  loadRoleTemplates,
  loadRuleTemplates,
  loadPublicLogTemplate,
  stripExplanations,
} from "../core/templateLoader.js";

describe("templateLoader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("loadRoleTemplates", () => {
    it("4つのテンプレートを正常に読み込み、director, architect, implementer, qa フィールドを持つオブジェクトを返す", async () => {
      const templates = await loadRoleTemplates();

      expect(templates).toHaveProperty("director");
      expect(templates).toHaveProperty("architect");
      expect(templates).toHaveProperty("implementer");
      expect(templates).toHaveProperty("qa");
      expect(templates.director).toBeTruthy();
      expect(templates.architect).toBeTruthy();
      expect(templates.implementer).toBeTruthy();
      expect(templates.qa).toBeTruthy();
    });

    it("director テンプレートに「目的ズレ」や「スコープ拡大」のキーワードが含まれる", async () => {
      const templates = await loadRoleTemplates();

      expect(
        templates.director.includes("目的ズレ") ||
          templates.director.includes("スコープ拡大"),
      ).toBe(true);
    });

    it("architect テンプレートに「責務分離」や「データ構造」のキーワードが含まれる", async () => {
      const templates = await loadRoleTemplates();

      expect(
        templates.architect.includes("責務分離") ||
          templates.architect.includes("データ構造"),
      ).toBe(true);
    });

    it("implementer テンプレートに「型安全」や「小さい単位」のキーワードが含まれる", async () => {
      const templates = await loadRoleTemplates();

      expect(
        templates.implementer.includes("型安全") ||
          templates.implementer.includes("小さい単位"),
      ).toBe(true);
    });

    it("qa テンプレートに「typecheck」や「回帰確認」のキーワードが含まれる", async () => {
      const templates = await loadRoleTemplates();

      expect(
        templates.qa.includes("typecheck") ||
          templates.qa.includes("回帰確認"),
      ).toBe(true);
    });

    it("テンプレートファイルが欠落している場合「ファイルが見つかりません」を含むエラーをスローする", async () => {
      // readTextFile をモックして特定のファイルで ENOENT エラーを再現する
      const fileUtils = await import("../core/fileUtils.js");
      const originalReadTextFile = fileUtils.readTextFile;

      vi.spyOn(fileUtils, "readTextFile").mockImplementation(
        async (filePath: string) => {
          if (filePath.includes("director.md")) {
            throw new Error(`ファイルが見つかりません: ${filePath}`);
          }
          return originalReadTextFile(filePath);
        },
      );

      await expect(loadRoleTemplates()).rejects.toThrow(
        "ファイルが見つかりません",
      );
    });
  });

  describe("loadRuleTemplates", () => {
    it("tokenEconomy と antiRunaway フィールドを持つオブジェクトを正常に読み込む", async () => {
      const templates = await loadRuleTemplates();

      expect(templates).toHaveProperty("tokenEconomy");
      expect(templates).toHaveProperty("antiRunaway");
      expect(templates).toHaveProperty("qualityGates");
      expect(templates).toHaveProperty("completionCriteria");
      expect(templates.tokenEconomy).toBeTruthy();
      expect(templates.antiRunaway).toBeTruthy();
      expect(templates.qualityGates).toBeTruthy();
      expect(templates.completionCriteria).toBeTruthy();
    });

    it("tokenEconomy テンプレートに「必要最小限」や「差分報告」のキーワードが含まれる", async () => {
      const templates = await loadRuleTemplates();

      expect(
        templates.tokenEconomy.includes("必要最小限") ||
          templates.tokenEconomy.includes("差分報告"),
      ).toBe(true);
    });

    it("antiRunaway テンプレートに「停止」や「スコープ外」のキーワードが含まれる", async () => {
      const templates = await loadRuleTemplates();

      expect(
        templates.antiRunaway.includes("停止") ||
          templates.antiRunaway.includes("スコープ外"),
      ).toBe(true);
    });

    it("qualityGates テンプレートに「npm run typecheck」や「品質ゲート」のキーワードが含まれる", async () => {
      const templates = await loadRuleTemplates();

      expect(
        templates.qualityGates.includes("npm run typecheck") ||
          templates.qualityGates.includes("品質ゲート"),
      ).toBe(true);
    });

    it("completionCriteria テンプレートに「完了」や「変更範囲」のキーワードが含まれる", async () => {
      const templates = await loadRuleTemplates();

      expect(
        templates.completionCriteria.includes("完了") ||
          templates.completionCriteria.includes("変更範囲"),
      ).toBe(true);
    });

    it("ルールテンプレートファイルが欠落している場合「ファイルが見つかりません」を含むエラーをスローする", async () => {
      const fileUtils = await import("../core/fileUtils.js");
      const originalReadTextFile = fileUtils.readTextFile;

      vi.spyOn(fileUtils, "readTextFile").mockImplementation(
        async (filePath: string) => {
          if (filePath.includes("token-economy.md")) {
            throw new Error(`ファイルが見つかりません: ${filePath}`);
          }
          return originalReadTextFile(filePath);
        },
      );

      await expect(loadRuleTemplates()).rejects.toThrow(
        "ファイルが見つかりません",
      );
    });
  });

  describe("loadPublicLogTemplate", () => {
    it("公開ログテンプレートを正常に読み込む（空でない文字列）", async () => {
      const content = await loadPublicLogTemplate();

      expect(typeof content).toBe("string");
      expect(content.length).toBeGreaterThan(0);
    });

    it("テンプレートに「Quality Gates」テーブルヘッダーが含まれる", async () => {
      const content = await loadPublicLogTemplate();

      expect(content).toContain("Quality Gates");
    });

    it("テンプレートに「Public Development Log」が含まれる", async () => {
      const content = await loadPublicLogTemplate();

      expect(content).toContain("Public Development Log");
    });

    it("テンプレートファイルが欠落している場合「ファイルが見つかりません」を含むエラーをスローする", async () => {
      const fileUtils = await import("../core/fileUtils.js");
      const originalReadTextFile = fileUtils.readTextFile;

      vi.spyOn(fileUtils, "readTextFile").mockImplementation(
        async (filePath: string) => {
          if (filePath.includes("public-log-template.md")) {
            throw new Error(`ファイルが見つかりません: ${filePath}`);
          }
          return originalReadTextFile(filePath);
        },
      );

      await expect(loadPublicLogTemplate()).rejects.toThrow(
        "ファイルが見つかりません",
      );
    });
  });

  describe("並列読み込みの結果同一性", () => {
    it("loadRoleTemplates の並列読み込み結果が全フィールドを正しく返す", async () => {
      const templates = await loadRoleTemplates();

      // 並列読み込みでも4つのフィールドがすべて存在し、空でないこと
      expect(Object.keys(templates)).toHaveLength(4);
      expect(templates.director).toBeTruthy();
      expect(templates.architect).toBeTruthy();
      expect(templates.implementer).toBeTruthy();
      expect(templates.qa).toBeTruthy();

      // 各テンプレートが異なる内容であること（ファイルが正しくマッピングされている）
      const values = [templates.director, templates.architect, templates.implementer, templates.qa];
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(4);
    });

    it("loadRuleTemplates の並列読み込み結果が全フィールドを正しく返す", async () => {
      const templates = await loadRuleTemplates();

      expect(Object.keys(templates)).toHaveLength(4);
      expect(templates.tokenEconomy).toBeTruthy();
      expect(templates.antiRunaway).toBeTruthy();
      expect(templates.qualityGates).toBeTruthy();
      expect(templates.completionCriteria).toBeTruthy();

      // 各テンプレートが異なる内容であること
      const values = [templates.tokenEconomy, templates.antiRunaway, templates.qualityGates, templates.completionCriteria];
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(4);
    });

    it("loadRuleTemplates をオプションなしで呼び出しても正常に動作する（後方互換性）", async () => {
      const templates = await loadRuleTemplates();

      expect(templates).toHaveProperty("tokenEconomy");
      expect(templates).toHaveProperty("antiRunaway");
      expect(templates).toHaveProperty("qualityGates");
      expect(templates).toHaveProperty("completionCriteria");
    });

    it("loadRuleTemplates に compact: false を渡した場合、オプションなしと同一の結果を返す", async () => {
      const withoutOptions = await loadRuleTemplates();
      const withFalse = await loadRuleTemplates({ compact: false });

      expect(withFalse).toEqual(withoutOptions);
    });

    it("loadRuleTemplates に compact: true を渡した場合、qualityGates が簡潔化される", async () => {
      const normal = await loadRuleTemplates();
      const compact = await loadRuleTemplates({ compact: true });

      // qualityGates 以外は同一
      expect(compact.tokenEconomy).toBe(normal.tokenEconomy);
      expect(compact.antiRunaway).toBe(normal.antiRunaway);
      expect(compact.completionCriteria).toBe(normal.completionCriteria);

      // qualityGates は簡潔化されて短くなる
      expect(compact.qualityGates.length).toBeLessThan(normal.qualityGates.length);
    });
  });

  describe("stripExplanations", () => {
    it("コードブロック内のコマンドを保持する", () => {
      const template = `## Quality Gates

\`\`\`bash
npm run typecheck
npm run lint
npm run test
\`\`\`

### 説明セクション

これは説明文です。
`;
      const result = stripExplanations(template);

      expect(result).toContain("npm run typecheck");
      expect(result).toContain("npm run lint");
      expect(result).toContain("npm run test");
      expect(result).toContain("```bash");
      expect(result).toContain("```");
    });

    it("説明文（見出しや通常テキスト）を除去する", () => {
      const template = `## Quality Gates ルール

以下の品質ゲートを実行してください：

\`\`\`bash
npm run typecheck
\`\`\`

### 実行ルール

これは説明文です。
`;
      const result = stripExplanations(template);

      expect(result).not.toContain("## Quality Gates ルール");
      expect(result).not.toContain("以下の品質ゲートを実行してください");
      expect(result).not.toContain("### 実行ルール");
      expect(result).not.toContain("これは説明文です。");
    });

    it("箇条書きルールを保持する", () => {
      const template = `## ルール

- 存在しない script はスキップし報告
- 失敗時は原因・修正・再実行結果を記録
- 全結果を最終報告に含める

説明テキスト
`;
      const result = stripExplanations(template);

      expect(result).toContain("- 存在しない script はスキップし報告");
      expect(result).toContain("- 失敗時は原因・修正・再実行結果を記録");
      expect(result).toContain("- 全結果を最終報告に含める");
    });

    it("空文字列を渡した場合、空文字列を返す", () => {
      expect(stripExplanations("")).toBe("");
    });

    it("コードブロックも箇条書きもない場合、空の結果を返す", () => {
      const template = `見出しと説明文のみ
## タイトル
これは説明です。`;
      const result = stripExplanations(template);

      // 全行が除去されるので空行のみ
      expect(result.trim()).toBe("");
    });

    it("実際の quality-gates.md テンプレートに対して正しく動作する", async () => {
      const normal = await loadRuleTemplates();
      const result = stripExplanations(normal.qualityGates);

      // コマンドが保持されている
      expect(result).toContain("npm run typecheck");
      expect(result).toContain("npm run lint");
      expect(result).toContain("npm run test");
      expect(result).toContain("npm run build");

      // 元のテンプレートより短い
      expect(result.length).toBeLessThan(normal.qualityGates.length);
    });
  });
});
