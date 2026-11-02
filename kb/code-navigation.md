---
topic: code-navigation
reviewed: 2026-09-02
---

# Code navigation and lookup

What navigation infrastructure to generate, keyed to repo size. Default is the least infrastructure that works: agentic search (glob/grep/read) beat RAG in Anthropic's own testing (https://newsletter.pragmaticengineer.com/p/building-claude-code-with-boris-cherny, 2025) and keyword-search-only agents reach >90% of RAG performance (https://arxiv.org/abs/2602.23368, 2025-12-19). Sophisticated retrieval scaffolding adds only marginal gains over simple approaches (ContextBench, https://arxiv.org/abs/2602.05892, 2026).

No primary source distinguishes navigation infrastructure by steered vs autonomous mode — treat tiers, LSP, deny rules, and indexing as mode-agnostic until evidence appears.

## Size tiers

No consensus numeric threshold exists; these tiers combine the numbers sources actually cite. Measure file count over source files only (`git ls-files` in a git repo, `find` otherwise, excluding vendored/generated directories even when tracked). Precedence: a repo takes the HIGHEST tier any of its triggers matches — structure triggers (multi-package → at least M; monorepo/multi-repo → L) override a smaller file count.

### Tier S — under ~1,000 files, single package
- Grep-first, no extra infrastructure. One root AGENTS.md.
- Only universal hygiene: .gitignore covers generated output (agent searches respect it — https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start, 2026-05-14).

### Tier M — ~1,000–10,000 files, or multi-package
- Nested per-package AGENTS.md/CLAUDE.md; root file becomes pointers + gotchas; per-package test/lint commands (https://code.claude.com/docs/en/large-codebases, current). "Closest file wins" is the cross-tool standard (https://agents.md/).
- LSP for precision navigation: Claude Code code-intelligence plugins (`/plugin install typescript-lsp@claude-plugins-official` etc.), forced on repo-wide via `enabledPlugins` in committed `.claude/settings.json`; Serena MCP (https://github.com/oraios/serena) for tools without native LSP. Caveat: agents sometimes don't invoke available LSP tools — pair with an AGENTS.md line saying when to use it (mentioning a tool strongly increases its use, see context-files.md).
- Committed settings deny-rules blocking Read of generated/vendored/build directories — cheap and high-value (https://code.claude.com/docs/en/large-codebases).
- Navigation shortcuts in AGENTS.md (e.g. the monorepo's own "where is X" command) instead of directory prose (https://agents.md/).
- Glob-scoped skills via `paths:` frontmatter load navigation guidance only in the directory it applies to, regardless of where the skill file lives; a `SessionStart` hook can look up the launch directory and recommend the right navigation aid for that area (https://code.claude.com/docs/en/large-codebases, fetched 2026-09-02).

### Tier L — >~10,000 files / monorepo / multi-repo
- Everything in Tier M, plus: `claudeMdExcludes` for untouched packages, sparse-checkout config (`worktree.sparsePaths`), per-directory path-scoped skills/rules, sessions started from the package directory not root (https://code.claude.com/docs/en/large-codebases, current).
- Semantic index becomes worth considering: Cursor's measured gains concentrate above 1,000 files (+2.6% code retention vs +0.3% overall, https://cursor.com/blog/semsearch, 2025-11-06); grep+semantic beat either alone on file-read precision in a vendor benchmark (https://www.startuphub.ai/ai-news/ai-research/2026/claude-code-benchmarking-semantic-search-vs-grep, 2026-06-03). Contested: Anthropic ships no index and Sourcegraph abandoned pure embeddings for staleness reasons. Default: add an index only when the team reports keyword-free/conceptual lookup pain or grep latency (>15s searches was Cursor's operational trigger); prefer an existing org index exposed over MCP (Sourcegraph MCP is GA) or a local MCP tool (ChunkHound for code, qmd for markdown corpora) over bespoke pipelines.
- Cross-repo work is its own trigger regardless of size: "value shows up the moment your repo count crosses 1" (https://sourcegraph.com/blog/agentic-coding, 2026-05-21).
- Watch item, single-source vendor claim: SonarSource Vortex/SemSitter — an MCP-style live dependency graph answering structural queries (implementers, callers) in one call instead of grep-and-read loops, vendor-reported up to 36% token reduction; no independent measurement (https://www.sonarsource.com/blog/cut-your-coding-agents-cost-with-sonar-semantic-code-navigation/, 2026-06). Commercial/SonarQube-attached — consider, don't prefer, until independently verified.

## Repo maps and architecture summaries

- Checked-in repo maps/codemaps: benefit is UNPROVEN — the one quantitative comparison found a knowledge-graph map cheaper (10x fewer tokens) but WORSE on answer quality than plain file exploration (https://arxiv.org/abs/2603.27277, 2026), and staleness is documented at scale: 23% of repos' AI config artifacts contain stale code references (https://arxiv.org/abs/2606.09090, 2026-06-08). Agents trust docs absolutely, so a stale map is worse than no map (https://arxiv.org/abs/2602.20478, 2026-02-24).
- Generate a codebase map ONLY for genuinely unconventional directory structures (Anthropic's stated exception, https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start, 2026-05-14), keep it to pointers not prose, and pair it with a review rule: instruction/map files get PR review like documentation.
- ctags is legacy; tree-sitter/ast-grep is the current structural layer, but it arrives via tools (LSP plugins, Serena, ChunkHound), not as something the generator builds.

## Generator rules

- Never build bespoke embedding pipelines, vector DBs, or custom indexers — integrate existing tools via MCP config or plugins when a tier calls for it.
- Every navigation aid checked in must name its upkeep owner or be self-maintaining; a stale aid is a liability (see staleness evidence above). `OTEL_LOG_TOOL_DETAILS=1` emits `skill_activated` events with an `invocation_trigger` field — use it to find navigation aids that are never triggered and prune them (https://code.claude.com/docs/en/large-codebases, fetched 2026-09-02).
- Record the measured tier in the manifest profile so `/harness-update` detects tier crossings.
