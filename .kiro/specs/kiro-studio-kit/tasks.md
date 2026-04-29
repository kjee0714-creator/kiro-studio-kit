# Implementation Plan: Kiro Studio Kit (Phase 1)

## 概要

`task.md` から構造化された `kiro-prompt.md` を生成する TypeScript CLI ツールの実装計画。
3層アーキテクチャ（CLI → Core → I/O）に従い、I/O Layer から順にボトムアップで構築する。

## Tasks

- [x] 1. プロジェクト基盤のセットアップ
  - [x] 1.1 `package.json` を作成し、プロジェクトメタデータ・scripts（`typecheck`, `build`, `studio:prompt`, `test`）を定義する
    - `name`: `kiro-studio-kit`, `type`: `module`
    - `scripts`: `typecheck` → `tsc --noEmit`, `build` → `tsc`, `studio:prompt` → `tsx src/cli.ts prompt`, `test` → `vitest --run`
    - devDependencies: `typescript`, `tsx`, `vitest`, `fast-check`
    - _Requirements: 1.1, 1.4, 1.5_
  - [x] 1.2 `tsconfig.json` を作成し、Node.js 向け strict モードの TypeScript 設定を行う
    - `strict: true`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `outDir: "./dist"`
    - _Requirements: 1.2_
  - [x] 1.3 ディレクトリ構成を作成する
    - `src/core/`, `templates/roles/`, `outputs/.gitkeep` を作成
    - _Requirements: 1.3_
  - [x] 1.4 依存パッケージをインストールし、`npm run typecheck` が通ることを確認する
    - _Requirements: 1.2, 1.4_

- [x] 2. fileUtils（I/O Layer）の実装
  - [x] 2.1 `src/core/fileUtils.ts` を作成し、`readTextFile`, `writeTextFile`, `fileExists` を実装する
    - `readTextFile`: UTF-8 でファイルを読み込み、存在しない場合はわかりやすいエラーメッセージをスロー
    - `writeTextFile`: テキストをファイルに書き出し、親ディレクトリが存在しない場合は `recursive: true` で作成
    - `fileExists`: ファイルの存在確認を行い boolean を返す
    - `fs/promises` と `path` のみ使用
    - _Requirements: 1.3, 2.7, 4.5_
  - [x]* 2.2 `src/__tests__/fileUtils.test.ts` を作成し、fileUtils のユニットテストを書く
    - 存在しないファイルの読み込みでエラーがスローされること
    - `writeTextFile` で親ディレクトリが自動作成されること
    - `fileExists` が正しく true/false を返すこと
    - _Requirements: 2.7, 4.5_

- [x] 3. チェックポイント — fileUtils 完了確認
  - `npm run typecheck` と `npm run build` が通ることを確認する。テストがある場合は `npm run test` も実行する。問題があればユーザーに確認する。

- [x] 4. templateLoader（Core Layer）の実装
  - [x] 4.1 `templates/roles/` 配下に4つのロールテンプレートファイルを作成する
    - `director.md`: 目的ズレ検出、スコープ拡大防止、MVP範囲遵守、仕様判断時の停止報告
    - `architect.md`: 責務分離、データ構造、依存関係、拡張ポイント、既存構造との整合性
    - `implementer.md`: 小さい単位で実装、型安全、既存挙動の破壊回避、変更理由の明確化
    - `qa.md`: typecheck, build の実行確認、回帰確認、境界値確認
    - _Requirements: 3.3, 3.4, 3.5, 3.6_
  - [x] 4.2 `src/core/templateLoader.ts` を作成し、`loadRoleTemplates` と `getTemplatesDir` を実装する
    - `loadRoleTemplates`: `templates/roles/` から4つのテンプレートを読み込み `RoleTemplates` を返す
    - テンプレートファイルが存在しない場合は、どのファイルが見つからないかを示すエラーをスロー
    - `fileUtils.readTextFile` を使用してファイルを読み込む
    - _Requirements: 3.1, 3.2_
  - [x]* 4.3 `src/__tests__/templateLoader.test.ts` を作成し、templateLoader のユニットテストを書く
    - 正常に4つのテンプレートが読み込まれること
    - テンプレートファイルが欠落している場合に適切なエラーがスローされること
    - _Requirements: 3.1, 3.2_

- [x] 5. チェックポイント — templateLoader 完了確認
  - `npm run typecheck` と `npm run build` が通ることを確認する。テストがある場合は `npm run test` も実行する。問題があればユーザーに確認する。

- [x] 6. promptGenerator — parseTaskFile の実装
  - [x] 6.1 `src/core/promptGenerator.ts` を作成し、`ParsedTask` インターフェースと `parseTaskFile` 関数を実装する
    - `ParsedTask` インターフェース: `goal`, `scope`, `nonGoals` フィールド
    - `parseTaskFile`: 正規表現で `## Goal`, `## Scope`, `## Non-goals` セクションを抽出
    - `## Scope` が存在しない場合はデフォルトプレースホルダーを設定
    - `## Non-goals` が存在しない場合はデフォルトプレースホルダーを設定
    - `## Goal` が存在しない場合は空文字列を設定
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6_
  - [x]* 6.2 `src/__tests__/promptGenerator.test.ts` を作成し、`parseTaskFile` のユニットテストを書く
    - 空ファイル入力時のデフォルト値確認
    - Goal のみ含むファイルの解析
    - 全セクション含むファイルの解析
    - セクション順序が異なる場合の解析
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6_
  - [x]* 6.3 `parseTaskFile` のプロパティベーステストを書く（Property 1: セクション抽出ラウンドトリップ）
    - **Property 1: セクション抽出ラウンドトリップ**
    - ランダムな Goal, Scope, Non-goals 文字列を `## Goal` / `## Scope` / `## Non-goals` ヘッダー付き Markdown に埋め込み、`parseTaskFile` で解析した結果が元の内容と一致すること
    - fast-check を使用、最小 100 イテレーション
    - タグ: `Feature: kiro-studio-kit, Property 1: セクション抽出ラウンドトリップ`
    - **Validates: Requirements 2.2, 2.3, 2.4**
  - [x]* 6.4 `parseTaskFile` のプロパティベーステストを書く（Property 2: 欠落セクションのデフォルトプレースホルダー）
    - **Property 2: 欠落セクションのデフォルトプレースホルダー**
    - `## Scope` を含まないランダムな Markdown テキストで `parseTaskFile` を実行し、Scope にデフォルトプレースホルダーが設定されること。`## Non-goals` についても同様
    - fast-check を使用、最小 100 イテレーション
    - タグ: `Feature: kiro-studio-kit, Property 2: 欠落セクションのデフォルトプレースホルダー`
    - **Validates: Requirements 2.5, 2.6**

- [x] 7. チェックポイント — parseTaskFile 完了確認
  - `npm run typecheck` と `npm run build` が通ることを確認する。テストがある場合は `npm run test` も実行する。問題があればユーザーに確認する。

- [x] 8. promptGenerator — assemblePrompt と generatePrompt の実装
  - [x] 8.1 `RoleTemplates` インターフェースと `assemblePrompt` 関数を `promptGenerator.ts` に追加する
    - `RoleTemplates` インターフェース: `director`, `architect`, `implementer`, `qa` フィールド
    - `assemblePrompt`: `ParsedTask` と `RoleTemplates` から Goal → Scope → Non-goals → Role Sequence の順でプロンプトを組み立てる
    - Role Sequence 内は Director → Architect → Implementer → QA の順
    - _Requirements: 4.2, 4.3, 4.4_
  - [x] 8.2 `generatePrompt` 関数を `promptGenerator.ts` に追加する
    - task.md の読み込み → `parseTaskFile` → `loadRoleTemplates` → `assemblePrompt` → `outputs/kiro-prompt.md` への書き出し
    - `outputs/` ディレクトリが存在しない場合は自動作成
    - 出力ファイルパスを返す
    - _Requirements: 4.1, 4.5, 2.1_
  - [x]* 8.3 `assemblePrompt` のユニットテストを `promptGenerator.test.ts` に追加する
    - 出力に Goal, Scope, Non-goals, Role Sequence の全セクションが含まれること
    - セクション順序が正しいこと
    - _Requirements: 4.2, 4.3_
  - [x]* 8.4 `assemblePrompt` のプロパティベーステストを書く（Property 3: 出力セクション順序の保証）
    - **Property 3: 出力セクション順序の保証**
    - ランダムな `ParsedTask` と `RoleTemplates` で `assemblePrompt` を実行し、出力内のセクション順序が Goal → Scope → Non-goals → Role Sequence（Director → Architect → Implementer → QA）であること
    - fast-check を使用、最小 100 イテレーション
    - タグ: `Feature: kiro-studio-kit, Property 3: 出力セクション順序の保証`
    - **Validates: Requirements 4.2, 4.3**
  - [x]* 8.5 `assemblePrompt` のプロパティベーステストを書く（Property 4: ラウンドトリップ完全性）
    - **Property 4: ラウンドトリップ完全性**
    - ランダムな `ParsedTask` と `RoleTemplates` で `assemblePrompt` を実行し、出力に Goal, Scope, Non-goals, Role Sequence のすべての必須セクションが含まれること
    - fast-check を使用、最小 100 イテレーション
    - タグ: `Feature: kiro-studio-kit, Property 4: ラウンドトリップ完全性`
    - **Validates: Requirements 4.6**

- [x] 9. チェックポイント — promptGenerator 完了確認
  - `npm run typecheck` と `npm run build` が通ることを確認する。テストがある場合は `npm run test` も実行する。問題があればユーザーに確認する。

- [x] 10. CLI の実装
  - [x] 10.1 `src/cli.ts` を作成し、引数解析・`prompt` サブコマンドのディスパッチ・エラーハンドリングを実装する
    - `process.argv` から引数を解析
    - `prompt` サブコマンド + task.md パスを受け取り `generatePrompt` を呼び出す
    - 引数不足時は使用方法メッセージを表示して `process.exit(1)`
    - 未知のサブコマンドは使用方法メッセージを表示して `process.exit(1)`
    - 成功時は出力ファイルパスを含む成功メッセージを表示
    - トップレベル `try-catch` で予期しないエラーを捕捉し、メッセージ表示 + `process.exit(1)`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 2.7_
  - [x] 10.2 `package.json` の `studio:prompt` スクリプトが引数転送付きで正しく動作することを確認する
    - `npm run studio:prompt -- ./task.md` で実行可能であること
    - _Requirements: 1.5, 5.2_

- [x] 11. 最終チェックポイント — 全体の動作確認
  - `npm run typecheck` と `npm run build` が通ることを確認する。`npm run test` で全テストが通ることを確認する。問題があればユーザーに確認する。

## Notes

- `*` 付きのタスクはオプションであり、MVP を優先する場合はスキップ可能
- 各タスクは対応する要件番号を参照しており、トレーサビリティを確保
- チェックポイントでは `npm run typecheck` と `npm run build` を品質ゲートとして使用
- プロパティベーステストは設計書の正当性プロパティに対応し、fast-check で実装
- ユニットテストは具体的なケースでプロパティテストを補完
