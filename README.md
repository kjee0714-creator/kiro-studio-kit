# Kiro Studio Kit

[![npm version](https://img.shields.io/npm/v/kiro-studio-kit)](https://www.npmjs.com/package/kiro-studio-kit)
[![license](https://img.shields.io/npm/l/kiro-studio-kit)](./LICENSE)

> Turn task.md into a structured AI development prompt with roles, rules, and reproducible logs.

```bash
npx kiro-studio-kit prompt ./task.md
```

AI アシスタント向けの軽量なプロンプト生成 CLI ツール。

`task.md` を入力するだけで、役割分担・品質ゲート・暴走防止・トークン節約ルールを含む構造化プロンプトと、公開用ログテンプレートを自動生成します。

## What is this?

Kiro Studio Kit is not just a prompt generator.
It is a **reproducible AI-driven development workflow**.

## Quick Start (30 sec)

```bash
npm install
npm run studio:prompt -- ./examples/task.md
```

パッケージとしてインストールした場合:

```bash
npx kiro-studio-kit prompt ./examples/task.md
```

Outputs:
- `outputs/kiro-prompt.md` — structured prompt with roles & rules
- `outputs/public-log-template.md` — reproducible development log
- `.studio/` — experiment logs & token ledger

## 主な機能

- **Role Sequence** — Director / Architect / Implementer / QA の4役割による段階的な作業管理
- **Token Economy** — 必要最小限のファイル読み込み、差分報告のみ、要点中心の返答
- **Anti-Runaway** — 同じエラー2回で停止、スコープ外変更で停止、型安全破壊で停止
- **Quality Gates** — typecheck / lint / test / build の実行と結果記録
- **Completion Criteria** — 実装完了・変更範囲説明・品質ゲート結果・残課題の明示
- **Public Log Template** — 再現可能な作業記録テンプレートの自動生成
- **Experiment Logger** — プロンプト生成ごとの実験ログを `.studio/experiments.jsonl` に自動記録
- **Token Ledger** — 文字数ベースのトークン推定量を `.studio/token-ledger.jsonl` に自動記録

## インストール

ローカル開発:

```bash
npm install
```

パッケージとして利用:

```bash
npm install kiro-studio-kit
```

## 使い方

```bash
npm run studio:prompt -- ./examples/task.md
```

パッケージとしてインストールした場合:

```bash
npx kiro-studio-kit prompt ./task.md
npx kiro-studio-kit summary
```

カスタム出力ディレクトリを指定する場合:

```bash
npm run studio:prompt -- ./examples/task.md --out ./outputs/my-project
```

または直接実行:

```bash
npx tsx src/cli.ts prompt ./examples/task.md
```

### 出力ファイル

| ファイル | 内容 |
|---|---|
| `outputs/kiro-prompt.md` | 構造化された AI 向けプロンプト |
| `outputs/public-log-template.md` | 公開用の作業ログテンプレート |
| `.studio/experiments.jsonl` | 実験ログ（JSONL形式、追記） |
| `.studio/token-ledger.jsonl` | トークン台帳（JSONL形式、追記） |

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

## 生成されるプロンプトの構造

```
# Kiro Prompt
├── Goal
├── Scope
├── Non-goals
├── Context Manifest
├── Role Sequence
│   ├── 1. Director
│   ├── 2. Architect
│   ├── 3. Implementer
│   └── 4. QA
├── Implementation Rules
├── Token Economy Rules
├── Anti-Runaway Rules
├── Quality Gates
├── Completion Criteria
└── Required Final Report
```

## プロジェクト構造

```
kiro-studio-kit/
├── src/
│   ├── cli.ts                    # CLI エントリポイント
│   └── core/
│       ├── experimentLogger.ts   # 実験ログ記録
│       ├── fileUtils.ts          # ファイル I/O ユーティリティ
│       ├── promptGenerator.ts    # プロンプト組み立て・生成
│       ├── templateLoader.ts     # テンプレート読み込み
│       └── tokenLedger.ts        # トークン台帳記録
├── templates/
│   ├── roles/
│   │   ├── director.md           # ディレクター役割定義
│   │   ├── architect.md          # アーキテクト役割定義
│   │   ├── implementer.md        # 実装者役割定義
│   │   └── qa.md                 # QA 役割定義
│   ├── rules/
│   │   ├── token-economy.md      # トークン節約ルール
│   │   ├── anti-runaway.md       # 暴走防止ルール
│   │   ├── quality-gates.md      # 品質ゲートルール
│   │   └── completion-criteria.md # 完了基準
│   └── public-log-template.md    # 公開ログテンプレート
├── .studio/                      # 実験ログ出力先
├── examples/
│   └── task.md                   # サンプルタスクファイル
├── outputs/                      # 生成ファイル出力先
├── package.json
└── tsconfig.json
```

## テンプレートのカスタマイズ

`templates/` 配下の Markdown ファイルを直接編集することで、生成されるプロンプトの内容をカスタマイズできます。

### 役割テンプレート (`templates/roles/`)

各役割の責務・チェック観点を編集できます。プロジェクトの特性に合わせて調整してください。

### ルールテンプレート (`templates/rules/`)

トークン節約・暴走防止・品質ゲート・完了基準のルールを編集できます。チームの運用ルールに合わせてカスタマイズしてください。

### 公開ログテンプレート (`templates/public-log-template.md`)

作業ログのフォーマットを編集できます。プロジェクトの報告要件に合わせて項目を追加・削除してください。

## 品質ゲート

```bash
npm run typecheck   # TypeScript 型チェック
npm run test        # テスト実行 (Vitest)
npm run build       # TypeScript コンパイル
```

## 設計思想

- **AI に丸投げしない** — 役割分担とフェーズ管理で作業を構造化する
- **小さいタスク単位** — 一度に大きな変更をせず、検証可能な単位で進める
- **品質ゲート必須** — typecheck / test / build を必ず通す
- **トークン消費を抑える** — 必要最小限のコンテキストで効率的に作業する
- **公開可能なログを残す** — 再現可能な作業記録を標準化する

## 今後の拡張予定

- **Experiment Comparison** — 実験ログの比較・分析レポート
- **Token Budget Alerts** — トークン予算超過時の警告
- **Project-specific Presets** — プロジェクト固有のテンプレートプリセット
- **RT3/CTE Preset** — 特定プロジェクト向けの設定テンプレート

## ライセンス

MIT
