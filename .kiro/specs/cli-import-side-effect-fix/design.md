# CLI Import Side Effect Fix - バグ修正デザイン

## Overview

`src/cli.ts` のモジュール末尾で `main().catch(...)` がトップレベルで無条件に実行されるため、テストファイルから `parseCompactFlag` や `parseMode` などのユーティリティ関数をインポートするだけで `main()` が実行され、Vitest で Unhandled Rejection が発生するバグを修正する。

修正アプローチとして、ESM 環境で `process.argv[1]` と `import.meta.url` を比較し、CLI として直接実行された場合のみ `main()` を呼び出すガード条件を追加する。これにより、モジュールとしてインポートされた場合は副作用なしでエクスポートされた関数のみが利用可能になる。

## Glossary

- **Bug_Condition (C)**: `src/cli.ts` がモジュールとしてインポートされた場合（CLI エントリポイントとして直接実行されていない場合）に `main()` が無条件に実行される条件
- **Property (P)**: モジュールインポート時に `main()` が実行されず、エクスポートされた関数のみが副作用なしで利用可能になること
- **Preservation**: CLI として直接実行された場合（`node dist/cli.js` または `tsx src/cli.ts`）の既存動作が変更されないこと
- **main()**: `src/cli.ts` 内の非同期関数。`process.argv` を解析し、サブコマンドに応じてプロンプト生成またはサマリー表示を実行する
- **import.meta.url**: ESM モジュールの現在のファイル URL を返すメタプロパティ
- **process.argv[1]**: Node.js プロセスに渡された最初の引数（通常は実行されたスクリプトのパス）

## Bug Details

### Bug Condition

`src/cli.ts` がテストファイルや他のモジュールからインポートされると、モジュール評価時にファイル末尾の `main().catch(...)` が無条件に実行される。テスト環境では `process.argv` にサブコマンドが含まれないため、`showUsage()` → `process.exit(1)` が呼ばれ、Vitest が Unhandled Rejection エラーを報告する。

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type ModuleImportContext
  OUTPUT: boolean

  RETURN input.importedAsModule = true
         AND input.isDirectCLIExecution = false
         AND main() is unconditionally invoked at module evaluation time
END FUNCTION
```

### Examples

- `import { parseCompactFlag } from "../cli.js"` → テストファイルでインポートするだけで `main()` が実行され、`process.exit(1)` が呼ばれる（期待: `main()` は実行されない）
- `import { parseMode } from "../cli.js"` → 同様に副作用が発生する（期待: `parseMode` のみが利用可能になる）
- `tsx src/cli.ts prompt examples/task.md` → CLI として直接実行、`main()` が正常に実行される（期待: 変更なし）
- `node dist/cli.js prompt examples/task.md` → ビルド後の CLI 実行、`main()` が正常に実行される（期待: 変更なし）

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `dist/cli.js` が CLI として直接実行された場合、`main()` が実行されプロンプト生成が正常に動作する
- `dist/cli.js` が CLI として直接実行されサブコマンドが指定されない場合、`showUsage()` が表示され `process.exit(1)` で終了する
- `dist/cli.js` が CLI として直接実行され不正なサブコマンドが指定される場合、`showUsage()` が表示され `process.exit(1)` で終了する
- `tsx src/cli.ts prompt <task-file>` による開発時実行が正常に動作する
- `parseCompactFlag` と `parseMode` の関数ロジック自体は変更されない

**Scope:**
モジュールとしてインポートされた場合（テストファイルや他のモジュールから）のみ動作が変更される。CLI として直接実行された場合の動作は完全に保持される。以下は影響を受けない：
- `node dist/cli.js` による直接実行
- `tsx src/cli.ts` による開発時実行
- `npm run studio:prompt` による実行
- `npm run studio:summary` による実行

## Hypothesized Root Cause

バグの根本原因は明確である：

1. **無条件のトップレベル実行**: `src/cli.ts` の末尾で `main().catch(...)` がガード条件なしに記述されている。ESM モジュールでは、`import` 文によりモジュールが評価される際にトップレベルのコードがすべて実行されるため、インポートするだけで `main()` が呼び出される。

2. **ESM でのエントリポイント判定の欠如**: CommonJS では `require.main === module` でエントリポイント判定が可能だが、ESM にはこの仕組みがない。現在のコードには ESM 環境でのエントリポイント判定ロジックが実装されていない。

3. **モジュール設計の問題**: エクスポートされるユーティリティ関数（`parseCompactFlag`, `parseMode`）と CLI エントリポイントロジック（`main()`）が同一ファイルに混在しており、関心の分離が不十分である。

## Correctness Properties

Property 1: Bug Condition - インポート時に main() が実行されない

_For any_ input where `src/cli.ts` がモジュールとしてインポートされる場合（isBugCondition returns true）、修正後のモジュールは `main()` を実行せず、`process.exit` を呼ばず、Unhandled Rejection を発生させず、エクスポートされた関数（`parseCompactFlag`, `parseMode`）のみが副作用なしで利用可能になる SHALL。

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - CLI 直接実行時の動作保持

_For any_ input where `src/cli.ts` が CLI として直接実行される場合（isBugCondition returns false）、修正後のコードは修正前と同一の動作を行い、`main()` が正常に実行され、サブコマンドの解析・実行・エラーハンドリングがすべて保持される SHALL。

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

修正対象は `src/cli.ts` の1ファイルのみ。

**File**: `src/cli.ts`

**Function**: モジュール末尾のトップレベル `main().catch(...)` 呼び出し

**Specific Changes**:

1. **`url` モジュールのインポート追加**: `fileURLToPath` を `node:url` からインポートする
   ```typescript
   import { fileURLToPath } from "node:url";
   ```

2. **エントリポイント判定ロジックの追加**: `import.meta.url` と `process.argv[1]` を比較するガード条件を追加する
   ```typescript
   const __filename = fileURLToPath(import.meta.url);
   ```

3. **`main()` 呼び出しのガード**: 無条件の `main().catch(...)` を条件付き実行に変更する
   ```typescript
   if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
     main().catch((error: unknown) => {
       console.error(
         `予期しないエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
       );
       process.exit(1);
     });
   }
   ```

4. **`path` モジュールのインポート追加**: `path.resolve` を使用するため `node:path` をインポートする
   ```typescript
   import path from "node:path";
   ```

5. **`path.resolve` による正規化**: `process.argv[1]` は相対パスの場合があるため、`path.resolve` で絶対パスに正規化してから比較する。これにより `tsx src/cli.ts` と `node dist/cli.js` の両方のケースで正しく動作する。

### 修正後のコード構造

```typescript
#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";
import { generatePrompt } from "./core/promptGenerator.js";
// ... 既存のインポート ...

// ... 既存の関数定義（showUsage, parseCompactFlag, parseMode, etc.）...

// CLIとして直接実行された場合のみ main() を実行
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error: unknown) => {
    console.error(
      `予期しないエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
```

## Testing Strategy

### Validation Approach

テスト戦略は2段階のアプローチに従う：まず修正前のコードでバグを再現するカウンターサンプルを表面化させ、次に修正が正しく機能し既存動作が保持されることを検証する。

### Exploratory Bug Condition Checking

**Goal**: 修正を実装する前にバグを再現するカウンターサンプルを表面化させる。根本原因分析を確認または反証する。反証した場合は再仮説が必要。

**Test Plan**: テストファイルから `src/cli.ts` をインポートし、`main()` が実行されるかどうかを検証するテストを作成する。修正前のコードでこれらのテストを実行し、失敗を観察して根本原因を理解する。

**Test Cases**:
1. **Import Side Effect Test**: `cli.ts` をインポートするだけで `process.exit` が呼ばれることを確認する（修正前コードで失敗）
2. **Module Evaluation Test**: モジュール評価時に `main()` が呼び出されることを確認する（修正前コードで失敗）
3. **Exported Functions Availability Test**: インポート後にエクスポートされた関数が利用可能であることを確認する（修正前コードでは副作用付きで成功）

**Expected Counterexamples**:
- `import { parseCompactFlag } from "../cli.js"` を実行すると `main()` が呼ばれ `process.exit(1)` が発生する
- 原因: モジュール末尾の `main().catch(...)` にガード条件がない

### Fix Checking

**Goal**: バグ条件が成立するすべての入力に対して、修正後の関数が期待される動作を生成することを検証する。

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := import("src/cli.ts")  // モジュールとしてインポート
  ASSERT main_was_not_called(result)
  ASSERT no_process_exit(result)
  ASSERT no_unhandled_rejection(result)
  ASSERT exported_functions_available(result, ["parseCompactFlag", "parseMode"])
END FOR
```

### Preservation Checking

**Goal**: バグ条件が成立しないすべての入力に対して、修正後の関数が修正前と同じ結果を生成することを検証する。

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalCLI(input) = fixedCLI(input)
  // CLI直接実行時の動作が同一であること
END FOR
```

**Testing Approach**: プロパティベーステストは保持チェックに推奨される。理由：
- 入力ドメイン全体にわたって多数のテストケースを自動生成する
- 手動ユニットテストでは見逃す可能性のあるエッジケースを検出する
- 非バグ入力に対して動作が変更されていないことの強い保証を提供する

**Test Plan**: 修正前のコードで `parseCompactFlag` と `parseMode` の動作を観察し、修正後もそれらの動作が保持されることをプロパティベーステストで検証する。

**Test Cases**:
1. **parseCompactFlag Preservation**: 任意の文字列配列に対して `parseCompactFlag` が修正前と同じ結果を返すことを検証する
2. **parseMode Preservation**: 任意の文字列配列に対して `parseMode` が修正前と同じ結果を返すことを検証する
3. **Import Without Side Effect**: 修正後のモジュールをインポートしても `process.exit` が呼ばれないことを検証する
4. **CLI Execution Preservation**: CLI として直接実行した場合の動作が保持されることを検証する

### Unit Tests

- モジュールインポート時に `main()` が実行されないことのテスト
- `parseCompactFlag` の既存テストが引き続きパスすることの確認
- `parseMode` の既存テストが引き続きパスすることの確認
- エントリポイント判定ロジック（`process.argv[1]` vs `import.meta.url`）の正確性テスト

### Property-Based Tests

- ランダムな文字列配列を生成し、`parseCompactFlag` が `"--compact"` の有無のみに依存することを検証する
- ランダムな文字列配列を生成し、`parseMode` が有効なモード値のみを受け入れることを検証する
- モジュールインポートのコンテキストを変えて、副作用が発生しないことを検証する

### Integration Tests

- `tsx src/cli.ts prompt examples/task.md` の実行が正常に動作することの確認
- テストスイート全体（`vitest --run`）が Unhandled Rejection なしで完了することの確認
- `npm run studio:prompt` と `npm run studio:summary` が正常に動作することの確認
