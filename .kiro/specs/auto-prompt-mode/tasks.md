# Implementation Plan: auto-prompt-mode（半自動プロンプトモード選択）

## Overview

task.md の内容をルールベースのキーワードスコアリングで分析し、最適なプロンプト生成モード（full / compact / minimal）を決定論的に選択する `--mode auto` オプションを実装する。既存の型・モジュールを非破壊で拡張し、新規モジュール `autoModeResolver.ts` にスコアリングロジックを分離する。

## Tasks

- [x] 1. 型定義とインターフェースの追加
  - [x] 1.1 `src/core/promptGenerator.ts` に `RequestedPromptMode` 型を追加する
    - `export type RequestedPromptMode = PromptMode | "auto";` を追加
    - `GenerateOptions.mode` の型を `PromptMode` から `RequestedPromptMode` に変更
    - `GenerateResult` に `autoModeDecision?: AutoModeDecision` フィールドを追加（`AutoModeDecision` は autoModeResolver.ts からインポート）
    - `resolvePromptMode` を更新し、`mode === "auto"` の場合は `"full"` にフォールバックするようにする
    - 既存の `PromptMode` 型は変更しない
    - _Requirements: 1.1, 1.2, 1.3, 6.5, 7.6_

  - [x] 1.2 `src/core/autoModeResolver.ts` を新規作成し、`AutoModeDecision` インターフェースを定義する
    - `AutoModeDecision` インターフェース: `requestedMode: "auto"`, `resolvedMode: PromptMode`, `score: number`, `reasons: string[]`
    - `ParsedTask` を `promptGenerator.ts` からインポート
    - `selectPromptModeFromTask` 関数のスタブ（空実装）を作成
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 2. コアロジック: autoModeResolver のスコアリング実装
  - [x] 2.1 `src/core/autoModeResolver.ts` にキーワード定義とスコアリングロジックを実装する
    - Full_Keyword 一覧（設計, architecture, リファクタ, refactor, 新機能, feature, API, DB, schema, 認証, auth, migration, 破壊的変更, breaking, 複数ファイル, テスト追加, 品質ゲート, property, fast-check）を定義
    - Minimal_Keyword 一覧（typo, 誤字, 文言修正, README, コメント修正, 小修正, 1ファイル, 継続, 微修正）を定義
    - Safety_Keyword 一覧（schema, auth, migration, breaking, refactor, リファクタ）を定義
    - 英語キーワードは `\b` 単語境界マッチ（大文字小文字無視）、日本語キーワードは部分文字列マッチ
    - スコアリングアルゴリズム: Full_Keyword → +1, Minimal_Keyword → -1, Safety_Keyword → full 強制
    - 閾値: score >= 4 → full, 1 <= score < 4 → compact, score <= 0 → minimal
    - キーワードヒットなし時: reasons に "no keyword matched → default compact" を追加し compact を返す
    - reasons 配列は絶対に空にならない
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12_

  - [x] 2.2 `src/__tests__/autoModeResolver.test.ts` を新規作成し、ユニットテストを実装する
    - Safety_Keyword を含むタスクで `"full"` を返すテスト
    - Minimal_Keyword のみのタスクで `"minimal"` を返すテスト
    - キーワードなしのタスクで `"compact"` を返すテスト（デフォルト）
    - "refactor" / "リファクタ" を含むタスクで `"full"` を返すテスト
    - 英語キーワードの単語境界マッチング（"capability" が "api" にマッチしないこと）
    - 日本語キーワードの部分文字列マッチング（"設計変更" が "設計" にマッチすること）
    - キーワードなし時に reasons に "no keyword matched → default compact" が含まれること
    - Full_Keyword と Minimal_Keyword の混合時にスコアに基づいて判定されること
    - _Requirements: 9.2, 9.3, 9.4, 9.5_

  - [x] 2.3 `src/__tests__/autoModeResolver.property.test.ts` を新規作成し、プロパティベーステストを実装する
    - **Property 1: resolvedMode は常に有効な PromptMode**
    - **Validates: Requirements 9.7**

  - [x] 2.4 プロパティベーステスト: reasons は絶対に空にならない
    - **Property 2: reasons 配列は絶対に空にならない**
    - **Validates: Requirements 3.12**

  - [x] 2.5 プロパティベーステスト: Safety/リファクタキーワード → full
    - **Property 3: Safety_Keyword またはリファクタキーワードが含まれる場合は常に full**
    - **Validates: Requirements 3.7, 3.8, 9.9**

  - [x] 2.6 プロパティベーステスト: スコア閾値整合性
    - **Property 4: Safety/リファクタキーワードが無い場合、スコアと閾値の整合性**
    - **Validates: Requirements 3.4, 3.5, 3.6, 9.4, 9.8**

  - [x] 2.7 プロパティベーステスト: 大文字小文字無視
    - **Property 5: キーワードマッチングは大文字小文字を区別しない**
    - **Validates: Requirements 2.2, 3.10**

- [x] 3. Checkpoint - コアロジックの検証
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. パイプライン統合: promptGenerator の変更
  - [x] 4.1 `src/core/promptGenerator.ts` の `generatePrompt` 関数に auto モード解決ステップを追加する
    - `mode === "auto"` の場合: task ファイルを読み込み → `parseTaskFile` → `selectPromptModeFromTask` を呼び出し → resolvedMode でプロンプト生成
    - `GenerateResult` に `autoModeDecision` を含めて返す
    - 既存の full / compact / minimal モードの動作は一切変更しない
    - `RequestedPromptMode` 型と `AutoModeDecision` 型を re-export する
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 4.2 `src/__tests__/promptGenerator.test.ts` を更新し、auto モード関連のテストを追加する
    - `resolvePromptMode({ mode: "auto" })` が `"full"` を返すこと
    - 既存モード（full, compact, minimal）の動作が変わらないこと
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 5. ログ記録の拡張
  - [x] 5.1 `src/core/experimentLogger.ts` の `ExperimentRecord` に auto モード関連フィールドを追加する
    - `requestedPromptMode?: RequestedPromptMode` フィールドを追加
    - `autoModeDecision?: { score: number; reasons: string[] }` フィールドを追加
    - `RequestedPromptMode` を `promptGenerator.ts` からインポート
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 5.2 `src/core/tokenLedger.ts` の `TokenLedgerRecord` に `requestedPromptMode` フィールドを追加する
    - `requestedPromptMode?: RequestedPromptMode` フィールドを追加
    - `RequestedPromptMode` を `promptGenerator.ts` からインポート
    - _Requirements: 5.5_

  - [x] 5.3 `src/core/promptGenerator.ts` の `writeGenerationLogs` を更新し、auto モード時にログレコードに判定結果を含める
    - `GenerationLogParams` に `requestedPromptMode` と `autoModeDecision` を追加
    - `ExperimentRecord` に `requestedPromptMode` と `autoModeDecision` を設定
    - `TokenLedgerRecord` に `requestedPromptMode` を設定
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 6. CLI の変更
  - [x] 6.1 `src/cli.ts` を更新し、`--mode auto` をサポートする
    - `VALID_MODES` に `"auto"` を追加
    - `parseMode` の戻り値型を `RequestedPromptMode` に対応させる
    - `--compact` と `--mode auto` の同時指定時に `--mode auto` を優先し警告を表示
    - `GenerateResult.autoModeDecision` が存在する場合に `🤖 auto mode: <resolvedMode> selected 理由: <reasons>` を表示
    - ヘルプテキストに `auto` を追加
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 6.2 `src/__tests__/cli.test.ts` を更新し、auto モード関連のテストを追加する
    - `parseMode(["--mode", "auto"])` が `{ mode: "auto", invalid: null }` を返すこと
    - `--compact` と `--mode auto` の同時指定テスト
    - _Requirements: 9.1, 9.5_

- [x] 7. Checkpoint - パイプライン統合とCLIの検証
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. 公開 API のエクスポート
  - [x] 8.1 `src/index.ts` を更新し、新しい型と関数をエクスポートする
    - `RequestedPromptMode` 型をエクスポート
    - `AutoModeDecision` インターフェースをエクスポート
    - `selectPromptModeFromTask` 関数をエクスポート
    - _Requirements: 1.4, 2.3_

- [x] 9. README の更新
  - [x] 9.1 `README.md` を更新し、`--mode auto` の使い方と動作説明を追加する
    - CLI リファレンスの `--mode` オプション値に `auto` を追加
    - プロンプト生成モードテーブルに `auto` 行を追加
    - スコアリングルールと閾値の説明を追加
    - `--mode auto` の CLI 出力例を追加
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 10. 統合テストの追加
  - [x] 10.1 `src/__tests__/integration.test.ts` を更新し、auto モードのエンドツーエンドテストを追加する
    - `--mode auto` でのプロンプト生成テスト
    - auto モード時の実験ログに `requestedPromptMode` と `autoModeDecision` が記録されること
    - auto モード時のトークン台帳に `requestedPromptMode` が記録されること
    - _Requirements: 9.6_

- [x] 11. Final checkpoint - 品質ゲート
  - `npm run typecheck` / `npm run lint` / `npm run test` / `npm run build` をすべて通過させる
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (Property 1-5 from design document)
- Unit tests validate specific examples and edge cases
- 既存の `PromptMode` 型は変更せず、`RequestedPromptMode = PromptMode | "auto"` を新規追加する設計
- `autoModeResolver.ts` は純粋関数モジュールとして実装し、副作用を持たない
