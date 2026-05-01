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

/** 4つのロールテンプレートを並列に読み込む */
export async function loadRoleTemplates(): Promise<RoleTemplates> {
  const rolesDir = path.join(getTemplatesDir(), "roles");

  const [director, architect, implementer, qa] = await Promise.all([
    readTextFile(path.join(rolesDir, "director.md")),
    readTextFile(path.join(rolesDir, "architect.md")),
    readTextFile(path.join(rolesDir, "implementer.md")),
    readTextFile(path.join(rolesDir, "qa.md")),
  ]);

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

/** ルールテンプレート読み込みオプション */
export interface LoadRuleOptions {
  compact?: boolean;
}

/**
 * テンプレートから説明文を除去し、コードブロック内のコマンドと箇条書きルールのみ保持する。
 * - コードブロック（```...```）内の行はすべて保持
 * - 箇条書き（`- ` で始まる行）は保持
 * - それ以外の行は除去
 */
export function stripExplanations(template: string): string {
  const lines = template.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }
    if (inCodeBlock) {
      result.push(line);
      continue;
    }
    if (line.match(/^\s*[-*+]\s/)) {
      result.push(line);
      continue;
    }
  }

  return result.join("\n");
}

/** ルールテンプレートを並列に読み込む */
export async function loadRuleTemplates(options?: LoadRuleOptions): Promise<RuleTemplates> {
  const rulesDir = path.join(getTemplatesDir(), "rules");

  const [tokenEconomy, antiRunaway, qualityGates, completionCriteria] = await Promise.all([
    readTextFile(path.join(rulesDir, "token-economy.md")),
    readTextFile(path.join(rulesDir, "anti-runaway.md")),
    readTextFile(path.join(rulesDir, "quality-gates.md")),
    readTextFile(path.join(rulesDir, "completion-criteria.md")),
  ]);

  if (options?.compact) {
    return {
      tokenEconomy,
      antiRunaway,
      qualityGates: stripExplanations(qualityGates),
      completionCriteria,
    };
  }

  return { tokenEconomy, antiRunaway, qualityGates, completionCriteria };
}
