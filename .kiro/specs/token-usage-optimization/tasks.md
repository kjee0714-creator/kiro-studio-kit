# Implementation Plan: Token Usage Optimization

## Overview

kiro-studio-kit のプロンプト生成パイプラインにトークン最適化機能を追加する。テンプレート読み込みの並列化、コンパクトモードによるプロンプト圧縮、セクショントリミング、品質ゲートの刷新を段階的に実装する。各コンポーネントは独立した純粋関数モジュールとして作成し、既存の API との後方互換性を維持する。

## Tasks

- [x] 1. Section Trimmer の実装
  - [x] 1.1 `src/core/sectionTrimmer.ts` を作成する
    - `trimSection` 関数を実装: 末尾空白行の除去、3行以上の連続空行を1行に圧縮、各行の末尾空白を除去
    - 冪等性を保証する実装にする（`trimSection(trimSection(x)) === trimSection(x)`）
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 1.2 `src/__tests__/sectionTrimmer.test.ts` にユニットテストを作成する
    - 末尾空白行の除去、連続空行の圧縮、行末空白の除去をそれぞれテスト
    - 空文字列・空白のみの文字列などエッジケースをテスト
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 1.3 `trimSection` の冪等性プロパティテストを作成する（fast-check）
    - **Property 4: セクショントリミングの冪等性**
    - 任意の文字列に対して `trimSection(trimSection(x)) === trimSection(x)` を検証
    - **Validates: Requirements 4.5**

  - [x] 1.4 `trimSection` の末尾空白除去プロパティテストを作成する（fast-check）
    - **Property 5: セクショントリミング後に末尾空白が存在しない**
    - 任意の文字列に対して `trimSection(text)` の各行に末尾空白がないことを検証
    - **Validates: Requirements 4.3**

  - [x] 1.5 `trimSection` の意味的内容保持プロパティテストを作成する（fast-check）
    - **Property 7: コンパクト変換が意味的内容を保持する**
    - 任意の文字列に対して `extractNonWhitespace(trimSection(text)) === extractNonWhitespace(text)` を検証
    - **Validates: Requirements 4.4**

- [x] 2. Compact Transformer の実装
  - [x] 2.1 `src/core/compactTransformer.ts` を作成する
    - `CompactOptions` インターフェースを定義（`removeHeadings`, `compressBlankLines`, `normalizeListSpacing`）
    - `compactTransform` 関数を実装: オプションに応じて見出し除去、空行圧縮、箇条書き正規化を適用
    - 内部ヘルパー `removeHeadingLines`, `compressConsecutiveBlankLines`, `normalizeListItemSpacing` を実装
    - _Requirements: 2.2, 2.3, 2.4_

  - [x] 2.2 `src/__tests__/compactTransformer.test.ts` にユニットテストを作成する
    - 見出し行の除去、空行圧縮、箇条書き正規化をそれぞれテスト
    - オプション個別の有効/無効の組み合わせをテスト
    - _Requirements: 2.2, 2.3, 2.4_

  - [x] 2.3 見出し除去プロパティテストを作成する（fast-check）
    - **Property 2: コンパクト変換後に見出し行が存在しない**
    - 任意の文字列に対して `compactTransform(text, { removeHeadings: true, ... })` の出力に `^#+\s` にマッチする行がないことを検証
    - **Validates: Requirements 2.2**

  - [x] 2.4 空行圧縮プロパティテストを作成する（fast-check）
    - **Property 3: コンパクト変換後に3行以上の連続空行が存在しない**
    - 任意の文字列に対して `compressConsecutiveBlankLines(text)` の出力に `\n{3,}` パターンがないことを検証
    - **Validates: Requirements 2.3**

  - [x] 2.5 箇条書き正規化プロパティテストを作成する（fast-check）
    - **Property 8: 箇条書き正規化後のフォーマット一貫性**
    - 任意の文字列に対して `normalizeListItemSpacing(text)` の箇条書き行が `[-*+] ` 形式で始まることを検証
    - **Validates: Requirements 2.4**

- [x] 3. Checkpoint - Section Trimmer と Compact Transformer の検証
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Template Loader の並列化
  - [x] 4.1 `src/core/templateLoader.ts` の `loadRoleTemplates` を `Promise.all` による並列読み込みに変更する
    - 4つのロールファイル（director, architect, implementer, qa）を `Promise.all` で並列に読み込む
    - 戻り値の型 `RoleTemplates` は変更しない
    - _Requirements: 1.1, 1.3_

  - [x] 4.2 `src/core/templateLoader.ts` の `loadRuleTemplates` を `Promise.all` による並列読み込みに変更し、`LoadRuleOptions` を追加する
    - 4つのルールファイルを `Promise.all` で並列に読み込む
    - `compact?: boolean` オプションを受け取る `LoadRuleOptions` インターフェースを追加
    - `compact: true` 時に `stripExplanations` で品質ゲートテンプレートを簡潔化する
    - `stripExplanations` ヘルパー関数を実装: コードブロック内のコマンドと箇条書きルールのみ抽出
    - _Requirements: 1.2, 1.3, 6.5_

  - [x] 4.3 `src/__tests__/templateLoader.test.ts` を更新し、並列読み込みと `stripExplanations` のテストを追加する
    - 並列読み込みの結果が逐次読み込みと同一であることをテスト
    - `stripExplanations` がコマンドを保持し説明文を除去することをテスト
    - _Requirements: 1.3, 6.5_

  - [x] 4.4 `stripExplanations` のコマンド保持プロパティテストを作成する（fast-check）
    - **Property 9: stripExplanations がコマンドを保持する**
    - 任意の品質ゲートテンプレートに対して、コードブロック内のコマンド行がすべて保持されることを検証
    - **Validates: Requirements 6.5**

- [x] 5. Quality Gate Reporter の実装
  - [x] 5.1 `src/core/qualityGateReporter.ts` を作成する
    - `GateResult`, `QualityGateReport` インターフェースを定義
    - `formatGateResults` 関数を実装: 成功は1行サマリー、失敗は詳細、スキップは1行で報告する表形式出力
    - `determineSkippableGates` 関数を実装: 変更ファイルが `.md` のみの場合に `typecheck`, `lint`, `build` をスキップ対象として返す
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6_

  - [x] 5.2 `src/__tests__/qualityGateReporter.test.ts` にユニットテストを作成する
    - `formatGateResults` の各ステータス（pass, fail, skip）の出力フォーマットをテスト
    - `determineSkippableGates` の判定ロジックをテスト（.md のみ、混在、空配列）
    - _Requirements: 6.2, 6.3, 6.4, 6.6_

- [x] 6. Prompt Generator の拡張
  - [x] 6.1 `src/core/promptGenerator.ts` に `GenerateOptions` と `TokenReduction` 型を追加し、`generatePrompt` の第3引数に `GenerateOptions` を受け取るよう拡張する
    - `GenerateResult` に `tokenReduction?: TokenReduction` フィールドを追加
    - `compact: true` 時に `compactTransform` → `trimSection` の順でプロンプトを圧縮
    - 通常モードとコンパクトモードのトークン数差分を `TokenReduction` として計算
    - `loadRuleTemplates` に `{ compact }` オプションを渡す
    - `compact` オプション省略時は従来通りの動作を維持（後方互換性）
    - _Requirements: 2.1, 2.5, 3.1, 3.2_

  - [x] 6.2 `src/__tests__/promptGenerator.test.ts` を更新し、コンパクトモードのテストを追加する
    - `compact: true` 時にプロンプトが圧縮されることをテスト
    - `TokenReduction` の値が正しく計算されることをテスト
    - `compact` 省略時に従来通りの出力であることをテスト
    - _Requirements: 2.1, 2.5, 3.1, 3.2_

  - [x] 6.3 トークン削減量の非負プロパティテストを作成する（fast-check）
    - **Property 6: トークン削減量は非負**
    - 任意の入力に対して `estimateTokens(compactTransform(input)) <= estimateTokens(input)` を検証
    - **Validates: Requirements 3.1**

- [x] 7. Token Ledger の拡張
  - [x] 7.1 `src/core/tokenLedger.ts` の `TokenLedgerRecord` に `compactMode` フィールドを追加する
    - `compactMode?: { enabled: boolean; tokensSaved: number; reductionPercent: number }` を追加
    - `promptGenerator.ts` の `writeGenerationLogs` でコンパクトモード情報を記録するよう更新
    - _Requirements: 3.3_

  - [x] 7.2 `src/__tests__/tokenLedger.test.ts` を更新し、`compactMode` フィールドの記録テストを追加する
    - `compactMode` フィールドが正しくシリアライズされることをテスト
    - _Requirements: 3.3_

- [x] 8. Checkpoint - コアモジュールの統合検証
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. CLI の `--compact` フラグ対応
  - [x] 9.1 `src/cli.ts` に `--compact` フラグのパースと表示ロジックを追加する
    - `parseCompactFlag` 関数を追加: `args.includes("--compact")` で判定
    - `handlePrompt` 内で `compact` フラグを `generatePrompt` に渡す
    - コンパクトモード時にトークン削減量（削減前、削減後、削減率）を標準出力に表示
    - `showUsage` のヘルプテキストに `--compact` オプションの説明を追加
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 9.2 CLI の `--compact` フラグに関するユニットテストを作成する
    - `parseCompactFlag` の判定ロジックをテスト
    - _Requirements: 5.1, 5.3_

- [x] 10. 品質ゲートテンプレートの刷新
  - [x] 10.1 `templates/rules/quality-gates.md` を刷新する
    - コンパクトモード時に `stripExplanations` で処理しやすい構造に整理
    - コマンド一覧をコードブロックに集約し、ルールを箇条書き3項目以内に簡潔化
    - 通常モードでの可読性も維持する
    - _Requirements: 6.1, 6.5_

- [x] 11. Public API のエクスポート更新
  - [x] 11.1 `src/index.ts` に新規モジュールのエクスポートを追加する
    - `sectionTrimmer.ts` から `trimSection` をエクスポート
    - `compactTransformer.ts` から `compactTransform`, `CompactOptions` をエクスポート
    - `qualityGateReporter.ts` から `formatGateResults`, `determineSkippableGates`, `GateResult`, `QualityGateReport` をエクスポート
    - `promptGenerator.ts` から `GenerateOptions`, `TokenReduction` をエクスポート
    - `templateLoader.ts` から `LoadRuleOptions` をエクスポート
    - _Requirements: 2.1, 4.1, 6.6_

- [x] 12. 統合テスト
  - [x] 12.1 `src/__tests__/integration.test.ts` を更新し、コンパクトモードの統合テストを追加する
    - `generatePrompt` を `compact: true` で実行し、出力ファイルが生成されることをテスト
    - 生成されたプロンプトに見出し行が含まれないことをテスト
    - `TokenReduction` が正しく返されることをテスト
    - Token Ledger に `compactMode` 情報が記録されることをテスト
    - `compact` 省略時に従来通りの動作であることをテスト
    - _Requirements: 2.1, 2.5, 3.1, 3.2, 3.3, 5.1_

- [x] 13. Final checkpoint - 全テスト・品質ゲート通過確認
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- タスクに `*` が付いているサブタスクはオプションであり、スキップ可能です
- 各タスクは前のタスクの成果物に依存するため、順番通りに実行してください
- プロパティテストは `fast-check`（既に devDependencies に含まれる）を使用します
- チェックポイントでは `npm run typecheck && npm run lint && npm run test && npm run build` を実行してください
- 既存の API との後方互換性を維持することが重要です（`compact` オプション省略時は従来通りの動作）
