# Release Notes

## v0.1.0 — Initial Release

**Kiro Studio Kit** — A lightweight CLI for generating structured AI development prompts.

### Features

- **Structured Prompt Generation** — Generates `kiro-prompt.md` from `task.md` with Goal/Scope/Non-goals extraction
- **Role-Based Workflow** — Director / Architect / Implementer / QA role sequence
- **Token Economy Rules** — Minimize context usage with file limits, delta-only reporting, retry limits
- **Anti-Runaway Rules** — Auto-stop on repeated errors, scope violations, type safety breaks
- **Quality Gates** — typecheck / lint / test / build verification framework
- **Completion Criteria** — Structured checklist for task completion validation
- **Public Log Template** — Reproducible development log with runId, timestamps, and file references
- **Experiment Logger** — JSONL-based experiment tracking in `.studio/experiments.jsonl`
- **Token Ledger** — Character-based token estimation with ASCII/non-ASCII awareness in `.studio/token-ledger.jsonl`
- **Experiment Summary** — CLI command to view run statistics (`kiro-studio-kit summary`)
- **Template Variable Expansion** — `{{goal}}`, `{{scope}}`, `{{nonGoals}}` in templates
- **Custom Output Directory** — `--out <dir>` option for flexible output paths
- **npm Package Support** — Install globally or use via `npx`

### CLI Commands

```bash
# Generate prompt
npx kiro-studio-kit prompt ./task.md

# Generate with custom output directory
npx kiro-studio-kit prompt ./task.md --out ./outputs/my-project

# View experiment summary
npx kiro-studio-kit summary
```

### Technical Details

- TypeScript with strict mode
- Zero runtime dependencies (Node.js standard library only)
- 102 tests (unit + property-based + integration)
- ESLint with typescript-eslint strict config
- Node.js >= 18.0.0

### Output Files

| File | Description |
|---|---|
| `outputs/kiro-prompt.md` | Structured AI prompt |
| `outputs/public-log-template.md` | Reproducible development log |
| `.studio/experiments.jsonl` | Experiment log (JSONL, append) |
| `.studio/token-ledger.jsonl` | Token ledger (JSONL, append) |
