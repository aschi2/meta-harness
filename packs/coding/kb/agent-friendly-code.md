---
topic: agent-friendly-code
reviewed: 2026-09-02
---

# Agent-friendly codebase design

How code/stack properties affect agent performance. The generator doesn't restructure codebases; this topic drives (a) PRD-mode stack and scaffold choices, (b) which AGENTS.md lines matter most, and (c) an ADVISORY section in the generation report naming the highest-leverage repo changes. Meta-finding worth keeping in mind: agent-era practices are largely just good engineering made machine-checkable — tests, types, docs, CI (https://simonwillison.net/2025/Oct/7/vibe-engineering/, 2025-10-07).

## Types and language choice

- Static types are a free deterministic verification sensor for the agent loop; type-constrained generation cut LLM compilation errors by more than half (https://arxiv.org/abs/2504.09246, 2025-04; https://martinfowler.com/articles/harness-engineering.html, 2026-04-02). TypeScript became GitHub's most-used language partly on this dynamic (https://github.blog/ai-and-ml/llms/why-ai-is-pushing-developers-toward-typed-languages/, 2026-01-08).
- Greenfield consensus picks: TypeScript (training-data volume + types) or Go (simplicity, structural interfaces, stable ecosystem, fast builds) (https://lucumr.pocoo.org/2025/6/12/agentic-coding/, 2025-06-12; https://newsletter.pragmaticengineer.com/p/python-go-rust-typescript-and-ai, ~2025-10). Python is fine with strict typing enforced (ruff + a strict type checker).
- Do NOT cite per-language benchmark rankings as facts — Multi-SWE-bench and SWE-bench Multilingual produce OPPOSITE language orderings with the same model (https://arxiv.org/abs/2504.02605, 2025-04 vs https://www.swebench.com/multilingual.html, 2025); rankings are curation artifacts.
- PRD mode: prefer stable, boring, well-documented frameworks over high-churn ones — ecosystem churn produces outdated generations [heuristic, multiple practitioner sources].

## Tests as the primary enabler

- A runnable check is the single biggest difference-maker: "tests, a build, a screenshot to compare — the difference between a session you watch and one you walk away from" (https://code.claude.com/docs/en/best-practices, current). "Automated tests are no longer optional when working with coding agents" (https://simonw.substack.com/p/agentic-engineering-patterns, 2026-02-27).
- TDD pattern that prevents test-gaming: write tests, confirm they fail, then implement without touching them (https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/, 2026-02-23). Committing the failing tests before implementation, as an extra gaming safeguard, is [heuristic] — not stated in that source.
- Verification scales with autonomy: prompt-level check → `/goal` condition → deterministic Stop hook → adversarial-review subagent (detail in automation-surface.md). Steered: the first rung is enough, a human backstops a missed check. Autonomous: needs the deterministic rungs — "the longer Claude works unattended, the more an independent check matters before you count the work as done" (https://code.claude.com/docs/en/best-practices, fetched 2026-09-02).
- Greenfield minimum: typecheck + linter + fast unit runner + one end-to-end smoke check, wired up before feature work (see spec-and-planning.md PRD sequencing).
- AGENTS.md must include the single-test command — "prefer running single tests, not the whole suite" is official example guidance (https://code.claude.com/docs/en/best-practices, current). A committed AGENTS.md measurably helps: 28.6% lower median wall-clock runtime, 16.6% lower output tokens, comparable completion, across 124 PRs/10 repos (see context-files.md; https://arxiv.org/abs/2601.20404, v2 2026-03-30).

## Locality and structure

- Agent success drops sharply as changes span more files and larger diffs (https://arxiv.org/abs/2504.08703, 2025-04; https://arxiv.org/abs/2504.02605, 2025-04). Structures that let a change land in one module (vertical slices, colocation) sit on the favored side of that curve [inference from benchmarks; not directly tested].
- Enforce architecture mechanically, not in prose: the largest agent-first build (OpenAI's ~1M-LOC Codex-generated app) enforced layer boundaries with custom linters and structural tests, kept AGENTS.md a ~100-line table of contents atop a layered docs/ tree, ran a periodic doc-gardening agent to catch doc staleness, and ran continuous automated debt cleanup (https://openai.com/index/harness-engineering/, 2026-02-11; first-party, unaudited, direct fetch blocked 2026-09-02 — corroborated via https://www.infoq.com/news/2026/02/openai-harness-engineering-codex/, 2026-02, secondary). "Smaller services for agents" is contradicted by this — it was a layered monolith in one repo. This is autonomous-mode evidence specifically: every PR in that org is agent-opened, agent-reviewed, and often agent-merged, so the mechanical-enforcement/layered-monolith conclusion isn't shown to hold for steered work.
- Boring, explicit, locally-readable code beats clever indirection and metaprogramming; descriptive names; keep security checks visible at the use site, not hidden in config (https://lucumr.pocoo.org/2025/6/12/agentic-coding/, 2025-06-12) [practitioner consensus, no controlled data].
- Monorepo-for-agents claims come mostly from vendors and self-reported case studies — treat as unproven; don't recommend repo-topology changes.

## Fast feedback surfaces

- Loop economics: checks run after every edit, so speed compounds. Fast task-scoped validators beat full builds (a measured case replaced 30–60s builds with focused scripts; https://www.aaron-gustafson.com/notebook/optimizing-your-codebase-for-ai-coding-agents/, 2025-10-21). Success silent, failures verbose.
- Practical levers worth an AGENTS.md line or advisory mention when the repo lacks them: per-edit format/lint hooks (automation-surface.md), LSP plugin for typed languages, logs written to a file the agent can read, dev server guarded against duplicate spawns, debug mode that surfaces flow artifacts (auth links, emails) so agents can complete flows unaided (https://lucumr.pocoo.org/2025/6/12/agentic-coding/, 2025-06-12).
- Don't over-compress agent-facing logs, SINGLE-SOURCE: aggressive semantic compression of log formats cut input tokens 17% but raised total session cost 67%, because the model had to do more interpretive reasoning to recover meaning (https://arxiv.org/abs/2604.07502, 2026) — one preprint, unreplicated; keep logs human-readable until replicated.

## Brownfield advisory (for the generation report)

Ordered by reported leverage (https://thegeneralpartnership.substack.com/p/a-practical-guide-to-brownfield-ai, 2026-02-04; https://www.isaqb.org/blog/ai-agents-dont-modernize-legacy-code-on-their-own/, 2026-05-18):

1. Characterization/golden-master tests around the code agents will touch — the safety net comes before the agents (one practitioner: lint + typecheck + 120 E2E tests first, then a week-estimated migration finished in a day).
2. Capture "invisible context" in docs, plus a convention for agents to propose doc updates when they hit obstacles.
3. Incremental reversible phases, never wholesale rewrite; state an explicit compromise hierarchy (security/data integrity non-negotiable, temporary debt acceptable).
4. Adding types to untyped code is plausible but unmeasured as an intervention — recommend it only alongside 1–2.
