---
topic: languages/go
reviewed: 2026-08-24
---

# Go playbook

Go's agent advantage is LOOP MECHANICS — fast builds, cached tests, compiler errors as feedback, package-prefixed greppability, no circular imports (https://lucumr.pocoo.org/2026/2/9/a-language-for-agents/, 2026-02-09; https://crawshaw.io/blog/programming-with-llms, 2025-01-06) — not raw model competence (SWE-bench Multilingual put Go near the bottom at 31%, https://www.swebench.com/multilingual.html, 2025). The harness's job is to exploit the loop.

## Toolchain

- Format: gofmt/goimports zero-config; `gofumpt` where the repo already uses it. Lint: **golangci-lint v2** (config needs `version: "2"`; formatters split out; `golangci-lint migrate` upgrades old configs — https://golangci-lint.run/docs/product/migration-guide/, current).
- Linters that specifically catch agent mistakes (generate these enabled): **errcheck** with `check-blank`/`check-type-assertions` (agents underweight error handling in non-critical paths), **staticcheck**, **govet**, **errorlint**, **nilerr**/**nilnil** (the "checked err then returned nil anyway" pattern), **bodyclose**, **forcetypeassert**, **gosec** (https://golangci-lint.run/docs/linters/, current; https://cloudzy.com/blog/linting-for-ai-generated-code/, 2026-06-22).
- Agent-tuned lint config details from a real agent-heavy repo: style/complexity linters excluded from `_test.go` (table-driven tests are branchy by design); `max-issues-per-linter: 0` and `max-same-issues: 0` so lint output is never truncated for the agent (https://github.com/netdata/ai-viewer/blob/master/.golangci.yml, 2026-08-24).

## Verification loop

- Single-test: `go test ./pkg -run 'TestName/subcase'` — `-run` is a cacheable flag, so focused loops are fast AND cached. AGENTS.md must say: `(cached)` output means PASS, not skipped; use `-count=1` only on suspected staleness (https://pkg.go.dev/cmd/go, official).
- `-race` is too slow for the per-edit loop (2–20x runtime) — put it in CI/pre-merge, not hooks (https://go.dev/doc/articles/race_detector, official). Pair with `goleak.VerifyTestMain` for goroutine-leak detection in repos with heavy concurrency (https://github.com/uber-go/goleak, current) [countermeasure pairing is standard practice, not agent-specific evidence].
- `go generate` never runs automatically — repos with generated code (sqlc, protobuf, templates) get an AGENTS.md line naming the regeneration command and when it's needed (https://pkg.go.dev/cmd/go, official).

## Modules and workspaces

- Do not commit `go.work` (official guidance — it overrides developers' workspaces and makes CI test wrong versions; https://go.dev/ref/mod#workspaces) — and an agent-created stray go.work silently changes resolution, so gitignore it and note it [inference].
- `go mod tidy` after dependency changes; vendoring (`go mod vendor`) is worth noting for network-sandboxed agent environments — builds stop touching the network (https://go.dev/ref/mod#vendoring, official).
- Multi-module repos: nested AGENTS.md per module, standard closest-wins.

## Failure modes driving the rules

- Ignored errors and nil-pattern mistakes (lint-gated, above); hallucinated APIs and invented test values — countered by the compile/test loop plus an AGENTS.md line to check the team's libraries before hand-rolling (a real team documented agents hallucinating their utility lib's functions and defaulting to hand-rolled loops — https://www.hived.space/blog/ai-coding-at-hived, 2026-05-12).
- Stale idioms from training data (pre-1.22 loop-var copies): lint for outdated patterns; gopls's modernize analyzer surfaces post-cutoff idioms via diagnostics (https://go.dev/gopls/features/mcp, official).
- Design-level flaws that compile fine (auth logic, O(n×m) API loops) are documented in agent-built Go — linters don't catch them; that's what review structure is for (https://crawshaw.io/blog/programming-with-agents, 2025-06-08; see team-workflows.md).

## AGENTS.md lines with pedigree

From a shipping agent-built Go product's AGENTS.md (https://github.com/charmbracelet/crush/blob/main/AGENTS.md, 2026-08-24): build/test/single-test/lint commands via task targets; `context.Context` as first param; wrap errors with `fmt.Errorf`; define interfaces in consuming packages, keep them small; `t.Parallel()`/`t.TempDir()` conventions. Plus: suppress verbose test output (token cost) and golden-file update flags where used.

## LSP

gopls ships a built-in MCP server (≥v0.20): `claude mcp add gopls -- gopls mcp`; exposes diagnostics (incl. modernize fixes) and symbol references; `gopls mcp -instructions` emits usage guidance to include in context (https://go.dev/gopls/features/mcp, official, current).
