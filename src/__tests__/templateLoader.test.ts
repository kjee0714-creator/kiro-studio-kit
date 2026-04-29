import { describe, it, expect, vi, afterEach } from "vitest";
import {
  loadRoleTemplates,
  loadRuleTemplates,
  loadPublicLogTemplate,
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
});
