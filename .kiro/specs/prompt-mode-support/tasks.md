# 実装計画: prompt-mode-support

## 概要

`kiro-studio-kit` の `prompt` コマンドに `--mode` オプションを追加し、`full`・`compact`・`minimal` の3モードを切り替えられるようにする。既存の `--compact` フラグは後方互換性のために維持する。実装は段階的に進め、各ステップで既存の挙動を壊さないことを確認しながら進める。

## タスク

- [x] 1. `PromptMode` 型と `resolvePromptMode` の導入
  - [x] 1.1 `PromptMode` 型を `src/core/promptGenerator.ts` に追加する
    - `export type PromptMode = "full" | "compact" | "minimal"` を定義してエクスポートする
    - _要件: 3.1_
  - [x] 1.2 `GenerateOptions` に `mode?: PromptMode` フィールドを追加する
    - 既存の `compact?: boolean` フィールドは後方互換のため維持する
    - _要件: 3.2_
  - [x] 1.3 `resolvePromptMode(options: GenerateOptions): PromptMode` を実装・エクスポートする
    - 優先順位: `options.mode` > `options.compact === true` → `"compact"` > デフォルト `"full"`
    - この段階では既存の `generatePrompt` 内の挙動は変更しない
    - _要件: 3.3_

- [x] 2. CLI の `--mode` オプション対応
  - [x] 2.1 `src/cli.ts` に `parseMode()` 関数を追加する
    - シグネチャ: `export function parseMode(args: string[]): { mode: PromptMode | null; invalid: string | null }`
    - `--mode` が指定されない場合は `{ mode: null, invalid: null }` を返す
    - 有効値（`"full"` / `"compact"` / `"minimal"`）の場合は `{ mode: <値>, invalid: null }` を返す
    - 無効値の場合は `{ mode: null, invalid: <値> }` を返す
    - `--mode` の後に値がない場合は `{ mode: null, invalid: "" }` を返す
    - _要件: 1.4_
  - [x] 2.2 `handlePrompt()` を `--mode` 対応に更新する
    - `parseMode(args)` を呼び出し、`invalid !== null` の場合は stderr にエラーメッセージを出力して `process.exit(1)` する
    - `--compact` と `--mode` が同時に指定された場合は stderr に警告を出力し、`--mode` を優先する
    - `generatePrompt` の呼び出しに `mode` オプションを渡す
    - _要件: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3_
  - [x] 2.3 `showUsage()` を更新する
    - シグネチャを `kiro-studio-kit prompt <task-file> [--out <output-dir>] [--mode <full|compact|minimal>] [--compact]` に更新する
    - `--mode` オプションの説明を追加する
    - `--compact` の説明に「後方互換、`--mode compact` と同等」を追記する
    - _要件: 6.1_

- [x] 3. `promptGenerator.ts` の mode 対応リファクタ
  - [x] 3.1 `options?.compact` の直接参照を `resolvePromptMode` 経由に変更する
    - `generatePrompt` 内の `if (options?.compact)` を `resolvePromptMode(options ?? {})` の戻り値で判定するよう変更する
    - `loadGenerationInputs` に渡す `compact` フラグも `resolvePromptMode` 経由にする
    - _要件: 3.4_
  - [x] 3.2 `generatePrompt` に `full` / `compact` / `minimal` の3分岐を追加する
    - `full`: 既存の通常モードロジック（変更なし）
    - `compact`: 既存の `compactTransform` + `trimSection` ロジック（変更なし）
    - `minimal`: `assembleMinimalPrompt` を呼び出す（次タスクで実装）
    - _要件: 1.1, 1.2, 1.3_

- [x] 4. `minimal` モードのプロンプト生成実装
  - [x] 4.1 `assembleMinimalPrompt(task: ParsedTask): string` を `src/core/promptGenerator.ts` に追加する
    - テンプレートファイルに依存せず、インラインで文字列を組み立てる
    - Design の Appendix に記載された構造に従う:
      - `# Kiro Prompt (Minimal)` ヘッダー
      - `## Goal` / `## Scope` / `## Non-goals` セクション（task の内容を展開）
      - `## Implementation Rules`（既存パターン遵守・最小差分・スコープ外禁止・同一エラー2回停止）
      - `## Quality Gates`（`npm run typecheck` / `npm run lint` / `npm run test` / `npm run build`）
      - スキップ時の理由報告指示
      - `## Required Final Report`（変更ファイル・変更サマリー・品質ゲート結果・残課題）
    - Role Sequence セクション（Director/Architect/Implementer/QA）を含まない
    - _要件: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_
  - [x] 4.2 `generatePrompt` の `minimal` 分岐で `assembleMinimalPrompt` を呼び出す
    - `minimal` モード時は `loadRoleTemplates` / `loadRuleTemplates` の呼び出しをスキップしてよい
    - `tokenReduction` は `minimal` モードでは計算しない（`compactTransform` を適用しないため）
    - _要件: 4.1〜4.7_

- [x] 5. ログへの `promptMode` フィールド追加
  - [x] 5.1 `TokenLedgerRecord` に `promptMode: PromptMode` フィールドを追加する（`src/core/tokenLedger.ts`）
    - `PromptMode` 型を `promptGenerator.ts` からインポートする
    - _要件: 5.1_
  - [x] 5.2 `ExperimentRecord` に `promptMode: PromptMode` フィールドを追加する（`src/core/experimentLogger.ts`）
    - `PromptMode` 型を `promptGenerator.ts` からインポートする
    - _要件: 5.1_
  - [x] 5.3 `writeGenerationLogs` の呼び出し箇所を更新して `promptMode` を渡す
    - `compact` または `minimal` モード時は `compactMode.enabled: true` を維持する
    - `minimal` モード時も `compactMode.enabled: true` を記録する（要件 5.3 の互換性維持）
    - _要件: 5.1, 5.2, 5.3_

- [x] 6. チェックポイント — 品質ゲートの確認
  - すべてのテストが通ることを確認する。疑問点があればユーザーに確認する。
  - ```bash
    npm run typecheck
    npm run lint
    npm run test
    npm run build
    ```

- [x] 7. README の更新
  - [x] 7.1 `prompt` コマンドのシグネチャを更新する
    - `kiro-studio-kit prompt <task-file> [--out <output-dir>] [--mode <full|compact|minimal>] [--compact]` に変更する
    - _要件: 6.1_
  - [x] 7.2 モード表を追加する
    - `full`・`compact`・`minimal` の3モードを説明する表を追加する
    - _要件: 6.2_
  - [x] 7.3 `--compact` 後方互換の注記を追加する
    - `--compact` が後方互換のために残されており、`--mode compact` と同等であることを明記する
    - _要件: 6.3_

- [x] 8. テストの追加・更新
  - [x] 8.1 `src/__tests__/cli.test.ts` に `parseMode` のユニットテストを追加する
    - `--mode full` / `--mode compact` / `--mode minimal` の正常系
    - `--mode` が指定されない場合は `null` を返す
    - `--mode` に不正値が指定された場合は `invalid` を返す
    - `--compact` と `--mode` が同時に指定された場合の警告・優先順位
    - _要件: 7.4, 7.5_
  - [ ]* 8.2 Property 1: 不正な `--mode` 値は常にエラーになる（fast-check, numRuns: 100）
    - **Property 1: 不正な `--mode` 値は常にエラーになる**
    - `"full"` / `"compact"` / `"minimal"` 以外の任意の文字列 `s` に対して `parseMode(["--mode", s])` が `{ mode: null, invalid: s }` を返すことを検証する
    - **検証: 要件 1.4**
  - [x] 8.3 `src/__tests__/promptGenerator.test.ts` に `resolvePromptMode` のユニットテストを追加する
    - `mode` あり / `compact: true` / デフォルト の各ケース
    - _要件: 3.3, 7.1, 7.2_
  - [ ]* 8.4 Property 2: `resolvePromptMode` の優先順位不変条件（fast-check, numRuns: 100）
    - **Property 2: `resolvePromptMode` の優先順位不変条件**
    - 任意の `GenerateOptions` に対して優先順位（`mode` > `compact` > デフォルト `"full"`）が常に守られることを検証する
    - **検証: 要件 3.3**
  - [x] 8.5 `src/__tests__/promptGenerator.test.ts` に `assembleMinimalPrompt` のユニットテストを追加する
    - Goal / Scope / Non-goals が展開されること
    - 品質ゲートコマンドが含まれること
    - スキップ理由報告の文言が含まれること
    - 最終報告フォーマットが含まれること
    - Role Sequence セクションが含まれないこと
    - _要件: 4.1〜4.6, 7.3, 7.6, 7.7_
  - [ ]* 8.6 Property 3: minimal モードは Goal・Scope・Non-goals を常に含む（fast-check, numRuns: 100）
    - **Property 3: minimal モードは Goal・Scope・Non-goals を常に含む**
    - 任意の `ParsedTask` に対して `assembleMinimalPrompt(task)` の出力が `goal` / `scope` / `nonGoals` の内容を含むことを検証する
    - **検証: 要件 4.1**
  - [ ]* 8.7 Property 4: minimal モードは Role Sequence セクションを含まない（fast-check, numRuns: 100）
    - **Property 4: minimal モードは Role Sequence セクションを含まない**
    - 任意の `ParsedTask` に対して `assembleMinimalPrompt(task)` の出力が `### 1. Director` / `### 2. Architect` / `### 3. Implementer` / `### 4. QA` のいずれも含まないことを検証する
    - **検証: 要件 4.6**
  - [ ]* 8.8 Property 5: minimal モードのトークン数は full モードより少ない（fast-check, numRuns: 100）
    - **Property 5: minimal モードのトークン数は full モードより少ない**
    - 任意の `ParsedTask` / `RoleTemplates` / `RuleTemplates` に対して `assembleMinimalPrompt(task)` のトークン推定値が `assemblePrompt(task, roles, rules)` のトークン推定値より少ないことを検証する
    - **検証: 要件 4.7**
  - [x] 8.9 `src/__tests__/tokenLedger.test.ts` に `promptMode` フィールドの記録確認テストを追加する
    - `full` / `compact` / `minimal` 各モードで `promptMode` フィールドが正しく記録されること
    - `compact` / `minimal` モード時に `compactMode.enabled: true` が記録されること
    - _要件: 5.1, 5.2, 5.3, 7.8_

- [x] 9. 最終チェックポイント — 全テスト通過の確認
  - すべてのテストが通ることを確認する。疑問点があればユーザーに確認する。
  - ```bash
    npm run typecheck
    npm run lint
    npm run test
    npm run build
    ```

## 注記

- `*` が付いたサブタスクはオプションであり、MVP を優先する場合はスキップ可能
- 各タスクは対応する要件番号を参照しており、トレーサビリティを確保している
- チェックポイントで品質ゲートを実行し、段階的に動作を検証する
- プロパティテストは `fast-check` を使用し、各プロパティ最低 100 イテレーション実行する
