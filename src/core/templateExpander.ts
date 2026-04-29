/** テンプレート変数の辞書 */
export type TemplateVariables = Record<string, string>;

/**
 * テンプレート文字列内の {{variable}} を辞書の値で展開する。
 * 未定義の変数は空文字列に置換する。
 *
 * @param template - {{variable}} を含むテンプレート文字列
 * @param variables - 変数名→値の辞書
 * @returns 展開後の文字列
 */
export function expandTemplate(
  template: string,
  variables: TemplateVariables,
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_match, varName: string) => variables[varName] ?? "",
  );
}
