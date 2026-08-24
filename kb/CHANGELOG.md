# KB changelog

Newest first — new entries go at the top, with a unique heading (date + short slug). `/harness-update` scopes upgrades to the entries above a manifest's recorded `kbEntry`.

## 2026-08-24 — archetype playbooks

New `kb/archetypes/` layer (5 parallel agents, primary sources fetched 2026-08-24), loaded by profiled project type; `/harness-new` step 2 updated.

- archetypes/web-app: NEW — Playwright Agents + auth-state tiers + fast-loop test flags; preview deploys as verification (bypass-secret wiring, per-preview DB branches); named seed/reset commands (Prisma v7 removed auto-seed); Storybook never-hallucinate-props guardrail; RSC boundary rules incl. the edge-runtime stale-guidance trap.
- archetypes/mobile: NEW — first-party tooling preferred (Flutter MCP/plugin, XcodeBuildMCP, Android agent CLI, Expo defaults); verification ladder (headless → JVM screenshots → simulator); exact-simulator baseline discipline; docs-currency countermeasures (Apple docs invisible to agents); signing/store as hard supervision boundary.
- archetypes/data-ml: NEW — make data visible (schema contracts, profiling commands, data-shaped verifiers); version pins unusually load-bearing; smoke-train + multi-seed + tamper-resistant eval (ML reward hacking measured at 30%); constrained-surface + real-run loop; GPU limits stated with remote-run substitute.
- archetypes/cli-library: NEW — API-diff gates + agent fence lines from real AGENTS.md files (version/release/`.github/` off-limits); docs-as-tests; downstream test suites; cross-platform "what CI covers that local can't"; trusted-publishing release safety; humans merge Release PRs.
- archetypes/services-infra: NEW — tiers in prose, enforcement in config (Replit incident evidence); migration lint + shadow-DB loops + migrations-dir locks; plan-only IaC with policy gates; GitOps as the agent boundary; read-only prod observability.

## 2026-08-24 — operations round

Five new topics on harness operations (5 parallel agents, primary sources fetched 2026-08-24), plus one correction.

- testing-strategy: NEW — test-gaming is measured (reward hacking up to 100% on specific tasks); countermeasures (anti-gaming AGENTS.md lines, red-before-green with committed failing tests, test-path locks, writer/reviewer split); coverage as ratchet not gate; mutation testing validates suites; differential/oracle testing for ports; TDD offered not imposed.
- runtime-feedback: NEW — log-to-file + console-forwarding + dev-server guards as the highest-ROI surface; one browser tool per web repo (CLI preferred); screenshot-compare for verification not pixel refinement; debuggers not wired by default; per-project-kind checklist.
- autonomous-operation: NEW (opt-in layer) — initializer + progress log + flip-only feature list + test tiers; productized loop ladder over hand-rolled loops; documented loop failure modes; worktree/PR-per-agent parallelism; containment governing rule (bypass only in containers).
- mcp-and-tools: NEW — context economics (deferral ~85% cut, accuracy improved); CLI-first with the tool-design caveat; category verdicts (browser strongest, DB weakest); wiring/scoping rules incl. headless-loads-without-approval trap; most repos correctly get zero project MCP servers.
- model-routing: NEW — measured basis for plan-strong/execute-cheap (advisor −11.9% cost/+2.7pp); effort guidance; repo-level surface limited to subagent/skill/CI model+effort pins; auto-routers unmeasured.
- languages/cpp: corrected — Deep Lake 15h case study downgraded to single-source (follow-up search could not corroborate); mechanisms unaffected.

## 2026-08-24 — language playbooks

New `kb/languages/` layer (5 parallel research agents, primary sources fetched 2026-08-24), loaded selectively by detected language. `/harness-new` step 2 updated accordingly.

- languages/python: NEW — uv + `uv run` everything; ruff lint+format ("do not call Black"); type checker contested → name one in AGENTS.md (pyright default); proven hook wiring (ruff PostToolUse, typecheck Stop gate, pip-blocking PreToolUse); fixture-magic and venv failure modes.
- languages/typescript: NEW — pnpm default; TS7 Go compiler makes tsc viable per-edit but its missing API pushes per-edit lint to Biome; strict tsconfig canon; turbo --affected/boundaries for monorepos; framework-currency countermeasure (local docs index in AGENTS.md, Vercel eval); vitest run not watch.
- languages/go: NEW — loop-mechanics advantage vs weak benchmark competence; agent-mistake linter set (errcheck/nilerr/etc., untruncated output config); test-cache semantics ("(cached)" = pass); -race in CI not hooks; go generate and go.work rules; gopls MCP.
- languages/rust: NEW — bounded-task strength vs multi-file collapse (benchmark split explained); cargo check + nextest filtersets + `cargo test --doc`; command-level -D warnings never source-level; unwrap/unsafe lint policy; cargo-deny/hack; workspace splitting as context win.
- languages/cpp: NEW — worst benchmark language, best harness ROI (15h-run evidence: pre-wired sanitizers ≈3x wall time); CMake presets + compile_commands.json mandatory; ASan+UBSan floor with -fno-sanitize-recover; clang-tidy agent set; ABI sign-off and target-ownership rules; OSS AI policies (LLVM/Ladybird).

## 2026-08-24 — expansion round

Five new topics from a second research pass (5 parallel agents, primary sources fetched 2026-08-24), plus cross-references into existing topics.

- spec-and-planning: NEW — plan-sized-to-task default (skip below one-sentence-diff threshold; interview→SPEC.md→fresh session above it); heavyweight SDD (Spec Kit/Kiro) only on explicit request; PRD-mode sequencing (spec → conventions → verification harness → implement).
- agent-friendly-code: NEW — types as free verification sensor (TS/Go greenfield default); tests as the primary enabler with commit-failing-tests TDD; locality evidence; brownfield advisory ladder (characterization tests first); per-language benchmark rankings flagged unreliable.
- security: NEW — lethal-trifecta threat model with 2025–26 incident evidence; secrets deny rules + sandbox defaults; component pinning/review policy; CI Rule of Two; anti-slopsquatting rule; harness files reviewed as attack surface.
- team-workflows: NEW — small-PR norms, attribution as a team decision, AI-review noise controls, CI as harness-independent enforcement, committed-settings/plugin distribution, calibrated impact claims (Faros/DORA/METR).
- harness-evals: NEW — error-analysis-first golden suites, with/without ablation (≥3 runs), power/noise limits (small deltas are noise), pruning as first-class, adoption-reality stats backing conservative defaults.
- context-files: added — instruction files are injection attack surface, PR-review them like code.
- automation-surface: added — permissions emission now routed through security.md checklist.

## 2026-08-24 — initial corpus

Full research pass across all five topics (5 parallel agents, primary sources fetched 2026-08-24).

- context-files: established — non-inferable content only, <200-line target, pointers over copies, nested files for monorepos, never ship auto-generated instruction files (ETH arXiv:2602.11988: LLM-generated files −3% success/+20% cost; human-written +4%; AGENTS.md presence −28.6% median runtime per arXiv:2601.20404).
- memory-and-docs: established — plain-file memory is proven (GitHub Copilot A/B +7pt merge rate; Letta files-beat-graph benchmark); four-way split (instructions/memory/skills/docs); prefer native tool memory; no vector-store infra.
- code-navigation: established — grep-first default with size tiers (S/M/L); LSP plugins + committed deny-rules at tier M; semantic index only on measured pain at tier L; repo maps unproven and staleness-prone.
- automation-surface: established — skills for procedures (Agent Skills open standard, cross-tool), hook starter set (format-on-edit, dangerous-command block, stop gate), verification-first (pass/fail check is the top practice), parallelize reads never writes.
- harness-targets: established — AGENTS.md canonical (Codex/Cursor/pi native; Claude Code via symlink or @import); `.agents/skills/` shared dir with `.claude/skills/` symlink shim; hooks non-portable → CI backstop; pi confirmed as badlogic/pi-mono.
