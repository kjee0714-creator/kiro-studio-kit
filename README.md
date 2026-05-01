# Kiro Studio Kit

[![npm version](https://img.shields.io/npm/v/kiro-studio-kit)](https://www.npmjs.com/package/kiro-studio-kit)
[![license](https://img.shields.io/npm/l/kiro-studio-kit)](./LICENSE)

For developers using AI coding tools (ChatGPT, Claude, Cursor, Kiro).

> Turn task.md into a structured AI development prompt with roles, rules, and reproducible logs.
>
> **Control how AI develops, not just what it generates.**

```bash
npx kiro-studio-kit@latest prompt ./task.md --mode auto
```

AI アシスタント向けの軽量なプロンプト生成 CLI ツール。

`task.md` を入力するだけで、役割分担・品質ゲート・暴走防止・トークン節約ルールを含む構造化プロンプトと、公開用ログテンプレートを自動生成します。

---

## Why?

Most AI tools generate code.
Kiro Studio Kit controls **how** AI develops.

Kiro Studio Kit is not just a prompt generator — it is a control layer for AI-driven development.

---

## Quick Start

```bash
npm install
npm run studio:prompt -- ./examples/task.md
```

パッケージとしてインストールした場合:

```bash
npx kiro-studio-kit@latest prompt ./examples/task.md
```

auto モードで実行:

```bash
npx kiro-studio-kit@latest prompt ./task.md --mode auto
```

---

## Try it in 1 minute

Create a minimal task file:

```bash
cat > task.md <<'EOF'
# Task

## Goal
Fix a small README typo

## Scope
Documentation only

## Non-goals
No code changes
EOF
```

Generate a prompt with auto mode:

```bash
npx kiro-studio-kit@latest prompt ./task.md --mode auto
```

You should see output like:

```
🤖 auto mode: minimal selected
✅ Prompt: outputs/kiro-prompt.md
✅ Public log template: outputs/public-log-template.md
✅ Token ledger: .studio/token-ledger.jsonl
✅ Experiment log: .studio/experiments.jsonl
```

Then open the generated prompt:

```bash
cat outputs/kiro-prompt.md
```

**Windows PowerShell:**

```powershell
@"
# Task

## Goal
Fix a small README typo

## Scope
Documentation only

## Non-goals
No code changes
"@ | Set-Content -Encoding UTF8 task.md

npx kiro-studio-kit@latest prompt ./task.md --mode auto
```

---

## CLI リファレンス

### `prompt` コマンド

```
kiro-studio-kit prompt <task-file> [--out <output-dir>] [--mode <full|compact|minimal|auto>] [--compact]
```

### プロンプト生成モード

| Mode | 用途 | 説明 |
|------|------|------|
| `full` | 新機能・設計変更・重要タスク | 役割分担とルールをすべて含む |
| `compact` | 通常作業 | fullから見出しや説明を削減 |
| `minimal` | 小修正・継続作業 | 最小限の実行ルールと品質ゲートのみ |
| `auto` | モード選択を自動化したい場合 | task.md をスコアリングし、説明可能なルールベースで最適なモードを選択 |

> **Note:** `--compact` フラグは後方互換のために残されています。`--mode compact` と同等の動作をします。`--mode` と `--compact` が同時に指定された場合は `--mode` が優先されます。

### auto モードのスコアリングルール

`--mode auto` enables deterministic, rule-based prompt selection.
It analyzes `task.md` (Goal and Scope sections) and selects the most appropriate mode:

- **minimal** for small fixes (typo, README edits)
- **compact** for normal work (no special keywords)
- **full** for complex or risky changes (schema, auth, migration, refactor)

The decision is explainable and logged for later analysis.

`--mode auto` を指定すると、task.md の内容をキーワードスコアリングで分析し、最適なモードを決定論的に選択します。
スコアリング対象は Goal と Scope のみです（Non-goals は除外）。

#### キーワード定義

| カテゴリ | キーワード | スコア |
|---|---|---|
| Full_Keyword | 設計, architecture, リファクタ, refactor, 新機能, feature, API, DB, schema, 認証, auth, migration, 破壊的変更, breaking, 複数ファイル, テスト追加, 品質ゲート, property, fast-check | +1（各キーワードごと） |
| Minimal_Keyword | typo, 誤字, 文言修正, README, コメント修正, 小修正, 1ファイル, 継続, 微修正 | -1（各キーワードごと） |
| Safety_Keyword | schema, auth, migration, breaking, refactor, リファクタ | スコアに関係なく full を強制 |

#### 閾値ルール

| 条件 | 選択されるモード |
|---|---|
| Safety_Keyword にマッチ | `full`（強制） |
| score >= 4 | `full` |
| 1 <= score < 4 | `compact` |
| score <= 0 | `minimal` |
| キーワードヒットなし | `compact`（デフォルト） |

- 英語キーワードは `\b`（単語境界）でマッチし、大文字小文字を区別しません
- 日本語キーワードは部分文字列マッチです

| オプション | 説明 | デフォルト |
|---|---|---|
| `<task-file>` | 入力する task.md のパス（必須） | — |
| `--out <dir>` | 出力ディレクトリ | `outputs/` |
| `--mode <full\|compact\|minimal\|auto>` | プロンプト生成モードを指定する | `full` |
| `--compact` | コンパクトモードでプロンプトを生成（後方互換、`--mode compact` と同等） | 無効 |

**出力例（通常モード）:**
```
✅ プロンプト: outputs/kiro-prompt.md
✅ 公開ログテンプレ: outputs/public-log-template.md
✅ トークン台帳: .studio/token-ledger.jsonl
✅ 実験ログ: .studio/experiments.jsonl
```

**出力例（--compact モード）:**
```
✅ プロンプト: outputs/kiro-prompt.md
✅ 公開ログテンプレ: outputs/public-log-template.md
✅ トークン台帳: .studio/token-ledger.jsonl
✅ 実験ログ: .studio/experiments.jsonl
📊 トークン削減: 1968 → 1674 (14.9% 削減)
```

**出力例（--mode auto）:**
```
$ kiro-studio-kit prompt task.md --mode auto
🤖 auto mode: compact selected 理由: Full_Keyword: 設計 (+1), Full_Keyword: API (+1)
✅ プロンプト: outputs/kiro-prompt.md
✅ 公開ログテンプレ: outputs/public-log-template.md
```

### `summary` コマンド

```
kiro-studio-kit summary
```

`.studio/` 配下の実験ログとトークン台帳を集計し、統計サマリーを表示します。
auto mode の使用状況（分布・平均スコア・よく出る理由）も表示されます。

```
runs: 5
avg tokens: 2050
avg prompt size: 8200 chars
economy usage: 100%

auto usage:
  total: 3
  minimal: 1
  compact: 1
  full: 1
  avg score: 1.3

top reasons:
  Full_Keyword: schema (+1): 2
  Minimal_Keyword: README (-1): 1
```

auto mode を使用していない場合は `auto usage: none` と表示されます。

---

## 出力ファイル

| ファイル | 形式 | 内容 |
|---|---|---|
| `outputs/kiro-prompt.md` | Markdown | AI に渡す構造化プロンプト |
| `outputs/public-log-template.md` | Markdown | 公開用の作業ログテンプレート（変数展開済み） |
| `.studio/experiments.jsonl` | JSONL（追記） | 実験ログ（runId・タイムスタンプ・トークン数など） |
| `.studio/token-ledger.jsonl` | JSONL（追記） | トークン台帳（文字数・推定トークン数・コンパクトモード情報） |

---

## task.md の書き方

`## Goal`、`## Scope`、`## Non-goals` の3セクションを Markdown で記述します。

```markdown
# My Task

## Goal
ユーザー認証機能を実装する

## Scope
バックエンド API のみ

## Non-goals
フロントエンド UI は対象外
```

セクションが省略された場合はデフォルトのプレースホルダーが挿入されます。

---

## 生成されるプロンプトの構造

```
# Kiro Prompt
├── Goal              ← task.md の ## Goal
├── Scope             ← task.md の ## Scope
├── Non-goals         ← task.md の ## Non-goals
├── Context Manifest  ← ファイル読み込み制限の指示（固定）
├── Role Sequence
│   ├── 1. Director   ← templates/roles/director.md
│   ├── 2. Architect  ← templates/roles/architect.md
│   ├── 3. Implementer← templates/roles/implementer.md
│   └── 4. QA         ← templates/roles/qa.md
├── Implementation Rules（固定）
├── Token Economy Rules   ← templates/rules/token-economy.md
├── Anti-Runaway Rules    ← templates/rules/anti-runaway.md
├── Quality Gates         ← templates/rules/quality-gates.md
├── Completion Criteria   ← templates/rules/completion-criteria.md
└── Required Final Report（固定）
```

---

## 機能詳細

### 1. プロンプト生成（`generatePrompt`）

`task.md` を読み込み、テンプレートと組み合わせて構造化プロンプトを生成します。

- `## Goal` / `## Scope` / `## Non-goals` を抽出してプロンプトに埋め込む
- セクションが存在しない場合はデフォルトのプレースホルダーを使用
- ロールテンプレート・ルールテンプレートを並列（`Promise.all`）で読み込む
- テンプレート内の `{{variable}}` を task.md の内容で展開する（例: `{{goal}}`、`{{scope}}`）
- 生成後に実験ログとトークン台帳を自動記録する

### 2. コンパクトモード（`--compact`）

`--compact` フラグを指定すると、プロンプトのトークン消費量を削減します。

**適用される変換（順番に実行）:**

| 変換 | 内容 |
|---|---|
| 見出し行の除去 | `#`、`##`、`###` などで始まる行をすべて除去 |
| 連続空行の圧縮 | 3行以上の連続空行を1行の空行に圧縮 |
| 箇条書き空白の正規化 | `- ` / `* ` / `+ ` の後の余分な空白を1つに統一 |
| 末尾空白の除去 | 各行の末尾スペース・タブを除去 |
| 末尾空白行の除去 | ファイル末尾の空白行を除去 |

**品質ゲートテンプレートの簡潔化:**
コンパクトモード時は `templates/rules/quality-gates.md` から説明文を除去し、コードブロック内のコマンドと箇条書きルールのみを保持します。

**削減効果の目安（実測値）:**

| モード | 最小タスク | 大きめタスク |
|---|---|---|
| 通常 | 約 1,970 tokens | 約 2,120 tokens |
| --compact | 約 1,670 tokens | 約 1,820 tokens |
| 削減量 | 約 295 tokens (▲15%) | 約 295 tokens (▲14%) |

### 3. セクショントリミング（`trimSection`）

プロンプト文字列の冗長な空白を除去する純粋関数です。

- 末尾の空白行を除去
- 3行以上の連続空行を1行に圧縮
- 各行の末尾空白（スペース・タブ）を除去
- **冪等性保証**: `trimSection(trimSection(x)) === trimSection(x)`
- **意味的内容保持**: 非空白文字の順序は変更しない

### 4. テンプレート並列読み込み（`loadRoleTemplates` / `loadRuleTemplates`）

ロールテンプレート4本・ルールテンプレート4本を `Promise.all` で並列に読み込みます。

```typescript
// LoadRuleOptions で compact モードを指定可能
const rules = await loadRuleTemplates({ compact: true });
```

`compact: true` を指定すると、`quality-gates.md` から説明文を除去した簡潔版を返します（他の3ファイルは変更なし）。

### 5. 品質ゲートレポーター（`formatGateResults` / `determineSkippableGates`）

品質ゲートの実行結果をトークン効率の高い Markdown テーブル形式で出力します。

**出力フォーマット:**
```
| Gate       | Result | Duration |
|---|---|---|
| typecheck  | PASS   | 1200ms   |
| lint       | FAIL   | 800ms    |
  Error: no-unused-vars
  Fix: removed unused import
  Retry: PASS
| build      | SKIP   | .md files only |
```

- **PASS**: 1行サマリー（ゲート名・結果・所要時間）
- **FAIL**: 詳細行（エラー内容・修正内容・再実行結果）を追加出力
- **SKIP**: 1行（ゲート名・結果・スキップ理由）

**スキップ判定（`determineSkippableGates`）:**
変更ファイルがすべて `.md` 拡張子の場合、`typecheck`・`lint`・`build` をスキップ対象として返します（`test` は常に実行）。

### 6. テンプレート変数展開（`expandTemplate`）

テンプレート文字列内の `{{variable}}` を辞書の値で展開します。

```typescript
expandTemplate("Scope: {{scope}}", { scope: "バックエンドのみ" });
// → "Scope: バックエンドのみ"
```

未定義の変数は空文字列に置換されます。

### 7. 実験ログ（`appendExperimentRecord`）

プロンプト生成ごとに `.studio/experiments.jsonl` へ以下の情報を追記します。

| フィールド | 内容 |
|---|---|
| `runId` | UUID（実行ごとに一意） |
| `timestamp` | ISO 8601 形式のタイムスタンプ |
| `taskFile` | 入力した task.md のパス |
| `promptPath` | 生成されたプロンプトのパス |
| `estimatedTokens` | 推定トークン数（合計） |
| `features` | 有効な機能フラグ（tokenEconomy, antiRunaway, qualityGates, publicLog, tokenLedger） |
| `estimated.contextMode` | コンテキストモード（常に `"economy"`） |

### 8. トークン台帳（`appendTokenLedgerRecord`）

プロンプト生成ごとに `.studio/token-ledger.jsonl` へ以下の情報を追記します。

| フィールド | 内容 |
|---|---|
| `runId` | 実験ログと同一の UUID |
| `files.taskFileChars` | task.md の文字数 |
| `files.promptChars` | 生成プロンプトの文字数 |
| `estimatedTokens.total` | 推定トークン数（合計） |
| `limits` | コンテキストファイル上限・変更ファイル上限・リトライ上限 |
| `economyFeatures` | トークン節約機能の有効フラグ |
| `compactMode` | コンパクトモード使用時のみ: `enabled`・`tokensSaved`・`reductionPercent` |

**トークン推定アルゴリズム（`estimateTokensFromChars`）:**
- ASCII 文字: 4文字 ≒ 1 トークン
- 非 ASCII 文字（日本語等）: 1.5文字 ≒ 1 トークン

### 9. 実験サマリー（`generateExperimentSummary`）

`.studio/` 配下のログを集計して統計情報を返します。

| フィールド | 内容 |
|---|---|
| `runs` | 総実行回数 |
| `avgTokens` | 平均推定トークン数 |
| `avgPromptSizeChars` | 平均プロンプト文字数 |
| `economyUsagePercent` | エコノミーモード使用率（%） |

### 10. JSONL ロガー（`appendJsonlRecord` / `readJsonlFile`）

汎用の JSONL ファイル操作ユーティリティです。

- **書き込み**: 親ディレクトリを自動作成し、1行追記。失敗時は1回リトライ
- **読み込み**: ファイルが存在しない場合は空配列を返す。壊れた行はスキップ

### 11. ファイルユーティリティ（`readTextFile` / `writeTextFile` / `fileExists`）

ファイル I/O の共通処理です。

- `readTextFile`: ENOENT / EACCES を日本語エラーメッセージに変換
- `writeTextFile`: 親ディレクトリを `recursive: true` で自動作成
- `fileExists`: 存在確認（例外を投げず boolean を返す）

---

## テンプレートのカスタマイズ

`templates/` 配下の Markdown ファイルを直接編集することで、生成されるプロンプトの内容をカスタマイズできます。

### 役割テンプレート（`templates/roles/`）

| ファイル | 役割 | 主な責務 |
|---|---|---|
| `director.md` | ディレクター | 目的ズレ検出・スコープ拡大防止・MVP範囲遵守・仕様判断時の停止 |
| `architect.md` | アーキテクト | 責務分離・データ構造設計・依存関係管理・既存構造との整合性 |
| `implementer.md` | 実装者 | 小さい単位での実装・型安全・既存挙動の保護・変更理由の明確化 |
| `qa.md` | QA | typecheck/build 実行確認・回帰確認・境界値確認 |

テンプレート内では `{{goal}}`、`{{scope}}`、`{{nonGoals}}` の変数が使用可能です。

### ルールテンプレート（`templates/rules/`）

| ファイル | 内容 |
|---|---|
| `token-economy.md` | ファイル読み込み制限（5個まで）・差分報告のみ・変更ファイル3個まで・同一エラー2回で停止 |
| `anti-runaway.md` | 同じエラー2回で停止・スコープ外変更で停止・型安全破壊で停止・既存API互換性破壊で停止 |
| `quality-gates.md` | `npm run typecheck/lint/test/build` の実行・スキップ報告・失敗時の記録 |
| `completion-criteria.md` | 実装完了・変更範囲説明・品質ゲート結果・残課題の明示 |

---

## プロジェクト構造

```
kiro-studio-kit/
├── src/
│   ├── cli.ts                          # CLI エントリポイント
│   ├── index.ts                        # パッケージ公開 API
│   └── core/
│       ├── promptGenerator.ts          # プロンプト組み立て・生成（メインパイプライン）
│       ├── autoModeResolver.ts         # auto モードのキーワードスコアリングエンジン
│       ├── templateLoader.ts           # テンプレート並列読み込み・stripExplanations
│       ├── templateExpander.ts         # {{variable}} 展開
│       ├── compactTransformer.ts       # コンパクト変換（見出し除去・空行圧縮・箇条書き正規化）
│       ├── sectionTrimmer.ts           # セクショントリミング（冪等性保証）
│       ├── qualityGateReporter.ts      # 品質ゲート結果フォーマット・スキップ判定
│       ├── experimentLogger.ts         # 実験ログ記録
│       ├── experimentSummary.ts        # 実験サマリー生成
│       ├── tokenLedger.ts              # トークン台帳記録・トークン推定
│       ├── jsonlLogger.ts              # JSONL 汎用ロガー
│       └── fileUtils.ts                # ファイル I/O ユーティリティ
├── templates/
│   ├── roles/
│   │   ├── director.md
│   │   ├── architect.md
│   │   ├── implementer.md
│   │   └── qa.md
│   ├── rules/
│   │   ├── token-economy.md
│   │   ├── anti-runaway.md
│   │   ├── quality-gates.md
│   │   └── completion-criteria.md
│   └── public-log-template.md
├── .studio/                            # 実験ログ・トークン台帳の出力先
├── examples/
│   └── task.md                         # サンプルタスクファイル
└── outputs/                            # 生成ファイルの出力先
```

---

## 公開 API（Node.js パッケージとして利用する場合）

```typescript
import {
  // プロンプト生成
  generatePrompt,
  assemblePrompt,
  assembleMinimalPrompt,
  resolvePromptMode,
  parseTaskFile,

  // auto モード
  selectPromptModeFromTask,

  // テンプレート
  loadRoleTemplates,
  loadRuleTemplates,
  loadPublicLogTemplate,
  getTemplatesDir,
  expandTemplate,

  // コンパクト変換
  compactTransform,
  trimSection,

  // 品質ゲート
  formatGateResults,
  determineSkippableGates,

  // ログ・サマリー
  appendExperimentRecord,
  appendTokenLedgerRecord,
  appendJsonlRecord,
  readJsonlFile,
  generateExperimentSummary,
  generateFullExperimentSummary,
  generateAutoModeSummary,
  formatExperimentSummary,
  estimateTokensFromChars,

  // ファイル I/O
  readTextFile,
  writeTextFile,
  fileExists,
} from "kiro-studio-kit";
```

### 主要な型

```typescript
// プロンプト生成モード（内部で使用される実モード）
type PromptMode = "full" | "compact" | "minimal";

// ユーザーが CLI / API で指定するモード（"auto" を含む）
type RequestedPromptMode = PromptMode | "auto";

// generatePrompt の引数
interface GenerateOptions {
  mode?: RequestedPromptMode; // プロンプト生成モード（デフォルト: "full"）
  compact?: boolean;          // 後方互換（--mode compact と同等）
}

// generatePrompt の戻り値
interface GenerateResult {
  promptPath: string;
  publicLogPath: string;
  experimentLogPath?: string;
  tokenLedgerPath?: string;
  tokenReduction?: TokenReduction;      // --compact 時のみ
  autoModeDecision?: AutoModeDecision;  // --mode auto 時のみ
}

// auto モード判定結果
interface AutoModeDecision {
  requestedMode: "auto";
  resolvedMode: PromptMode;
  score: number;
  reasons: string[];
}

// トークン削減情報
interface TokenReduction {
  before: number;          // 削減前トークン数
  after: number;           // 削減後トークン数
  saved: number;           // 削減トークン数
  reductionPercent: number; // 削減率（%）
}

// コンパクト変換オプション
interface CompactOptions {
  removeHeadings: boolean;       // 見出し行を除去
  compressBlankLines: boolean;   // 連続空行を圧縮
  normalizeListSpacing: boolean; // 箇条書き空白を正規化
}

// 品質ゲート結果
interface GateResult {
  name: string;
  status: "pass" | "fail" | "skip";
  durationMs?: number;
  error?: string;
  fix?: string;
  retryResult?: "pass" | "fail";
  skipReason?: string;
}

// auto モード集計結果
interface AutoModeSummary {
  totalAutoRuns: number;
  resolvedCounts: { minimal: number; compact: number; full: number };
  avgScore: number;
  topReasons: Array<{ reason: string; count: number }>;
}
```

---

## 品質ゲート（開発時）

```bash
npm run typecheck   # TypeScript 型チェック
npm run lint        # ESLint
npm run test        # Vitest（282テスト）
npm run build       # TypeScript コンパイル
```

テストにはプロパティベーステスト（fast-check）が含まれます:
- `trimSection` の冪等性・末尾空白除去・意味的内容保持
- `compactTransform` の見出し除去・空行圧縮・箇条書き正規化
- `stripExplanations` のコマンド保持
- トークン削減量の非負性
- `autoModeResolver` の resolvedMode 有効性・reasons 非空性・Safety キーワード強制・スコア閾値整合性・大文字小文字無視・nonGoals 除外

---

## 設計思想

- **AI に丸投げしない** — 役割分担とフェーズ管理で作業を構造化する
- **小さいタスク単位** — 一度に大きな変更をせず、検証可能な単位で進める
- **品質ゲート必須** — typecheck / lint / test / build を必ず通す
- **トークン消費を抑える** — 必要最小限のコンテキストで効率的に作業する
- **公開可能なログを残す** — 再現可能な作業記録を標準化する

---

## 今後の拡張予定

- **Experiment Comparison** — 実験ログの比較・分析レポート
- **Token Budget Alerts** — トークン予算超過時の警告
- **Project-specific Presets** — プロジェクト固有のテンプレートプリセット

---

## ライセンス

MIT
