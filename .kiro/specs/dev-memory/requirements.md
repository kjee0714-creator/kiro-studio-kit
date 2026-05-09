# Requirements Document

## Introduction

kiro-studio-kit に「Development Memory（開発メモリ）」機能を追加する。過去の実装・テスト・品質ゲート修正から得た短い構造化された「再発防止メモ」を JSONL ファイルに保存し、将来のプロンプト生成時に関連するメモを自動注入する機能である。

これはフルワークログではなく、AI 駆動開発における失敗・修正・注意点を短い構造化フォーマットで保存し再利用するための MVP 機能である。ベクトル検索や外部 DB は使用せず、ルールベースのスコアリングで関連メモを選択する。

## Glossary

- **DevMemoryEntry**: 再発防止メモ1件を表すデータ構造。kind・summary・trigger・fix・futurePromptHint 等のフィールドを持つ
- **DevMemoryKind**: メモの種類を表す型。`"test_fix"` / `"type_fix"` / `"lint_fix"` / `"build_fix"` / `"schema_fix"` / `"behavior_change"` / `"design_decision"` / `"gotcha"` の8値
- **DevMemoryStore**: `.kiro/ksk/dev-memory.jsonl` に保存される JSONL ファイル
- **MemoryMode**: プロンプト生成時のメモリ注入モード。`"auto"` / `"off"` / `"full"` の3値
- **MemorySelector**: タスク内容とメモリエントリからスコアリングにより注入対象を選択するモジュール
- **CLI**: `kiro-studio-kit` コマンドラインインターフェース
- **PromptGenerator**: `src/core/promptGenerator.ts` に実装されたプロンプト生成モジュール
- **ExperimentLogger**: `.studio/experiments.jsonl` に記録される実験ログ
- **SecretsGuard**: メモ内容に秘密情報パターンが含まれていないか検査するバリデーション

---

## Requirements

### Requirement 1: DevMemoryEntry データモデルと手書きバリデーション

**User Story:** As a developer, I want a well-typed and validated data model for memory entries, so that invalid or malformed data is rejected at the boundary.

#### Acceptance Criteria

1. THE DevMemoryStore SHALL `DevMemoryKind` 型として `"test_fix"` / `"type_fix"` / `"lint_fix"` / `"build_fix"` / `"schema_fix"` / `"behavior_change"` / `"design_decision"` / `"gotcha"` の8値を定義する
2. THE DevMemoryStore SHALL `DevMemoryEntry` 型として id・createdAt・kind・summary・trigger・fix・futurePromptHint・relatedFiles・relatedSymbols・tags・severity・confidence・enabled フィールドを必須とし、project・phase・taskName・supersedes・expiresAt フィールドをオプションとして定義する
3. THE DevMemoryStore SHALL severity フィールドを `"low"` / `"medium"` / `"high"` の3値に制限する
4. THE DevMemoryStore SHALL confidence フィールドを `"low"` / `"medium"` / `"high"` の3値に制限する
5. THE DevMemoryStore SHALL `validateDevMemoryEntry` により id・createdAt・summary・trigger・fix・futurePromptHint が空文字列でないことを検証する
6. THE DevMemoryStore SHALL `validateDevMemoryEntry` により relatedFiles・relatedSymbols・tags が文字列配列であることを検証する
7. THE DevMemoryStore SHALL `validateDevMemoryEntry` により enabled が boolean であることを検証する
8. WHEN 無効な kind 値が渡された場合、THEN THE DevMemoryStore SHALL バリデーションエラーを返す

---

### Requirement 2: JSONL ストレージの読み書き

**User Story:** As a developer, I want memory entries stored in a JSONL file that is auto-created and resilient to corruption, so that the feature works without manual setup and doesn't crash on bad data.

#### Acceptance Criteria

1. THE DevMemoryStore SHALL `.kiro/ksk/dev-memory.jsonl` ファイルにメモリエントリを保存する
2. WHEN ファイルが存在しない場合、THE DevMemoryStore SHALL 親ディレクトリを含めて自動作成する
3. WHEN メモリエントリを追加する場合、THE DevMemoryStore SHALL 既存ファイルの末尾に1行の JSON として追記する
4. WHEN JSONL ファイルを読み込む場合、THE DevMemoryStore SHALL 全行をパースして DevMemoryEntry 配列として返す
5. WHEN JSONL ファイルに不正な JSON 行が含まれる場合、THEN THE DevMemoryStore SHALL その行をスキップし警告を出力してクラッシュしない
6. WHEN JSONL ファイルが存在しない場合、THE DevMemoryStore SHALL 空配列を返す
7. WHEN メモリエントリを追加する場合、THE DevMemoryStore SHALL `validateDevMemoryEntry` によるバリデーションを通過したエントリのみを書き込む

---

### Requirement 3: `ksk memory add` コマンド

**User Story:** As a developer, I want to add memory entries via CLI, so that I can record lessons learned from past fixes quickly.

#### Acceptance Criteria

1. WHEN `ksk memory add` が `--kind`・`--summary`・`--trigger`・`--fix`・`--hint` オプション付きで実行された場合、THE CLI SHALL 新しい DevMemoryEntry を生成して DevMemoryStore に追記する
2. THE CLI SHALL `--hint` オプションの値を `futurePromptHint` フィールドにマッピングする
3. WHEN `--files` オプションが指定された場合、THE CLI SHALL カンマ区切りの値を `relatedFiles` 配列として保存する
4. WHEN `--symbols` オプションが指定された場合、THE CLI SHALL カンマ区切りの値を `relatedSymbols` 配列として保存する
5. WHEN `--tags` オプションが指定された場合、THE CLI SHALL カンマ区切りの値を `tags` 配列として保存する
6. WHEN `--severity` オプションが省略された場合、THE CLI SHALL デフォルト値 `"medium"` を使用する
7. WHEN `--confidence` オプションが省略された場合、THE CLI SHALL デフォルト値 `"high"` を使用する
8. THE CLI SHALL `enabled` フィールドのデフォルト値を `true` とする
9. THE CLI SHALL `relatedFiles`・`relatedSymbols`・`tags` のデフォルト値を空配列とする
10. THE CLI SHALL `id` フィールドに UUID を自動生成する
11. THE CLI SHALL `createdAt` フィールドに現在時刻の ISO 8601 文字列を自動設定する
12. WHEN 必須オプション（`--kind`・`--summary`・`--trigger`・`--fix`・`--hint`）が不足している場合、THEN THE CLI SHALL エラーメッセージを表示し終了コード 1 で終了する

---

### Requirement 4: `ksk memory list` コマンド

**User Story:** As a developer, I want to list stored memory entries, so that I can review what lessons have been recorded.

#### Acceptance Criteria

1. WHEN `ksk memory list` が実行された場合、THE CLI SHALL 有効な（`enabled === true`）メモリエントリを新しい順に一覧表示する
2. WHEN メモリエントリが0件の場合、THE CLI SHALL メモリが空である旨のメッセージを表示する
3. THE CLI SHALL 各エントリの id・kind・summary・createdAt を表示する

---

### Requirement 5: `ksk memory search` コマンド

**User Story:** As a developer, I want to search memory entries by keyword, so that I can find relevant past lessons quickly.

#### Acceptance Criteria

1. WHEN `ksk memory search "query"` が実行された場合、THE CLI SHALL summary・trigger・fix・futurePromptHint・tags・relatedSymbols・relatedFiles フィールドを対象にクエリ文字列で部分一致検索する
2. WHEN 検索結果が0件の場合、THE CLI SHALL 該当なしのメッセージを表示する
3. THE CLI SHALL 検索結果を新しい順に表示する
4. THE CLI SHALL 検索を大文字小文字を区別せずに実行する

---

### Requirement 6: メモリ選択ロジック（ルールベーススコアリング）

**User Story:** As a developer, I want only relevant memory entries injected into my prompts, so that the prompt stays focused and doesn't waste tokens on irrelevant information.

#### Acceptance Criteria

1. THE MemorySelector SHALL `enabled === false` のエントリを除外する
2. THE MemorySelector SHALL `confidence === "low"` のエントリを除外する
3. WHEN `expiresAt` が現在時刻より過去の場合、THE MemorySelector SHALL そのエントリを除外する
4. WHEN エントリが他のエントリの `supersedes` 配列に含まれる場合、THE MemorySelector SHALL そのエントリを除外する
5. THE MemorySelector SHALL `relatedFiles` の値がタスクテキストに含まれる場合、スコアに +5 を加算する
6. THE MemorySelector SHALL `relatedSymbols` の値がタスクテキストに含まれる場合、スコアに +4 を加算する
7. THE MemorySelector SHALL `tags` の値がタスクテキストに含まれる場合、スコアに +3 を加算する
8. THE MemorySelector SHALL `kind` がタスク内容に関連する場合、スコアに +2 を加算する
9. THE MemorySelector SHALL `severity === "high"` の場合、スコアに +2 を加算する
10. THE MemorySelector SHALL `severity === "medium"` の場合、スコアに +1 を加算する
11. THE MemorySelector SHALL `createdAt` が過去30日以内の場合、スコアに +1 を加算する
12. WHEN `auto` モードの場合、THE MemorySelector SHALL スコア 0 のエントリを除外し、上位5件かつ合計2000文字以内のエントリを選択する
13. WHEN `full` モードの場合、THE MemorySelector SHALL 有効かつ confidence が low でないエントリを合計10000文字以内で選択する
14. WHEN `off` モードの場合、THE MemorySelector SHALL エントリを一切注入しない

---

### Requirement 7: プロンプトへのメモリ注入

**User Story:** As a developer, I want relevant memory entries automatically injected into generated prompts, so that past lessons are applied without manual effort.

#### Acceptance Criteria

1. WHEN `--memory auto` または `--memory` 未指定の場合、THE PromptGenerator SHALL デフォルトモード `auto` でメモリ選択を実行する
2. WHEN `--memory off` が指定された場合、THE PromptGenerator SHALL メモリセクションを出力しない
3. WHEN `--memory full` が指定された場合、THE PromptGenerator SHALL `full` モードでメモリ選択を実行する
4. WHEN 選択されたエントリが1件以上の場合、THE PromptGenerator SHALL `## Development Memory / 再発防止メモ` セクションをプロンプトに追加する
5. WHEN 選択されたエントリが0件の場合、THE PromptGenerator SHALL メモリセクションを出力しない
6. THE PromptGenerator SHALL 各エントリを番号付きで summary・kind・related・trigger・fix・futurePromptHint を含むフォーマットで出力する
7. THE PromptGenerator SHALL メモリセクションの冒頭に「過去の修正から得た注意点であり、今回の明示仕様と矛盾する場合は明示仕様を優先する」旨の説明文を含める
8. THE PromptGenerator SHALL 既存の promptMode・compactMode・ログ・出力仕様を破壊しない

---

### Requirement 8: 生成ログへのメモリ情報記録

**User Story:** As a developer analyzing experiment logs, I want memory injection metadata recorded in the generation log, so that I can track which memories were used.

#### Acceptance Criteria

1. WHEN プロンプトが生成された場合、THE ExperimentLogger SHALL `developmentMemory` オブジェクトをログレコードに含める
2. THE ExperimentLogger SHALL `developmentMemory.mode` に使用されたメモリモード（`"auto"` / `"off"` / `"full"`）を記録する
3. THE ExperimentLogger SHALL `developmentMemory.selectedCount` に選択されたエントリ数を記録する
4. THE ExperimentLogger SHALL `developmentMemory.selectedIds` に選択されたエントリの id 配列を記録する
5. THE ExperimentLogger SHALL `developmentMemory.totalAvailable` に利用可能な全エントリ数を記録する

---

### Requirement 9: 秘密情報ガード

**User Story:** As a developer, I want to be warned if I accidentally store secrets in memory entries, so that sensitive information is not leaked into prompts.

#### Acceptance Criteria

1. WHEN メモリエントリの summary・trigger・fix・futurePromptHint フィールドに `sk-`・`BEGIN PRIVATE KEY`・`password=`・`api_key`・`secret` パターンが含まれる場合、THE SecretsGuard SHALL 警告メッセージを出力する
2. THE SecretsGuard SHALL 秘密情報パターンを検出しても書き込みをブロックしない（警告のみ）
3. THE CLI SHALL README に秘密情報を保存すべきでない旨のセキュリティノートを記載する

---

### Requirement 10: `--memory` オプションの CLI 統合

**User Story:** As a developer, I want to control memory injection mode via CLI option, so that I can choose when and how memories are applied.

#### Acceptance Criteria

1. WHEN `kiro-studio-kit prompt` コマンドが実行される場合、THE CLI SHALL `--memory <auto|off|full>` オプションを受け付ける
2. WHEN `--memory` オプションが省略された場合、THE CLI SHALL デフォルト値 `auto` を使用する
3. WHEN `--memory` に `auto`・`off`・`full` 以外の値が指定された場合、THEN THE CLI SHALL エラーメッセージを表示し終了コード 1 で終了する
4. THE CLI SHALL `--memory` オプションを既存の `--mode`・`--out`・`--compact` オプションと共存可能にする

---

### Requirement 11: README の更新

**User Story:** As a new user reading the documentation, I want the README to describe the Development Memory feature, so that I understand how to use it.

#### Acceptance Criteria

1. THE CLI SHALL README に Development Memory セクションを追加し、機能概要・3つのモード（auto/off/full）・CLI コマンド（memory add/list/search）を説明する
2. THE CLI SHALL README に `prompt` コマンドのシグネチャを `--memory` オプションを含む形に更新する
3. THE CLI SHALL README に秘密情報を保存すべきでない旨のセキュリティノートを含める

---

### Requirement 12: テストの追加

**User Story:** As a developer maintaining this codebase, I want comprehensive tests for the Development Memory feature, so that regressions are caught automatically.

#### Acceptance Criteria

1. WHEN 有効な DevMemoryEntry が渡された場合、THE DevMemoryStore SHALL `validateDevMemoryEntry` バリデーションを通過する（テストで検証）
2. WHEN 無効な kind 値が渡された場合、THEN THE DevMemoryStore SHALL バリデーションエラーを返す（テストで検証）
3. WHEN summary が空文字列の場合、THEN THE DevMemoryStore SHALL バリデーションエラーを返す（テストで検証）
4. WHEN enabled フィールドが欠落している場合、THEN THE DevMemoryStore SHALL バリデーションエラーを返す（テストで検証）
5. WHEN JSONL ファイルにエントリを追記した場合、THE DevMemoryStore SHALL 読み込み時にそのエントリを含む配列を返す（テストで検証）
6. WHEN JSONL ファイルに不正行が含まれる場合、THE DevMemoryStore SHALL 正常行のみを返す（テストで検証）
7. WHEN ファイルが存在しない場合、THE DevMemoryStore SHALL 空配列を返す（テストで検証）
8. WHEN タスクテキストにエントリの tags が含まれる場合、THE MemorySelector SHALL そのエントリを選択する（テストで検証）
9. WHEN タスクテキストにエントリの relatedSymbols が含まれる場合、THE MemorySelector SHALL そのエントリを選択する（テストで検証）
10. WHEN タスクテキストにエントリの relatedFiles が含まれる場合、THE MemorySelector SHALL そのエントリを選択する（テストで検証）
11. WHEN `confidence === "low"` のエントリがある場合、THE MemorySelector SHALL そのエントリを除外する（テストで検証）
12. WHEN `enabled === false` のエントリがある場合、THE MemorySelector SHALL そのエントリを除外する（テストで検証）
13. WHEN `expiresAt` が過去のエントリがある場合、THE MemorySelector SHALL そのエントリを除外する（テストで検証）
14. WHEN `auto` モードで6件以上のエントリがスコア > 0 の場合、THE MemorySelector SHALL 上位5件のみを選択する（テストで検証）
15. WHEN スコアが 0 のエントリがある場合、THE MemorySelector SHALL `auto` モードでそのエントリを除外する（テストで検証）
16. WHEN `--memory off` が指定された場合、THE PromptGenerator SHALL メモリセクションを含まないプロンプトを生成する（テストで検証）
17. WHEN `--memory auto` でマッチするエントリがある場合、THE PromptGenerator SHALL メモリセクションを含むプロンプトを生成する（テストで検証）
18. WHEN プロンプトが生成された場合、THE ExperimentLogger SHALL `developmentMemory.selectedIds` をログに記録する（テストで検証）
19. FOR ALL 有効な DevMemoryEntry オブジェクト、JSONL に書き込んだ後に読み込むと元のオブジェクトと等価なオブジェクトが得られる（ラウンドトリッププロパティテストで検証）
