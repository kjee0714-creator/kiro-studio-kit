# Bugfix Requirements Document

## Introduction

`src/cli.ts` のモジュール末尾で `main().catch(...)` がトップレベルで無条件に実行されているため、テストファイルから `parseCompactFlag` や `parseMode` などのユーティリティ関数をインポートするだけで `main()` が実行される。これにより `process.argv` にサブコマンドがない状態で `showUsage()` → `process.exit(1)` が呼ばれ、Vitest が Unhandled Rejection エラーを報告する。この副作用はテストの信頼性を損ない、CI パイプラインの安定性にも影響する。

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN テストファイルが `src/cli.ts` から関数をインポートする THEN モジュール評価時に `main().catch(...)` がトップレベルで実行され、`main()` が呼び出される

1.2 WHEN `main()` がテスト環境で実行され `process.argv` にサブコマンドが含まれない THEN `showUsage()` が呼ばれた後 `process.exit(1)` が実行され、Vitest が Unhandled Rejection エラーを報告する

1.3 WHEN テストファイルが `parseCompactFlag` や `parseMode` のみをインポートする THEN それらの関数のテストとは無関係に `main()` の副作用が発生する

### Expected Behavior (Correct)

2.1 WHEN テストファイルが `src/cli.ts` から関数をインポートする THEN モジュール評価時に `main()` は実行されず、エクスポートされた関数のみが利用可能になる SHALL

2.2 WHEN `src/cli.ts` がテスト環境でインポートされる THEN `process.exit` は呼ばれず、Unhandled Rejection エラーは発生しない SHALL

2.3 WHEN テストファイルが `parseCompactFlag` や `parseMode` のみをインポートする THEN それらの関数のみが副作用なしで利用可能になる SHALL

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `dist/cli.js` が CLI として直接実行される（`node dist/cli.js prompt <task-file>`） THEN `main()` が実行され、プロンプト生成が正常に動作する SHALL CONTINUE TO

3.2 WHEN `dist/cli.js` が CLI として直接実行され、サブコマンドが指定されない THEN `showUsage()` が表示され `process.exit(1)` で終了する SHALL CONTINUE TO

3.3 WHEN `dist/cli.js` が CLI として直接実行され、不正なサブコマンドが指定される THEN `showUsage()` が表示され `process.exit(1)` で終了する SHALL CONTINUE TO

3.4 WHEN `dist/cli.js` が CLI として直接実行され、実行時エラーが発生する THEN エラーメッセージが表示され `process.exit(1)` で終了する SHALL CONTINUE TO

3.5 WHEN `parseCompactFlag` が引数配列を受け取る THEN 従来通り `--compact` フラグの有無を正しく判定する SHALL CONTINUE TO

3.6 WHEN `parseMode` が引数配列を受け取る THEN 従来通り `--mode` の値を正しく解析する SHALL CONTINUE TO

---

## Bug Condition (Formal)

### Bug Condition Function

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type ModuleImportContext
  OUTPUT: boolean

  // Returns true when cli.ts is imported as a module (not executed as CLI entry point)
  RETURN X.importedAsModule = true AND X.isDirectCLIExecution = false
END FUNCTION
```

### Property: Fix Checking

```pascal
// Property: Fix Checking - Import does not trigger main()
FOR ALL X WHERE isBugCondition(X) DO
  result ← import(cli.ts)
  ASSERT main_was_not_called(result)
  ASSERT no_process_exit(result)
  ASSERT no_unhandled_rejection(result)
  ASSERT exported_functions_available(result, ["parseCompactFlag", "parseMode"])
END FOR
```

### Property: Preservation Checking

```pascal
// Property: Preservation Checking - CLI direct execution unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
  // CLI direct execution behaves identically before and after the fix
END FOR
```
