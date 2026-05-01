## Quality Gates

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

- 存在しない script はスキップし報告
- 失敗時は原因・修正・再実行結果を記録
- 全結果を最終報告に含める
