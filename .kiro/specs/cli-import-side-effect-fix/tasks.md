# Implementation Plan

- [x] 1. バグ条件探索テストを作成する
  - **Property 1: Bug Condition** - インポート時に main() が無条件実行される
  - **CRITICAL**: このテストは修正前のコードで FAIL する必要がある — 失敗はバグの存在を確認するもの
  - **テストを修正したり、コードを修正したりしないこと**（失敗が期待される）
  - **NOTE**: このテストは期待される動作をエンコードしている — 修正後に PASS することで修正を検証する
  - **GOAL**: バグの存在を示すカウンターサンプルを表面化させる
  - **Scoped PBT Approach**: `src/cli.ts` をモジュールとしてインポートした場合に `main()` が実行されないことを検証する
  - `src/__tests__/cli-side-effect.property.test.ts` にテストファイルを作成する
  - テスト内容: `src/cli.ts` をインポートした際に `process.exit` が呼ばれないこと、Unhandled Rejection が発生しないことを検証する
  - Bug Condition（design より）: `isBugCondition(X)` = `X.importedAsModule = true AND X.isDirectCLIExecution = false`
  - Expected Behavior（design より）: `main()` は実行されず、`parseCompactFlag` と `parseMode` が副作用なしで利用可能
  - 修正前のコードでテストを実行する
  - **EXPECTED OUTCOME**: テストが FAIL する（これはバグの存在を証明する正しい結果）
  - 発見されたカウンターサンプルを記録する（例: `import { parseCompactFlag } from "../cli.js"` で `process.exit(1)` が発生）
  - テストが作成・実行され、失敗が記録されたらタスク完了とする
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 2. 保持プロパティテストを作成する（修正前に実施）
  - **Property 2: Preservation** - parseCompactFlag と parseMode の動作保持
  - **IMPORTANT**: 観察ファーストの方法論に従うこと
  - **IMPORTANT**: 修正を実装する前にこのテストを作成・実行すること
  - `src/__tests__/cli-preservation.property.test.ts` にテストファイルを作成する
  - 観察: 修正前のコードで `parseCompactFlag` と `parseMode` の動作を確認する
  - 観察: `parseCompactFlag(["--compact"])` → `true`、`parseCompactFlag([])` → `false`
  - 観察: `parseMode(["--mode", "full"])` → `{ mode: "full", invalid: null }`
  - 観察: `parseMode(["--mode", "invalid"])` → `{ mode: null, invalid: "invalid" }`
  - fast-check を使用したプロパティベーステスト:
    - 任意の文字列配列に対して `parseCompactFlag` は `"--compact"` の有無のみに依存する
    - 任意の文字列配列に対して `parseMode` は `"--mode"` の後の値のみに依存する
    - 有効なモード値（`"full"`, `"compact"`, `"minimal"`）は常に正しく解析される
  - Preservation Requirements（design より）: Requirements 3.5, 3.6 — 関数ロジック自体は変更されない
  - 修正前のコードでテストを実行する
  - **EXPECTED OUTCOME**: テストが PASS する（ベースライン動作の確認）
  - テストが作成・実行され、修正前コードで PASS したらタスク完了とする
  - _Requirements: 3.5, 3.6_

- [ ] 3. `src/cli.ts` のバグ修正を実装する

  - [x] 3.1 ガード条件を追加して `main()` の無条件実行を防止する
    - `node:url` から `fileURLToPath` をインポートする
    - `node:path` から `path` をインポートする（既存の `path` 利用がなければ追加）
    - `import.meta.url` から `__filename` を導出する: `const __filename = fileURLToPath(import.meta.url);`
    - `process.argv[1]` を `path.resolve()` で絶対パスに正規化し、`__filename` と比較するガード条件を追加する
    - 既存の `main().catch(...)` をガード条件 `if (process.argv[1] && path.resolve(process.argv[1]) === __filename)` 内に移動する
    - _Bug_Condition: isBugCondition(X) where X.importedAsModule = true AND X.isDirectCLIExecution = false_
    - _Expected_Behavior: モジュールインポート時に main() が実行されず、エクスポートされた関数のみが副作用なしで利用可能_
    - _Preservation: CLI として直接実行された場合（node dist/cli.js, tsx src/cli.ts）の既存動作が完全に保持される_
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.2 バグ条件探索テストが PASS することを確認する
    - **Property 1: Expected Behavior** - インポート時に main() が実行されない
    - **IMPORTANT**: タスク 1 と同じテストを再実行する — 新しいテストを書かないこと
    - タスク 1 のテストは期待される動作をエンコードしている
    - このテストが PASS すれば、期待される動作が満たされたことを確認できる
    - `src/__tests__/cli-side-effect.property.test.ts` を実行する
    - **EXPECTED OUTCOME**: テストが PASS する（バグが修正されたことを確認）
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 保持プロパティテストが引き続き PASS することを確認する
    - **Property 2: Preservation** - parseCompactFlag と parseMode の動作保持
    - **IMPORTANT**: タスク 2 と同じテストを再実行する — 新しいテストを書かないこと
    - `src/__tests__/cli-preservation.property.test.ts` を実行する
    - **EXPECTED OUTCOME**: テストが PASS する（リグレッションがないことを確認）
    - 修正後もすべてのテストが PASS することを確認する（リグレッションなし）

- [x] 4. チェックポイント — すべてのテストと品質ゲートが通過することを確認する
  - `npm run typecheck` を実行して型チェックが通ることを確認する
  - `npm run lint` を実行してリントエラーがないことを確認する
  - `npm run test` を実行してすべてのテストが PASS することを確認する（Unhandled Rejection が消えていること）
  - `npm run build` を実行してビルドが成功することを確認する
  - 問題が発生した場合はユーザーに確認する
