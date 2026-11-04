# meta-harness

Open-source Bun/TypeScript core for plan-driven agent harnesses. `CLAUDE.md` is a symlink to this file.

## Structure

- `src/`: CLI, runtime schemas, file operations, checks, hooks, maintenance.
- `schemas/`: published JSON Schemas; regenerate with `bun run schemas`.
- `packs/`: coding, knowledge-wiki, coaching, and implicitly included base pack. Pack paths are relative to each pack root.
- `skills/`: agent judgment and orchestration; call the installed `meta-harness` CLI, not source paths.
- `docs/`: pack authoring and user-facing reference.
- `test/`: unit, integration, and synthetic fixture tests. Never add personal data or machine-specific paths.

## Rules

- The core owns deterministic file operations; skills interview, make judgments, write plans, and review results.
- Extend schemas additively. Validate external data at command boundaries.
- Keep overlays and trust approvals outside the repository. Never run install against the real home during tests.
- Hooks ignore repo `bunfig.toml` and `.env`, run with deadlines, and fail open. Keep stdout limited to the hook protocol.
- Knowledge claims need primary-source citations and dates, or an explicit heuristic/preference label. Update reviewed dates and the pack changelog together.
- Keep package examples, fixtures, and docs synthetic and free of personal or user-specific content.

## Verify

```sh
bun install
bun run typecheck
bun test
bun run src/cli.ts validate .
```
