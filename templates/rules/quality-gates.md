## Quality Gates ルール

以下の品質ゲートを実行してください：

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

### 実行ルール

- 存在しない script がある場合は、その旨を報告し、存在する検証のみ実行する
- 失敗した検証がある場合は、原因・修正内容・再実行結果を記録する
- 品質ゲート未実行のまま完了扱いにしない
- すべての検証結果を最終報告に含める
