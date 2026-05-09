# Design Document

## Overview

kiro-studio-kit のプロンプト生成パイプラインにトークン最適化機能を追加する。テンプレート読み込みの並列化、コンパクトモードによるプロンプト圧縮、セクショントリミング、品質ゲートの刷新を実装し、トークン消費量を定量的に削減する。

## Architecture

### 変更対象モジュール

```
src/core/
├── templateLoader.ts      # 並列読み込み対応
├── promptGenerator.ts     # compact オプション追加、品質ゲート圧縮
├── sectionTrimmer.ts      # 新規: トリミングユーティリティ
├── qualityGateReporter.ts # 新規: 品質ゲート結果報告
├── tokenLedger.ts         # compact 情報の記録追加
└── compactTransformer.ts  # 新規: コンパクト変換ロジック

src/cli.ts                 # --compact フラグ対応

templates/rules/
└── quality-gates.md       # 簡潔化されたテンプレート
```

### データフロー

```
task.md
  ↓
templateLoader (並列読み込み)
  ↓
promptGenerator
  ├── compact=false → 従来通りの完全プロンプト
  └── compact=true  → compactTransformer → sectionTrimmer → 圧縮プロンプト
  ↓
tokenLedger (削減量記録)
  ↓
GenerateResult (削減情報付き)
```

## Components

### 1. Template Loader の並列化

**ファイル**: `src/core/templateLoader.ts`

現在の逐次 `await` を `Promise.all` に変更する。

```typescript
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

export async function loadRuleTemplates(): Promise<RuleTemplates> {
  const rulesDir = path.join(getTemplatesDir(), "rules");
  const [tokenEconomy, antiRunaway, qualityGates, completionCriteria] = await Promise.all([
    readTextFile(path.join(rulesDir, "token-economy.md")),
    readTextFile(path.join(rulesDir, "anti-runaway.md")),
    readTextFile(path.join(rulesDir, "quality-gates.md")),
    readTextFile(path.join(rulesDir, "completion-criteria.md")),
  ]);
  return { tokenEconomy, antiRunaway, qualityGates, completionCriteria };
}
```

**簡潔版テンプレート読み込みオプション**:

```typescript
export interface LoadRuleOptions {
  compact?: boolean;
}

export async function loadRuleTemplates(options?: LoadRuleOptions): Promise<RuleTemplates> {
  // ... 並列読み込み ...
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

/** テンプレートから説明文を除去し、コマンドとルールのみ保持する */
function stripExplanations(template: string): string {
  // コードブロック内のコマンドと箇条書きルールのみ抽出
}
```

### 2. Compact Transformer

**ファイル**: `src/core/compactTransformer.ts`（新規）

コンパクトモード時の変換ロジックを集約する純粋関数モジュール。

```typescript
export interface CompactOptions {
  removeHeadings: boolean;
  compressBlankLines: boolean;
  normalizeListSpacing: boolean;
}

const DEFAULT_OPTIONS: CompactOptions = {
  removeHeadings: true,
  compressBlankLines: true,
  normalizeListSpacing: true,
};

/**
 * テキストをコンパクト形式に変換する。
 * - 見出し行（# で始まる行）を除去
 * - 3行以上の連続空行を1行に圧縮
 * - 箇条書き記号後の余分な空白を正規化
 */
export function compactTransform(
  text: string,
  options: CompactOptions = DEFAULT_OPTIONS,
): string {
  let result = text;
  if (options.removeHeadings) {
    result = removeHeadingLines(result);
  }
  if (options.compressBlankLines) {
    result = compressConsecutiveBlankLines(result);
  }
  if (options.normalizeListSpacing) {
    result = normalizeListItemSpacing(result);
  }
  return result;
}

function removeHeadingLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.match(/^#+\s/))
    .join("\n");
}

function compressConsecutiveBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n");
}

function normalizeListItemSpacing(text: string): string {
  return text.replace(/^([-*+])\s{2,}/gm, "$1 ");
}
```

### 3. Section Trimmer

**ファイル**: `src/core/sectionTrimmer.ts`（新規）

プロンプト全体に適用する最終トリミング処理。冪等性を保証する。

```typescript
/**
 * プロンプト文字列をトリミングする。
 * - 末尾の空白行を除去
 * - 3行以上の連続空行を1行に圧縮
 * - 各行の末尾空白を除去
 *
 * 冪等性: trimSection(trimSection(x)) === trimSection(x)
 */
export function trimSection(text: string): string {
  let result = text;
  // 各行の末尾空白を除去
  result = result.replace(/[^\S\n]+$/gm, "");
  // 3行以上の連続空行を1行に圧縮
  result = result.replace(/\n{3,}/g, "\n\n");
  // 末尾の空白行を除去
  result = result.replace(/\n+$/, "\n");
  return result;
}
```

### 4. Quality Gate Reporter

**ファイル**: `src/core/qualityGateReporter.ts`（新規）

品質ゲートの結果をトークン効率の高いフォーマットで報告する。

```typescript
export interface GateResult {
  name: string;
  status: "pass" | "fail" | "skip";
  durationMs?: number;
  error?: string;
  fix?: string;
  retryResult?: "pass" | "fail";
  skipReason?: string;
}

export interface QualityGateReport {
  results: GateResult[];
  format: "compact" | "full";
}

/**
 * 品質ゲート結果を構造化フォーマットで出力する。
 * - 成功: 1行サマリー（ゲート名 + PASS + 所要時間）
 * - 失敗: 詳細（エラー内容・修正内容・再実行結果）
 * - スキップ: 1行（ゲート名 + SKIP + 理由）
 */
export function formatGateResults(report: QualityGateReport): string {
  const lines: string[] = ["| Gate | Result | Duration |", "|---|---|---|"];
  for (const gate of report.results) {
    if (gate.status === "pass") {
      lines.push(`| ${gate.name} | PASS | ${gate.durationMs ?? "-"}ms |`);
    } else if (gate.status === "skip") {
      lines.push(`| ${gate.name} | SKIP | ${gate.skipReason ?? ""} |`);
    } else {
      lines.push(`| ${gate.name} | FAIL | ${gate.durationMs ?? "-"}ms |`);
      if (gate.error) lines.push(`  Error: ${gate.error}`);
      if (gate.fix) lines.push(`  Fix: ${gate.fix}`);
      if (gate.retryResult) lines.push(`  Retry: ${gate.retryResult.toUpperCase()}`);
    }
  }
  return lines.join("\n");
}

/**
 * 変更対象ファイルの拡張子が .md のみの場合、
 * typecheck・lint・build をスキップ対象として判定する。
 */
export function determineSkippableGates(changedFiles: string[]): string[] {
  const allMarkdown = changedFiles.every((f) => f.endsWith(".md"));
  if (allMarkdown) {
    return ["typecheck", "lint", "build"];
  }
  return [];
}
```

### 5. Prompt Generator の拡張

**ファイル**: `src/core/promptGenerator.ts`

```typescript
export interface GenerateOptions {
  compact?: boolean;
}

export interface TokenReduction {
  before: number;
  after: number;
  saved: number;
  reductionPercent: number;
}

export interface GenerateResult {
  promptPath: string;
  publicLogPath: string;
  experimentLogPath?: string;
  tokenLedgerPath?: string;
  tokenReduction?: TokenReduction;  // compact モード時のみ
}
```

コンパクトモード時のプロンプト組み立てフロー:
1. 通常通り `assemblePrompt` でプロンプトを生成
2. `compactTransform` でロールテンプレート部分を圧縮
3. 品質ゲートセクションをコマンド一覧 + 最小限ルールに圧縮
4. `trimSection` で最終トリミング
5. 通常モードとのトークン数差分を計算

### 6. 品質ゲートテンプレートの刷新

**ファイル**: `templates/rules/quality-gates.md`

コンパクトモード時に `stripExplanations` で処理された結果:

```markdown
## Quality Gates

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

- 存在しない script はスキップし報告
- 失敗時は原因・修正・再実行結果を記録
- 全結果を最終報告に含める
```

### 7. CLI の拡張

**ファイル**: `src/cli.ts`

```typescript
function parseCompactFlag(args: string[]): boolean {
  return args.includes("--compact");
}

// handlePrompt 内で:
const compact = parseCompactFlag(args);
const result = await generatePrompt(taskFilePath, outputDir, { compact });
if (result.tokenReduction) {
  console.log(`📊 トークン削減: ${result.tokenReduction.before} → ${result.tokenReduction.after} (${result.tokenReduction.reductionPercent.toFixed(1)}% 削減)`);
}
```

### 8. Token Ledger の拡張

**ファイル**: `src/core/tokenLedger.ts`

```typescript
export interface TokenLedgerRecord {
  // ... 既存フィールド ...
  compactMode?: {
    enabled: boolean;
    tokensSaved: number;
    reductionPercent: number;
  };
}
```

## Correctness Properties

### Property 1: テンプレート並列読み込みの結果同一性

**対応要件**: Requirement 1, AC 3

並列読み込みの結果は、テンプレートファイルの内容に依存し、読み込み順序に依存しない。任意のテンプレートファイルセットに対して、`Promise.all` による並列読み込みと逐次 `await` による読み込みは同一の `RoleTemplates` / `RuleTemplates` オブジェクトを返す。

**テスト方針**: モックファイルシステムを使用し、任意のファイル内容に対して並列・逐次の結果が一致することを検証。

### Property 2: コンパクト変換後に見出し行が存在しない

**対応要件**: Requirement 2, AC 2

任意の入力文字列に対して、`compactTransform` 適用後の出力に `^#+\s` にマッチする行が存在しない。

```
∀ text: string.
  compactTransform(text, { removeHeadings: true, ... })
    .split("\n")
    .every(line => !line.match(/^#+\s/))
```

### Property 3: コンパクト変換後に3行以上の連続空行が存在しない

**対応要件**: Requirement 2, AC 3 / Requirement 4, AC 2

任意の入力文字列に対して、空行圧縮後の出力に `\n{3,}` パターンが存在しない。

```
∀ text: string.
  compressConsecutiveBlankLines(text).match(/\n{3,}/) === null
```

### Property 4: セクショントリミングの冪等性

**対応要件**: Requirement 4, AC 5

任意の入力文字列に対して、`trimSection` を2回適用した結果は1回適用した結果と同一である。

```
∀ text: string.
  trimSection(trimSection(text)) === trimSection(text)
```

### Property 5: セクショントリミング後に末尾空白が存在しない

**対応要件**: Requirement 4, AC 3

任意の入力文字列に対して、`trimSection` 適用後の各行に末尾空白（trailing whitespace）が存在しない。

```
∀ text: string.
  trimSection(text)
    .split("\n")
    .every(line => line === line.trimEnd())
```

### Property 6: トークン削減量は非負

**対応要件**: Requirement 3, AC 1

任意の入力に対して、コンパクトモードのトークン数は通常モードのトークン数以下である（削減量 >= 0）。

```
∀ input: string.
  estimateTokens(compactTransform(input)) <= estimateTokens(input)
```

### Property 7: コンパクト変換が意味的内容を保持する

**対応要件**: Requirement 4, AC 4

任意の入力文字列に対して、トリミング後の非空白文字の順序が元の文字列と同一である（空白の除去・圧縮のみで、文字の追加・削除・並べ替えは行わない）。

```
∀ text: string.
  extractNonWhitespace(trimSection(text)) === extractNonWhitespace(text)
  where extractNonWhitespace(s) = s.replace(/\s/g, "")
```

注: `compactTransform` の `removeHeadings` は行を除去するため、この性質は `trimSection` 単体に適用される。

### Property 8: 箇条書き正規化後のフォーマット一貫性

**対応要件**: Requirement 2, AC 4

任意の入力文字列に対して、箇条書き正規化後の箇条書き行は `[-*+] ` の形式（記号 + 空白1つ）で始まる。

```
∀ text: string.
  normalizeListItemSpacing(text)
    .split("\n")
    .filter(line => line.match(/^[-*+]/))
    .every(line => line.match(/^[-*+] \S/))
```

### Property 9: stripExplanations がコマンドを保持する

**対応要件**: Requirement 6, AC 5

任意の品質ゲートテンプレートに対して、`stripExplanations` 適用後もコードブロック内のコマンド行がすべて保持される。

```
∀ template: string.
  extractCodeBlockCommands(template) ⊆ stripExplanations(template)
```

## Decisions

| 決定事項 | 選択 | 理由 |
|---|---|---|
| コンパクト変換の配置 | 独立モジュール `compactTransformer.ts` | 単一責務・テスト容易性 |
| セクショントリマーの配置 | 独立モジュール `sectionTrimmer.ts` | 冪等性の単体テストが容易 |
| 品質ゲート報告の配置 | 独立モジュール `qualityGateReporter.ts` | 報告ロジックの分離 |
| compact オプションの渡し方 | `generatePrompt` の第3引数にオプションオブジェクト | 後方互換性を維持しつつ拡張可能 |
| テンプレート簡潔化の方式 | `loadRuleTemplates` にオプション追加 | 既存APIの自然な拡張 |
| 品質ゲートスキップの判定 | 変更ファイル拡張子ベース | シンプルで予測可能なルール |

## Dependencies

- 新規外部依存: なし（標準ライブラリのみ使用）
- 既存依存への影響: なし
- テスト依存: `fast-check`（既に devDependencies に含まれる）
