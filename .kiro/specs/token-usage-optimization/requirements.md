# Requirements Document

## Introduction

kiro-studio-kit が生成するプロンプトのトークン消費量を削減する最適化機能。小さくても効果的な改善を実装し、AIへの入力コストを低減する。主な改善ポイントは以下の3つ：

1. テンプレートファイルの並列読み込みによるI/O効率化
2. プロンプト出力における冗長セクションの検出と条件付き省略
3. トークン削減効果の可視化（削減量レポート）

## Glossary

- **Prompt_Generator**: タスクファイルとテンプレートからAI向けプロンプトを組み立てるモジュール（`src/core/promptGenerator.ts`）
- **Template_Loader**: ロールテンプレートとルールテンプレートをファイルシステムから読み込むモジュール（`src/core/templateLoader.ts`）
- **Token_Estimator**: 文字列からトークン数を推定するユーティリティ（`src/core/tokenLedger.ts` 内の `estimateTokensFromChars`）
- **Compact_Mode**: 冗長なセクションを省略してプロンプトサイズを削減する出力モード
- **Token_Ledger**: 各実行のトークン消費量を記録するJSONLファイル（`.studio/token-ledger.jsonl`）
- **Section_Trimmer**: プロンプト内の空行・重複・未使用セクションを検出し除去する処理
- **Quality_Gate_Reporter**: 品質ゲートの実行結果をトークン効率の高いフォーマットで報告するモジュール
- **Quality_Gate_Template**: 品質ゲートの実行指示を定義するテンプレートファイル（`templates/rules/quality-gates.md`）

## Requirements

### Requirement 1: テンプレート並列読み込み

**User Story:** As a 開発者, I want テンプレートファイルの読み込みが並列化されること, so that プロンプト生成のI/O待ち時間が短縮される

#### Acceptance Criteria

1. WHEN ロールテンプレートを読み込む場合, THE Template_Loader SHALL 4つのロールファイルを `Promise.all` で並列に読み込む
2. WHEN ルールテンプレートを読み込む場合, THE Template_Loader SHALL 4つのルールファイルを `Promise.all` で並列に読み込む
3. WHEN テンプレート読み込みが完了した場合, THE Template_Loader SHALL 逐次読み込みと同一の結果を返す

### Requirement 2: コンパクトモードによるプロンプトサイズ削減

**User Story:** As a 開発者, I want プロンプト生成時にコンパクトモードを選択できること, so that 不要なセクションを省略してトークン消費量を削減できる

#### Acceptance Criteria

1. WHEN `generatePrompt` に `compact: true` オプションが渡された場合, THE Prompt_Generator SHALL コンパクトモードでプロンプトを生成する
2. WHILE コンパクトモードが有効な場合, THE Prompt_Generator SHALL ロールテンプレート内の見出し行（`#` で始まる行）を除去する
3. WHILE コンパクトモードが有効な場合, THE Prompt_Generator SHALL 連続する3行以上の空行を1行の空行に圧縮する
4. WHILE コンパクトモードが有効な場合, THE Prompt_Generator SHALL Markdownの箇条書き記号の後の余分な空白を1つに正規化する
5. WHEN `compact` オプションが省略された場合, THE Prompt_Generator SHALL 従来通りの完全なプロンプトを生成する（後方互換性）

### Requirement 3: トークン削減効果の可視化

**User Story:** As a 開発者, I want プロンプト生成時にトークン削減量が表示されること, so that 最適化の効果を定量的に確認できる

#### Acceptance Criteria

1. WHEN コンパクトモードでプロンプトが生成された場合, THE Token_Estimator SHALL 通常モードとコンパクトモードのトークン数の差分を計算する
2. WHEN トークン削減量が計算された場合, THE Prompt_Generator SHALL 削減前トークン数、削減後トークン数、削減率（パーセント）を `GenerateResult` に含める
3. WHEN Token_Ledger にレコードを記録する場合, THE Token_Ledger SHALL コンパクトモードの使用有無と削減トークン数を記録する

### Requirement 4: セクショントリミング

**User Story:** As a 開発者, I want プロンプト内の冗長な空白や重複パターンが自動的に除去されること, so that 無駄なトークン消費を防げる

#### Acceptance Criteria

1. THE Section_Trimmer SHALL 入力文字列から末尾の空白行を除去する
2. THE Section_Trimmer SHALL 3行以上連続する空行を1行の空行に圧縮する
3. THE Section_Trimmer SHALL 各行の末尾空白（trailing whitespace）を除去する
4. WHEN Section_Trimmer が適用された場合, THE Section_Trimmer SHALL 元のテキストの意味的内容を変更しない
5. FOR ALL 有効なプロンプト文字列に対して, トリミング処理を2回適用した結果は1回適用した結果と同一である（冪等性）

### Requirement 5: CLI からのコンパクトモード指定

**User Story:** As a 開発者, I want CLI から `--compact` フラグでコンパクトモードを指定できること, so that コマンドラインからトークン削減を制御できる

#### Acceptance Criteria

1. WHEN `kiro-studio-kit prompt <task-file> --compact` が実行された場合, THE CLI SHALL コンパクトモードでプロンプトを生成する
2. WHEN コンパクトモードで生成が完了した場合, THE CLI SHALL トークン削減量（削減前、削減後、削減率）を標準出力に表示する
3. WHEN `--compact` フラグが省略された場合, THE CLI SHALL 従来通りの通常モードで動作する

### Requirement 6: 品質ゲートの刷新

**User Story:** As a 開発者, I want 品質ゲートテンプレートがトークン効率を考慮した構成に刷新されること, so that 品質ゲートの実行指示と結果報告に消費されるトークン量を削減できる

#### Acceptance Criteria

1. WHILE コンパクトモードが有効な場合, THE Prompt_Generator SHALL 品質ゲートセクションをコマンド一覧と最小限のルール（箇条書き3項目以内）のみに圧縮する
2. WHEN 品質ゲートの結果を報告する場合, THE Quality_Gate_Reporter SHALL 成功したゲートを1行サマリー（ゲート名 + "PASS"）で報告する
3. WHEN 品質ゲートが失敗した場合, THE Quality_Gate_Reporter SHALL 失敗したゲートのみ詳細（エラー内容・修正内容・再実行結果）を報告する
4. WHEN 変更対象ファイルの拡張子が `.md` のみの場合, THE Quality_Gate_Reporter SHALL `typecheck`・`lint`・`build` ゲートの実行をスキップし、スキップ理由を1行で報告する
5. WHEN Quality_Gate_Template が読み込まれた場合, THE Template_Loader SHALL テンプレート内の説明文を除去しコマンドとルールのみを保持した簡潔版を返すオプションを提供する
6. THE Quality_Gate_Reporter SHALL 品質ゲート結果の報告を構造化フォーマット（ゲート名・結果・所要時間の表形式）で出力する
