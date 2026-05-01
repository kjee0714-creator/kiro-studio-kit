# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-05-01

### Docs

- 冒頭メッセージを強化（"Control how AI develops, not just what it generates."）
- 型情報を修正（`PromptMode` → `RequestedPromptMode`、`AutoModeDecision`・`AutoModeSummary` を追加）
- auto mode の説明を改善（スコアリング対象が Goal + Scope のみであることを明記）
- summary コマンドの出力例に auto analytics を追加
- CLI 使用例を `npx kiro-studio-kit@latest` に統一、auto mode 例を Quick Start に追加
- モード表の auto 説明を「説明可能なルールベースで最適なモードを選択」に改善
- 公開 API imports に `selectPromptModeFromTask`・`generateFullExperimentSummary`・`generateAutoModeSummary` を追加
- プロジェクト構造に `autoModeResolver.ts` を追加
- テスト数を 282 に更新、プロパティテスト一覧に auto mode 関連を追加

## [0.3.0] - 2026-05-01

### Added

- `--mode auto` オプションを追加（ルールベースのキーワードスコアリングによる半自動モード選択）
- `src/core/autoModeResolver.ts` を追加（キーワードスコアリングエンジン）
- `RequestedPromptMode` 型を追加（`PromptMode | "auto"`）
- `AutoModeDecision` インターフェースを追加（`score` / `reasons` / `resolvedMode`）
- `generateAutoModeSummary()` 関数を追加（auto モード使用状況の分析）
- `generateFullExperimentSummary()` 関数を追加（`summary` + `autoSummary` を返す）
- `summary` コマンドに auto usage / avg score / top reasons の表示を追加

### Changed

- `generateExperimentSummary()` の公開 API 互換性を維持しつつ、内部実装を拡張
- CLI `summary` コマンドが auto analytics を表示するように変更
- 実験ログに `requestedPromptMode` / `autoModeDecision` フィールドを追加
- トークン台帳に `requestedPromptMode` フィールドを追加
- auto mode のスコアリング対象から `nonGoals` を除外（否定文の誤判定防止）

### Fixed

- CLI の import 時に `main()` が実行される副作用を修正（Unhandled Rejection 解消）
- auto mode において Non-goals セクションのキーワードが誤って判定に影響する問題を修正

### Tests

- テスト数: 203 → 282
- auto mode の unit / property / integration テストを追加
- nonGoals 除外のプロパティテスト（Property 6）を追加
- CLI 副作用防止のプロパティテストを追加
- summary auto analytics のテストを追加

### Docs

- README に `--mode auto` の使い方を追加
- プロンプト生成モードテーブルに `auto` 行を追加
- スコアリングルール・閾値・CLI 出力例を追加
