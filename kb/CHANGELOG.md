# KB changelog

Newest first — new entries go at the top, with a unique heading (date + short slug). `/harness-update` scopes upgrades to the entries above a manifest's recorded `kbEntry`.

## 2026-09-01 — UX laws audited; accessibility rules adopted, folklore excluded

Prompted by a "20 UX laws for Claude" social post. Audited all 30 Laws of UX against their cited primary sources and searched for evidence about agent-generated UI quality. Verdict: adopt the checkable accessibility form, exclude the law-name form, and flag the folklore.

- archetypes/web-app: NEW section — the measured agent UI defects are accessibility ones (small touch targets, poor contrast, missing semantic structure), and accessibility prompts measurably reduce them (W4A 2025; A11YN 2025-10). Encode WCAG-shaped checkable rules gated by axe-core, not design maxims; no evidence exists that naming a law to an agent helps. Explicit do-not-encode list for contested laws: Miller's 7±2 (capacity is ~3–5 chunks, never about menus), the Doherty 400 ms (not in the paper), choice overload (meta-analytic mean effect ≈ zero), Zeigarnik (failed 2025 meta-analysis). Vendor UI-guideline packs noted as un-evaluated.
- archetypes/mobile: touch-target minimums as the one layout rule worth a line (44 pt / 48 dp), with the same evidence.
- Of the 30 laws: 8 established and layout-relevant, 8 supported, 7 heuristics, 4 constructs, 5 misattributed/contested. Only the Gestalt cluster, Fitts, and Von Restorff are both well-backed and code-embodied, and each reduces to a checkable rule.

## 2026-08-28 — the generator asks where repo-external config goes

Writing outside the repo touches config shared with the user's other work, and the reasonable answer differs per person. The generator no longer picks silently.

- skills/harness-new: presents three placements with a recommendation and each one's cost — user-level config (recommended when the values are machine-wide, e.g. a toolchain cache), a named profile (Codex profiles are their own `~/.codex/<name>.config.toml` selected with `-p`; `[profiles.X]` tables are rejected as legacy since 0.147, and a forgotten flag fails identically to no config), or a gitignored in-repo file (only when no user-level layer exists, or the user wants nothing touched outside the repo). Shows the exact lines first, writes only what is chosen, records it in `machineSetup.where`.
- automation-surface: placement is the user's call, with the trade-offs stated.

## 2026-08-28 — machine-specific config goes repo-external

Supersedes the `machineLocal` approach shipped hours earlier in 0.7.0, which gitignored the machine-specific file inside the repo. That was wrong for the reason a repo is shared: it lives on many machines at once, so a per-machine value inside it is right for one of them, gitignoring only hides that, and the file dies to `git clean -xdf` or a fresh clone. No field manifests used `machineLocal`; `/harness-update` still recognises it and offers to move it out.

- Verified 2026-08-28 (codex-cli 0.147.0) that Codex merges user and project config at KEY level: `writable_roots` in `~/.codex/config.toml` plus `network_access` in a repo's `.codex/config.toml` both apply, the project table not clobbering the user's array. That is what makes the split possible, and it corrects the prior entry's conclusion that the two could not be separated.
- Manifest key `machineLocal` → `machineSetup`, recording what was granted, the repo-external location it went to, and the command that re-derives it. Nothing under it is hashed or baselined — it is not in the repo.
- skills/harness-update step 3b re-applies machine setup on the current machine instead of regenerating an in-repo file, asks before touching user-level config, and reads legacy `machineLocal` entries as the same intent.
- automation-surface: the portability rule now says repo-external first, with a gitignored in-repo file only as a documented fallback for tools that have no user-level layer.

## 2026-08-28 — discovered paths and machine-local config

**Changes generator output and extends the manifest schema.** Generated harnesses previously inherited whatever absolute paths the generating machine had, so a harness that worked on macOS silently half-failed on a Linux VM.

- skills/harness-new: profiling now DISCOVERS toolchain paths on the current machine with a recorded command (`flutter --version --machine`, `go env GOROOT`, `npm config get cache`, `which`), and a path not derived on this machine may not go into generated config. Candidate lists and copied paths are out.
- skills/harness-new: manifest gains `machineLocal` (additive) — files whose correctness depends on machine-absolute paths are gitignored, excluded from `files` and `baseline/`, and recorded with the command that re-derives them.
- skills/harness-update: NEW step 3b regenerates machine-local files by re-running discovery instead of three-way merging them; a missing one on a fresh clone is generated, not treated as a deletion.
- automation-surface: portability section gained the discover-don't-inherit rule, the machine-local split (portable policy committed, absolute values local), and the Codex specifics that force it — no local-override file, `[projects."<path>"]` carries only `trust_level`, no env-var expansion (https://learn.chatgpt.com/docs/config-file/config-reference, 2026-08-28).

## 2026-08-28 — path portability + Meta-Harness paper

- automation-surface: NEW section on path portability in emitted config. Generated config gets copied to other machines and a machine-absolute path silently disables whatever references it. Verified 2026-08-28: Claude Code hook `command` strings expand `"$HOME"` (shell), Claude Code marketplace `source.path` expands `~`, and Codex `writable_roots` expands `~` but NOT environment variables (`$HOME/...` is treated literally and denied). Non-existent `writable_roots` are ignored, so one list can cover macOS and Linux.
- context-files: state environment facts (toolchain versions, package managers, entry dirs) literally instead of leaving them to be discovered — measured +1.7 / +3.9 pts on TerminalBench-2, with the magnitude flagged as an upper bound (search and eval on the same tasks, gains on 7 of 89, no error bars). Added a caution against housekeeping/"clean up after yourself" directives.
- harness-evals: NEW section — feed raw traces rather than summaries when iterating on a harness (summaries bought nothing over scores alone; full traces scored far higher), and change one thing at a time.
- automation-surface: stop-gate livelock failure mode — a completion gate that re-presents a checklist after the completion signal can loop forever.
- All from https://arxiv.org/abs/2603.28052 (2026-03-30), an unrefereed preprint about automated harness *search*; only its coding-agent findings were adopted, each marked with its evidence strength.

## 2026-08-30 — JIT harness assessed; SkillsBench evidence on curated vs agent-authored skills

Assessed JIT-Agent on request; the search that surfaced it also turned up SkillsBench. No generator behavior changes. Note the scope of what gained evidence: SkillsBench backs *curation and focus* of skills, not the "generate few skills" count rule, which stays a heuristic — it tests neither how many distinct skills a repo should carry nor repository-scale triggering.

- automation-surface: SkillsBench (https://arxiv.org/abs/2602.12670, 2026-06-14) added to the Skills section — curated skills +16.6pp macro (positive in all 18 configurations), agent-authored skills *below* the no-skill baseline on all three configurations tested (−8.1 to −11.5pp), and a ~2M-skill ecosystem quality mean of 6.2/12 versus 10.1/12 curated. Unlike the skill-evolution papers cited above it includes a software-engineering domain (16 of 87 tasks), so it transfers further than they do.
- automation-surface: NEW scope note naming this KB's output as ahead-of-time harness construction, recording JIT-Agent's runtime-synthesis alternative and its fair critique of AOT, plus the reasons not to act on its numbers — no software-engineering benchmark, no ablation of any module or training stage, no seeds or variance on the main tables, no separate accounting for harness-synthesis cost (https://arxiv.org/abs/2608.25593, 2026-08-26). The paper's own future work favors a stable core with selectively dynamic components. An unrelated prior work in its Table 1 is confusingly named "Meta-Harness".

## 2026-08-29 — Codex skill discovery is per-repo

- harness-targets: recorded that Codex scans `.agents/skills` from the cwd up to the repo root, plus `$HOME/.agents/skills` for user scope (https://learn.chatgpt.com/docs/build-skills, 2026-08-29), confirmed on codex-cli 0.150.1 by a probe skill that was enumerated inside the repo holding it and absent outside. No generator behavior changes: `.agents/skills/` was already the emitted cross-tool location, and the note only removes the assumption that Codex needs a machine-wide install to see it.

## 2026-08-29 — WikiSkill: traces vs consolidated knowledge vs skills

Adopted the trace/knowledge/instruction separation from WikiSkill (https://arxiv.org/abs/2608.27454, 2026-08-27) as a new generated artifact. **This changes generator output**: repos doing sustained agent work now get a notes layer. The paper's automatic validation-gated loop is NOT adopted — its benchmarks are math/search/spreadsheet/document-QA/ALFWorld with no repository work, its wiki ablation removes the maintainer agent along with the artifact so it isolates neither, and repos lack the scored validation split the gate needs.

- memory-and-docs: NEW section "Consolidated experience (the notes layer)" — a single `docs/agent-notes.md`, **opt-in only** (asked for, or already present to adopt; never inferred from repo size or activity), read on condition rather than every session, append-mostly with superseded entries marked rather than deleted, and promotion into AGENTS.md/skills proposed for a human to accept, recording the motivating entry. Emitted only together with its consolidation procedure — without that pass it is the multi-file memory bank this KB bans under one filename, so the ban is narrowed rather than dropped.
- automation-surface: `consolidate-notes` ships with the notes layer and is not optional there (merge duplicates, re-verify cited code, mark superseded, propose promotions); explicit do-not-generate for the automatic validation-gated loop, with an independent counterweight on gate noise (https://arxiv.org/abs/2608.02636, 2026-07-31). Also added that portable skill format is not portable performance — cross-model transfer helps but in one case dropped a strong model from 50.5% to 18.1%.
- templates: NEW `agent-notes.md.template`; AGENTS.md template's definition-of-done now names the notes file instead of a vague "memory or docs/".
- skills/harness-new: step 3 emits the notes layer where conditions are met.

## 2026-08-27 — pstack conditional rules

Adopted conditional rules from pstack.

- team-workflows: independently verifiable commit sequencing for migrations and other large multi-commit reviews.
- spec-and-planning: competing-candidate comparison for novel design decisions, first-principles refactor checks, and contested guidance on planned broken migration intermediates.
- archetypes/web-app, archetypes/mobile: user-facing quality takes priority over implementation convenience.
- archetypes/services-infra: internal API reshapes migrate all callers and remove legacy APIs in the same effort.
- languages/typescript: type-system discipline for illegal states, branded primitives, exhaustiveness, schema-derived types, and removing casts.

## 2026-08-24 — graph-engineering terminology note

- autonomous-operation: added a terminology-watch note on "graph engineering" (July 2026 X-coined name for multi-agent orchestration graphs; LangGraph/ADK-class frameworks). Assessed on request: no independent evidence, no repo-harness surface; the evidence-backed subset (parallel reads, single-writer, harness-native orchestration) was already covered. No generator behavior changes.

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
