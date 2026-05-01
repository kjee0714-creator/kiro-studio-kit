# 要件ドキュメント

## はじめに

kiro-studio-kit に `--mode auto` オプションを追加し、task.md の内容をルールベースのスコアリングで分析して、最適なプロンプト生成モード（full / compact / minimal）を半自動で選択する機能を実装する。AI による判断ではなく、キーワードマッチングによる決定論的なスコアリングで判定を行い、安全側に倒す設計とする。

## 用語集

- **System**: kiro-studio-kit CLI ツール全体
- **Auto_Mode_Resolver**: task.md の内容を分析し、スコアリングに基づいて PromptMode を決定するモジュール
- **ParsedTask**: task.md から抽出された goal / scope / nonGoals の構造体
- **PromptMode**: 実際のプロンプト生成モード（"full" | "compact" | "minimal"）
- **RequestedPromptMode**: ユーザーが CLI で指定するモード（PromptMode | "auto"）
- **AutoModeDecision**: auto モード判定の結果を表す構造体（resolvedMode, score, reasons を含む）
- **Score**: task.md のキーワードマッチングにより算出される数値。閾値に基づいて PromptMode に変換される
- **Full_Keyword**: score を加点するキーワード（設計, architecture, リファクタ, refactor, 新機能, feature, API, DB, schema, 認証, auth, migration, 破壊的変更, breaking, 複数ファイル, テスト追加, 品質ゲート, property, fast-check）
- **Minimal_Keyword**: score を減点するキーワード（typo, 誤字, 文言修正, README, コメント修正, 小修正, 1ファイル, 継続, 微修正）
- **Safety_Keyword**: マッチした場合に最低でも full を保証するキーワード（schema, auth, migration, breaking）
- **Experiment_Logger**: 実験ログを .studio/experiments.jsonl に記録するモジュール
- **Token_Ledger**: トークン台帳を .studio/token-ledger.jsonl に記録するモジュール

## 要件

### 要件 1: RequestedPromptMode 型の導入

**ユーザーストーリー:** 開発者として、既存の PromptMode 型を維持しつつ "auto" を含む新しい型を導入したい。これにより、型安全性を保ちながら auto モードを受け付けられるようにする。

#### 受け入れ基準

1. THE System SHALL export a `RequestedPromptMode` type defined as `PromptMode | "auto"`
2. THE System SHALL maintain the existing `PromptMode` type as `"full" | "compact" | "minimal"` without modification
3. WHEN `GenerateOptions.mode` is specified, THE System SHALL accept `RequestedPromptMode` values including `"auto"`
4. THE System SHALL export the `RequestedPromptMode` type from the public API (`src/index.ts`)

### 要件 2: AutoModeDecision インターフェースの定義

**ユーザーストーリー:** 開発者として、auto モードの判定結果を構造化されたオブジェクトとして取得したい。これにより、判定理由の表示やログ記録に利用できるようにする。

#### 受け入れ基準

1. THE System SHALL export an `AutoModeDecision` interface with the following fields: `requestedMode` (literal `"auto"`), `resolvedMode` (PromptMode), `score` (number), and `reasons` (string array)
2. WHEN auto mode resolves to a PromptMode, THE Auto_Mode_Resolver SHALL populate the `reasons` array with all matched keyword descriptions
3. THE System SHALL export the `AutoModeDecision` interface from the public API (`src/index.ts`)

### 要件 3: スコアリングによるモード判定

**ユーザーストーリー:** 開発者として、task.md の内容からルールベースのスコアリングで適切なプロンプトモードを自動選択したい。これにより、タスクの規模に応じた最適なプロンプトが生成されるようにする。

#### 受け入れ基準

1. THE Auto_Mode_Resolver SHALL provide a `selectPromptModeFromTask(task: ParsedTask): AutoModeDecision` function
2. WHEN a Full_Keyword is found in the ParsedTask content, THE Auto_Mode_Resolver SHALL increment the score
3. WHEN a Minimal_Keyword is found in the ParsedTask content, THE Auto_Mode_Resolver SHALL decrement the score
4. WHEN the score is greater than or equal to 4, THE Auto_Mode_Resolver SHALL resolve to `"full"`
5. WHEN the score is greater than or equal to 1 and less than 4, THE Auto_Mode_Resolver SHALL resolve to `"compact"`
6. WHEN the score is less than or equal to 0, THE Auto_Mode_Resolver SHALL resolve to `"minimal"`
7. WHEN a Safety_Keyword (schema, auth, migration, breaking) is found, THE Auto_Mode_Resolver SHALL resolve to `"full"` regardless of the total score
8. WHEN the keywords "refactor" or "リファクタ" are found, THE Auto_Mode_Resolver SHALL resolve to `"full"` regardless of the total score
9. WHEN no keywords match in the ParsedTask content, THE Auto_Mode_Resolver SHALL resolve to `"compact"` as the safe default AND SHALL add a default reason such as `"no keyword matched → default compact"` to the `reasons` array
10. THE Auto_Mode_Resolver SHALL perform case-insensitive keyword matching against the combined text of goal, scope, and nonGoals fields
11. THE Auto_Mode_Resolver SHALL use word boundary matching (`\b`) for English keywords to prevent false positives (e.g., "api" SHALL NOT match "capability"). Japanese keywords SHALL use simple substring matching.
12. FOR ALL valid ParsedTask inputs, THE Auto_Mode_Resolver SHALL return an AutoModeDecision with a non-empty `reasons` array explaining the resolution. The `reasons` array SHALL NEVER be empty.

### 要件 4: CLI での --mode auto サポート

**ユーザーストーリー:** 開発者として、`kiro-studio-kit prompt ./task.md --mode auto` を実行して、タスク内容に応じたモードでプロンプトを生成したい。

#### 受け入れ基準

1. WHEN `--mode auto` is specified, THE System SHALL accept the value and invoke the Auto_Mode_Resolver
2. WHEN `--compact` and `--mode auto` are specified simultaneously, THE System SHALL prioritize `--mode auto` and output a warning message
3. WHEN `--mode auto` resolves to a PromptMode, THE System SHALL display the resolution result in the format: `🤖 auto mode: <resolvedMode> selected 理由: <matched reasons>`
4. THE System SHALL update the usage help text to include `auto` as a valid mode value
5. WHEN `--mode auto` is specified, THE System SHALL pass the resolved PromptMode to `generatePrompt` for prompt generation

### 要件 5: auto モード判定結果のログ記録

**ユーザーストーリー:** 開発者として、auto モードの判定結果をログに記録したい。これにより、判定の妥当性を後から検証できるようにする。

#### 受け入れ基準

1. WHEN auto mode is used, THE Experiment_Logger SHALL record `requestedPromptMode` as `"auto"` in the experiment log
2. WHEN auto mode is used, THE Experiment_Logger SHALL record the resolved `promptMode` in the experiment log
3. WHEN auto mode is used, THE Experiment_Logger SHALL record `autoModeDecision` containing `score` and `reasons` in the experiment log
4. WHEN a non-auto mode is used, THE Experiment_Logger SHALL omit the `autoModeDecision` field from the experiment log
5. WHEN auto mode is used, THE Token_Ledger SHALL record `requestedPromptMode` as `"auto"` in the token ledger

### 要件 6: generatePrompt パイプラインの auto モード統合

**ユーザーストーリー:** 開発者として、generatePrompt 関数が auto モードを受け取り、内部で適切な PromptMode に解決してプロンプトを生成できるようにしたい。

#### 受け入れ基準

1. WHEN `GenerateOptions.mode` is `"auto"`, THE System SHALL parse the task file, invoke the Auto_Mode_Resolver, and use the resolved PromptMode for prompt generation
2. WHEN auto mode resolves to `"full"`, THE System SHALL generate a full prompt with all role and rule templates
3. WHEN auto mode resolves to `"compact"`, THE System SHALL generate a compact prompt with token reduction applied
4. WHEN auto mode resolves to `"minimal"`, THE System SHALL generate a minimal prompt without template loading
5. WHEN auto mode is used, THE System SHALL include the `AutoModeDecision` in the `GenerateResult` return value
6. THE System SHALL maintain backward compatibility: existing calls with `mode: "full"`, `mode: "compact"`, or `mode: "minimal"` SHALL produce identical results

### 要件 7: 既存機能の後方互換性

**ユーザーストーリー:** 開発者として、auto モードの追加によって既存の full / compact / minimal モードの動作が変わらないことを保証したい。

#### 受け入れ基準

1. WHEN `--mode full` is specified, THE System SHALL produce the same output as before the auto mode addition
2. WHEN `--mode compact` is specified, THE System SHALL produce the same output as before the auto mode addition
3. WHEN `--mode minimal` is specified, THE System SHALL produce the same output as before the auto mode addition
4. WHEN no `--mode` is specified, THE System SHALL default to `"full"` mode as before
5. WHEN `--compact` flag is specified without `--mode`, THE System SHALL use compact mode as before
6. THE System SHALL maintain all existing public API exports without breaking changes

### 要件 8: README の更新

**ユーザーストーリー:** 開発者として、README に --mode auto の使い方と動作説明が記載されていることで、機能を正しく利用できるようにしたい。

#### 受け入れ基準

1. THE System SHALL update the CLI reference section in README.md to include `auto` in the `--mode` option values
2. THE System SHALL add a row for `auto` in the prompt mode table with its description
3. THE System SHALL document the scoring rules and threshold values in the README
4. THE System SHALL include an example of `--mode auto` CLI output in the README

### 要件 9: テストカバレッジ

**ユーザーストーリー:** 開発者として、auto モード機能が十分なテストでカバーされていることで、リグレッションを防止したい。

#### 受け入れ基準

1. WHEN `--mode auto` is passed to the CLI, THE System SHALL accept it without error
2. WHEN a task contains Safety_Keywords, THE Auto_Mode_Resolver SHALL resolve to `"full"`
3. WHEN a task contains only Minimal_Keywords, THE Auto_Mode_Resolver SHALL resolve to `"minimal"`
4. WHEN a task contains a mix of Full_Keywords and Minimal_Keywords, THE Auto_Mode_Resolver SHALL resolve based on the net score
5. WHEN `--compact` and `--mode auto` are specified simultaneously, THE System SHALL prioritize `--mode auto` and output a warning
6. WHEN auto mode is used, THE System SHALL record the decision in experiment logs with `requestedPromptMode`, `promptMode`, and `autoModeDecision`
7. FOR ALL arbitrary ParsedTask inputs, THE Auto_Mode_Resolver SHALL return a valid PromptMode (property-based test: resolvedMode is always one of "full", "compact", "minimal")
8. FOR ALL arbitrary ParsedTask inputs, THE Auto_Mode_Resolver SHALL return a score consistent with the resolvedMode thresholds, except when Safety_Keywords or refactor keywords override the score (property-based test)
9. FOR ALL arbitrary ParsedTask inputs containing a Safety_Keyword, THE Auto_Mode_Resolver SHALL resolve to "full" (property-based test)
