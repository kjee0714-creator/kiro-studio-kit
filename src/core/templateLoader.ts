import path from "path";
import { readTextFile } from "./fileUtils.js";

/** ロールテンプレートの集合 */
export interface RoleTemplates {
  director: string;
  architect: string;
  implementer: string;
  qa: string;
}

/** テンプレートディレクトリのベースパスを解決する */
export function getTemplatesDir(): string {
  return path.join(process.cwd(), "templates");
}

/** 4つのロールテンプレートをすべて読み込む */
export async function loadRoleTemplates(): Promise<RoleTemplates> {
  const rolesDir = path.join(getTemplatesDir(), "roles");

  const director = await readTextFile(path.join(rolesDir, "director.md"));
  const architect = await readTextFile(path.join(rolesDir, "architect.md"));
  const implementer = await readTextFile(path.join(rolesDir, "implementer.md"));
  const qa = await readTextFile(path.join(rolesDir, "qa.md"));

  return { director, architect, implementer, qa };
}

/** ルールテンプレートの集合 */
export interface RuleTemplates {
  tokenEconomy: string;
  antiRunaway: string;
  qualityGates: string;
  completionCriteria: string;
}

/** 公開ログテンプレートを読み込む */
export async function loadPublicLogTemplate(): Promise<string> {
  const templatePath = path.join(getTemplatesDir(), "public-log-template.md");
  return readTextFile(templatePath);
}

/** ルールテンプレートを読み込む */
export async function loadRuleTemplates(): Promise<RuleTemplates> {
  const rulesDir = path.join(getTemplatesDir(), "rules");

  const tokenEconomy = await readTextFile(
    path.join(rulesDir, "token-economy.md"),
  );
  const antiRunaway = await readTextFile(
    path.join(rulesDir, "anti-runaway.md"),
  );
  const qualityGates = await readTextFile(
    path.join(rulesDir, "quality-gates.md"),
  );
  const completionCriteria = await readTextFile(
    path.join(rulesDir, "completion-criteria.md"),
  );

  return { tokenEconomy, antiRunaway, qualityGates, completionCriteria };
}
