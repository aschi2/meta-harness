---
topic: languages/typescript
reviewed: 2026-08-24
---

# TypeScript playbook

## Toolchain the generator assumes

- **pnpm** default for teams/monorepos — its strict node_modules makes undeclared imports fail, mechanically countering phantom-dependency mistakes (https://pnpm.io/motivation, current); Bun acceptable for greenfield single-package speed. Keep an existing repo's manager.
- **TypeScript 7** (native Go compiler, GA 2026-07-08) made `tsc --noEmit` ~10x faster — full typecheck is now viable in per-edit loops (https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/, 2026-07-08). Caveat that shapes lint choice: 7.0 has NO programmatic API until 7.1, so type-aware ESLint rules run on the old TS6 checker — which strengthens **Biome v2** (own type inference, no TS compiler dependency, ~35x faster formatting) as the per-edit lint/format default, keeping ESLint only for plugin-dependent rules (a11y, tailwind, custom) (https://biomejs.dev/blog/biome-v2/, 2025-06-17). Existing ESLint+Prettier repos: keep, don't migrate.
- **tsconfig strictness** (new repos; respect existing config): `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, `module: "NodeNext"` (tsc-transpiled) or `"preserve"` (bundler) (https://www.totaltypescript.com/tsconfig-cheat-sheet, 2024-04). Compiler strictness is the agent's pass/fail signal; `verbatimModuleSyntax` turns ESM/CJS mistakes into compile errors.

## Hooks

- PostToolUse on Edit|Write: format + lint-fix + typecheck on the touched file/package. Hook latency is in the agent's hot path — "a 3-second hook adds 3 seconds to every tool call" — which is why fast Rust tools win here [practitioner consensus]. A caching reference implementation exists (https://github.com/bartolli/claude-code-typescript-hooks, active).
- Stop gate: `tsc --noEmit` (or `turbo run typecheck --affected` in monorepos) + the fast test slice, `|| exit 2`.
- Tests: tell agents `vitest run`, never bare `vitest` — watch mode hangs non-interactive sessions [heuristic]; single-test: `vitest run <file> -t "<name>"` (https://vitest.dev/guide/filtering, current).

## Monorepo specifics

- Affected-only verification: `turbo run test --affected`; boundary enforcement via `turbo boundaries` (imports outside package / undeclared deps) where turborepo exists (https://turborepo.dev/docs/reference/boundaries, current); Nx repos get the Nx MCP server for workspace-graph context (https://nx.dev/features/enhance-AI, current).
- Per-package AGENTS.md: root = purpose + shared tooling, package = package-specific stack; import shared packages by name (`@app/ui`), never relative cross-package paths.

## Framework currency (the biggest measured TS problem)

Agents generate outdated APIs for fast-moving frameworks — Vercel measured 53% baseline pass on post-cutoff Next.js APIs. The eval-winning fix (100%) was an ~8KB compressed docs index INSIDE AGENTS.md pointing at local doc files, with the instruction "prefer retrieval-led reasoning over pre-training-led reasoning"; skills-by-default did nothing (53%) because agents didn't invoke them (https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals, 2026-01-27). Generator rules:

- Next.js ≥16.2 repos: docs ship in `node_modules/next/dist/docs/` and `create-next-app` scaffolds the AGENTS.md block ("your training data is outdated — the docs are the source of truth"); preserve/emit it (https://nextjs.org/blog/next-16-2-ai, 2026-03-18).
- Other fast-moving frameworks: a short AGENTS.md pointer index to version-matched local docs when they exist; an MCP docs server (context7-style) is the weaker fallback — on-demand retrieval underperforms when the agent must decide to call it (same eval).

## Failure modes driving the rules

- `any`/type-assertion abuse to silence errors — counter with lint rules (`no-explicit-any`, `no-unsafe-*`, `consistent-type-assertions`) as gates, not prose [anecdotal consensus; no frequency data].
- Dependency hallucination (npm included in the 5–22% rates; see security.md) — lockfile + frozen installs in CI.
- Duplicate dev servers: vendor-documented agent failure; Next 16.2 added a lock file for exactly this — other stacks get an AGENTS.md line or pidfile guard (https://nextjs.org/blog/next-16-2-ai, 2026-03-18).

## AGENTS.md lines with pedigree

"Use ES modules, not CommonJS"; "typecheck after a series of code changes"; "prefer single tests over the full suite" (official example lines, https://code.claude.com/docs/en/best-practices, current); package manager named only if not npm; language style rules pushed to a linked doc, not inlined.

## LSP

`typescript-lsp` plugin (`@claude-plugins-official`) — post-edit diagnostics mean the agent fixes type errors in the same turn; known caveat: misconfigured monorepo workspaces produce false unresolved-import diagnostics (https://code.claude.com/docs/en/discover-plugins, current).
