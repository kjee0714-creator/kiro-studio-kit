# 要件定義書

## はじめに

Kiro Studio Kit（Phase 1）は、`task.md` から構造化された `kiro-prompt.md` を生成する最小構成のTypeScript CLIツールである。Claude Code Game Studios で実証された「役割分担」のベストプラクティスを、汎用的なプロンプト生成の骨組みとして提供する。ユーザーは `task.md` を入力として与えるだけで、Goal・Scope・Non-goals・Role Sequence を含む構造化プロンプトを自動生成できる。

Phase 1 では Token Economy Rules、Anti-Runaway Rules、Quality Gates テンプレート、Completion Criteria、Public Log 生成、テスト、LLM API 連携は対象外とする。

## 用語集

- **Studio_Kit**: Kiro Studio Kit の CLI 全体を指すシステム名
- **CLI**: コマンドラインインターフェース。ターミナルから実行するツール
- **Prompt_Generator**: Task_File を読み込み、テンプレートを結合して Kiro_Prompt を生成するコアモジュール（`src/core/promptGenerator.ts`）
- **Template_Loader**: `templates/` ディレクトリから Markdown テンプレートファイルを読み込むモジュール（`src/core/templateLoader.ts`）
- **File_Utils**: ファイル入出力のユーティリティモジュール（`src/core/fileUtils.ts`）
- **Task_File**: ユーザーが作成する作業指示ファイル（task.md）。Goal、Scope、Non-goals セクションを含みうる
- **Kiro_Prompt**: 生成される構造化プロンプトファイル（`outputs/kiro-prompt.md`）
- **Role_Template**: 役割定義テンプレート（`templates/roles/` 配下の director.md, architect.md, implementer.md, qa.md）

## 要件

### 要件 1: プロジェクト基盤の構築

**ユーザーストーリー:** 開発者として、TypeScript 製 CLI の土台が整備されていることで、安定した開発・ビルド環境を利用したい。

#### 受け入れ基準

1. THE Studio_Kit SHALL provide a `package.json` with project metadata and scripts for typecheck and build
2. THE Studio_Kit SHALL provide a `tsconfig.json` configured for Node.js with strict type checking enabled
3. THE Studio_Kit SHALL use `fs/promises` for file I/O and `path` for path handling as standard library dependencies
4. THE Studio_Kit SHALL minimize external dependencies, limiting runtime dependencies to essential packages only
5. THE Studio_Kit SHALL provide a `tsx`-based dev execution script configured as `npm run studio:prompt`

### 要件 2: タスクファイルの読み込み

**ユーザーストーリー:** ユーザーとして、task.md ファイルを入力として指定することで、その内容がプロンプト生成に使用されるようにしたい。

#### 受け入れ基準

1. WHEN a valid Task_File path is provided as a CLI argument, THE CLI SHALL read the file content and pass it to the Prompt_Generator
2. WHEN the Task_File contains a `## Goal` section, THE Prompt_Generator SHALL extract the Goal content and include it in the Kiro_Prompt
3. WHEN the Task_File contains a `## Scope` section, THE Prompt_Generator SHALL extract the Scope content and include it in the Kiro_Prompt
4. WHEN the Task_File contains a `## Non-goals` section, THE Prompt_Generator SHALL extract the Non-goals content and include it in the Kiro_Prompt
5. WHEN the Task_File does not contain a `## Scope` section, THE Prompt_Generator SHALL insert a default Scope placeholder in the Kiro_Prompt
6. WHEN the Task_File does not contain a `## Non-goals` section, THE Prompt_Generator SHALL insert a default Non-goals placeholder in the Kiro_Prompt
7. IF the specified Task_File path does not exist, THEN THE CLI SHALL display a descriptive error message indicating the file was not found and exit with a non-zero exit code

### 要件 3: ロールテンプレート管理

**ユーザーストーリー:** 開発者として、役割定義が Markdown テンプレートとして管理されていることで、内容の確認・編集が容易にできるようにしたい。

#### 受け入れ基準

1. THE Template_Loader SHALL load Role_Template files from the `templates/roles/` directory
2. IF a required Role_Template file is missing, THEN THE Template_Loader SHALL throw a descriptive error indicating which template file was not found
3. THE Role_Template for director.md SHALL contain guidance for: 目的ズレ検出、スコープ拡大防止、MVP範囲遵守、仕様判断時の停止報告
4. THE Role_Template for architect.md SHALL contain guidance for: 責務分離、データ構造、依存関係、拡張ポイント、既存構造との整合性
5. THE Role_Template for implementer.md SHALL contain guidance for: 小さい単位で実装、型安全、既存挙動の破壊回避、変更理由の明確化
6. THE Role_Template for qa.md SHALL contain guidance for: typecheck, build の実行確認、回帰確認、境界値確認

### 要件 4: Kiro プロンプトの生成

**ユーザーストーリー:** ユーザーとして、task.md を指定するだけで、ロールテンプレートが統合された構造化プロンプトが自動生成されることで、手動でのプロンプト組み立て作業を省きたい。

#### 受け入れ基準

1. WHEN the CLI `prompt` command is executed with a valid Task_File path, THE Prompt_Generator SHALL generate a Kiro_Prompt file at `outputs/kiro-prompt.md`
2. THE Kiro_Prompt SHALL contain the following sections in order: Goal, Scope, Non-goals, Role Sequence
3. THE Kiro_Prompt Role Sequence section SHALL include content from all four Role_Template files (director.md, architect.md, implementer.md, qa.md) in the specified order
4. THE Kiro_Prompt SHALL include the Goal content extracted from the Task_File
5. IF the `outputs/` directory does not exist, THEN THE Prompt_Generator SHALL create the directory before writing the output file
6. FOR ALL valid Task_File inputs, THE Prompt_Generator SHALL produce a Kiro_Prompt that contains every required section (round-trip completeness property)

### 要件 5: CLI インターフェース

**ユーザーストーリー:** ユーザーとして、シンプルなコマンドでプロンプト生成を実行できることで、ツールを簡単に利用したい。

#### 受け入れ基準

1. THE CLI SHALL accept the `prompt` subcommand followed by a Task_File path as arguments (e.g., `tsx src/cli.ts prompt ./task.md`)
2. THE Studio_Kit SHALL provide an npm script `studio:prompt` that executes `tsx src/cli.ts prompt` with forwarded arguments
3. WHEN the CLI is executed without required arguments, THE CLI SHALL display a usage message explaining the expected command format
4. WHEN the CLI completes prompt generation successfully, THE CLI SHALL display a success message indicating the output file path
5. IF an unexpected error occurs during execution, THEN THE CLI SHALL display a descriptive error message and exit with a non-zero exit code
