# Requirements Document

## Introduction

kiro-studio-kit の `prompt` コマンドにプロンプト生成モードを追加する。現在は `--compact` フラグのみで通常モードとコンパクトモードを切り替えているが、これを拡張して `full`・`compact`・`minimal` の3モードを `--mode` オプションで指定できるようにする。`minimal` モードは小さい修正・継続作業向けの軽量プロンプトを生成する新規モードである。既存の `--compact` フラグは後方互換性のために維持する。

## Glossary

- **CLI**: `kiro-studio-kit` コマンドラインインターフェース
- **PromptMode**: プロンプト生成モードを表す型。`"full"` / `"compact"` / `"minimal"` の3値を取る
- **GenerateOptions**: `generatePrompt` 関数に渡すオプション型
- **PromptGenerator**: `src/core/promptGenerator.ts` に実装されたプロンプト生成モジュール
- **TokenLedger**: `.studio/token-ledger.jsonl` に記録されるトークン台帳
- **ExperimentLogger**: `.studio/experiments.jsonl` に記録される実験ログ
- **MinimalTemplate**: `minimal` モード専用の軽量プロンプトテンプレート
- **TokenReduction**: コンパクト変換前後のトークン数差分情報

---

## Requirements

### Requirement 1: `--mode` オプションの追加

**User Story:** As a developer, I want to specify the prompt generation mode via `--mode` CLI option, so that I can choose the appropriate prompt verbosity for my task.

#### Acceptance Criteria

1. WHEN `--mode full` が指定された場合、THE CLI SHALL 通常モード（現在の `--compact` なし相当）のプロンプトを生成する
2. WHEN `--mode compact` が指定された場合、THE CLI SHALL コンパクトモード（現在の `--compact` 相当）のプロンプトを生成する
3. WHEN `--mode minimal` が指定された場合、THE CLI SHALL minimal モードのプロンプトを生成する
4. WHEN `--mode` に `full`・`compact`・`minimal` 以外の値が指定された場合、THEN THE CLI SHALL エラーメッセージを標準エラー出力に表示し、終了コード 1 で終了する
5. WHEN `--mode` が指定されない場合、THE CLI SHALL `full` モードと同等の挙動をとる

---

### Requirement 2: `--compact` フラグの後方互換性維持

**User Story:** As an existing user of `--compact`, I want the flag to continue working as before, so that my existing scripts and workflows are not broken.

#### Acceptance Criteria

1. WHEN `--compact` フラグが指定された場合、THE CLI SHALL `--mode compact` と同等のプロンプトを生成する
2. WHEN `--compact` と `--mode` が同時に指定された場合、THE CLI SHALL `--mode` の値を優先して使用する
3. WHEN `--compact` と `--mode` が同時に指定された場合、THE CLI SHALL 警告メッセージを標準エラー出力に表示する

---

### Requirement 3: `PromptMode` 型と `resolvePromptMode` 関数の導入

**User Story:** As a developer maintaining this codebase, I want a well-typed `PromptMode` and a single resolution function, so that mode logic is centralized and not scattered across the codebase.

#### Acceptance Criteria

1. THE PromptGenerator SHALL `PromptMode` 型として `"full" | "compact" | "minimal"` を公開する
2. THE PromptGenerator SHALL `GenerateOptions` に `mode?: PromptMode` フィールドを追加する（`compact?: boolean` は後方互換のため残す）
3. THE PromptGenerator SHALL `resolvePromptMode(options: GenerateOptions): PromptMode` 関数を実装し、`options.mode` が存在する場合はその値を返し、`options.compact` が `true` の場合は `"compact"` を返し、それ以外は `"full"` を返す
4. WHEN `resolvePromptMode` が呼ばれた場合、THE PromptGenerator SHALL 内部処理で `compact?: boolean` を直接参照せず、`resolvePromptMode` の戻り値のみを使用する

---

### Requirement 4: `minimal` モードのプロンプト生成

**User Story:** As a developer working on small fixes or continuation tasks, I want a minimal prompt that includes only essential rules, so that I can reduce token consumption while retaining critical guidance.

#### Acceptance Criteria

1. WHEN `minimal` モードが選択された場合、THE PromptGenerator SHALL Goal・Scope・Non-goals セクションを展開したプロンプトを生成する
2. WHEN `minimal` モードが選択された場合、THE PromptGenerator SHALL 既存パターンに従う指示・最小差分実装指示・スコープ外変更禁止・同一エラー2回停止ルールを含むプロンプトを生成する
3. WHEN `minimal` モードが選択された場合、THE PromptGenerator SHALL `npm run typecheck`・`npm run lint`・`npm run test`・`npm run build` の品質ゲート文言を含むプロンプトを生成する
4. WHEN `minimal` モードが選択された場合、THE PromptGenerator SHALL 品質ゲートをスキップした場合の理由報告指示を含むプロンプトを生成する
5. WHEN `minimal` モードが選択された場合、THE PromptGenerator SHALL 変更ファイル・変更サマリー・品質ゲート結果・残課題を含む最終報告フォーマットを含むプロンプトを生成する
6. WHEN `minimal` モードが選択された場合、THE PromptGenerator SHALL Director・Architect・Implementer・QA の詳細な役割分担セクションを含まないプロンプトを生成する
7. WHEN `minimal` モードが選択された場合、THE PromptGenerator SHALL `full` モードより少ないトークン数のプロンプトを生成する

---

### Requirement 5: ログへの `promptMode` 記録

**User Story:** As a developer analyzing experiment logs, I want the prompt mode to be recorded in both the token ledger and experiment log, so that I can track which mode was used for each run.

#### Acceptance Criteria

1. WHEN プロンプトが生成された場合、THE TokenLedger SHALL `promptMode` フィールドに使用されたモード（`"full"` / `"compact"` / `"minimal"`）を記録する
2. WHEN `minimal` モードが使用された場合、THE TokenLedger SHALL 推定トークン数（`estimatedTokens.total`）を記録する
3. WHEN `compact` または `minimal` モードが使用された場合、THE TokenLedger SHALL `compactMode.enabled: true` を記録する（既存フィールドとの互換性維持）

---

### Requirement 6: README の更新

**User Story:** As a new user reading the documentation, I want the README to accurately describe all available modes and options, so that I can understand how to use the CLI correctly.

#### Acceptance Criteria

1. THE CLI SHALL README の `prompt` コマンドのシグネチャを `kiro-studio-kit prompt <task-file> [--out <output-dir>] [--mode <full|compact|minimal>] [--compact]` に更新する
2. THE CLI SHALL README に `full`・`compact`・`minimal` の3モードを説明するモード表を追加する
3. THE CLI SHALL README に `--compact` が後方互換のために残されていることを明記する

---

### Requirement 7: テストの追加・更新

**User Story:** As a developer maintaining this codebase, I want comprehensive tests for all mode behaviors, so that regressions are caught automatically.

#### Acceptance Criteria

1. WHEN `--mode full` が指定された場合、THE PromptGenerator SHALL 既存の通常プロンプトと同等の出力を生成する（テストで検証）
2. WHEN `--mode compact` が指定された場合、THE PromptGenerator SHALL コンパクト変換が適用された出力を生成する（テストで検証）
3. WHEN `--mode minimal` が指定された場合、THE PromptGenerator SHALL minimal プロンプトを生成する（テストで検証）
4. WHEN `--compact` フラグが指定された場合、THE CLI SHALL `--mode compact` と同等の出力を生成する（テストで検証）
5. WHEN 不正な `--mode` 値が指定された場合、THE CLI SHALL エラーで終了する（テストで検証）
6. WHEN `--mode minimal` が指定された場合、THE PromptGenerator SHALL Goal・Scope・Non-goals が展開されたプロンプトを生成する（テストで検証）
7. WHEN `--mode minimal` が指定された場合、THE PromptGenerator SHALL 品質ゲート文言を含むプロンプトを生成する（テストで検証）
8. WHEN プロンプトが生成された場合、THE TokenLedger SHALL `promptMode` フィールドを含むレコードを記録する（テストで検証）
