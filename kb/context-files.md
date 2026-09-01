---
topic: context-files
reviewed: 2026-08-28
---

# Context files (AGENTS.md / CLAUDE.md / rules)

Rules for generating the canonical instructions file and its per-tool variants.

## What goes in

Only non-inferable content — things an agent cannot derive by reading the code (https://arxiv.org/abs/2602.11988, 2026-02; https://code.claude.com/docs/en/best-practices, current):

- Build/test/lint commands the agent can't guess, with the exact invocations, each verified runnable before being written down.
- Code style rules that differ from language defaults or what the linter already enforces.
- Repo etiquette: branch naming, PR conventions, commit rules.
- Architectural decisions and non-obvious gotchas specific to this project.
- Required env vars and environment quirks.
- Environment facts stated literally — language and toolchain versions, package managers, entry directories — rather than left for the agent to discover. Precomputing these into the first prompt removed the 2–4 exploratory turns agents spend probing the environment and measured +1.7 pts (Opus 4.6) and +3.9 pts (Haiku 4.5) on TerminalBench-2 (https://arxiv.org/abs/2603.28052, 2026-03-30). Calibration: gains came from only 7 of 89 tasks, with search and eval on the same task set and no error bars, so treat the direction as sound and the magnitude as an upper bound. The cheap, additive form is what to emit; a SessionStart probe hook is the alternative when versions drift.
- WHAT/WHY/HOW frame: tech stack, purpose of components, dev workflow and verification commands (https://www.humanlayer.dev/blog/writing-a-good-claude-md, 2025-11-25).

## What stays out

- Anything derivable from the code: directory listings, file-by-file descriptions, architecture overviews. Repository overviews were specifically tested and found unhelpful for file discovery (https://arxiv.org/abs/2602.11988, 2026-02).
- Style rules a linter/formatter enforces — "never send an LLM to do a linter's job" (HumanLayer, 2025-11-25). Enforce deterministically; see automation-surface.md hooks.
- Standard language conventions, generic API docs (link instead), fast-changing information, tutorials, "write clean code"-grade platitudes (https://code.claude.com/docs/en/best-practices).
- Stray tool mentions: tools named in AGENTS.md get used far more often than unmentioned ones, so every mention is a lever — remove ones you don't mean (https://www.philschmid.de/writing-good-agents, 2026-02-24) [single-source figure; direction is well supported, magnitude unverified].
- Task-specific/hotfix instructions that don't apply to every session (HumanLayer, 2025-11-25).
- Housekeeping and "clean up after yourself" directives: one trace diagnosis attributed a regression to exactly this — "Prompt template changes (cleanup directives) caused the agent to delete necessary state before task completion" (https://arxiv.org/abs/2603.28052, 2026-03-30) [trace-level, n=1]. If cleanup matters, gate it on a check rather than instructing it.

## Size and format

- Target: under 200 lines (Anthropic official, https://code.claude.com/docs/en/memory); practitioner consensus "under 300, shorter is better" (HumanLayer, 2025-11-25). Codex caps discovery at 32 KiB by default via `project_doc_max_bytes` — sources differ on whether that's per file or the combined chain, so keep the TOTAL instruction chain well under 32 KiB (https://learn.chatgpt.com/docs/agent-configuration/agents-md; see harness-targets.md). Generator default: aim for 60–150 lines; never exceed 200 without a per-directory split.
- Per-line test: "would removing this cause mistakes?" If not, cut (https://code.claude.com/docs/en/memory).
- Markdown headings + short imperative bullets; concrete and verifiable ("use 2-space indentation") over vague ("format properly"). No contradictory rules — contradictions get resolved arbitrarily (https://code.claude.com/docs/en/memory).
- At most one "IMPORTANT" emphasis; emphasize everything and nothing stands out (https://code.claude.com/docs/en/best-practices).
- If an agent keeps violating a rule that's written down, the file is too long — prune, don't add emphasis (https://code.claude.com/docs/en/best-practices).
- HTML comments in CLAUDE.md are stripped before injection — usable for maintainer notes (https://code.claude.com/docs/en/memory).

## Structure by repo size

- Small/medium repo: one root AGENTS.md. Nothing else.
- Large repo / monorepo: root file holds pointers and critical gotchas only; per-directory AGENTS.md/CLAUDE.md files carry package-specific commands and rules, loaded on demand (https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start, 2026-05-14). Per-package test/lint commands beat full-suite commands there.
- Sometimes-relevant workflows → skills; part-of-codebase-only rules → path-scoped rules (`.claude/rules/*.md` with `paths:` frontmatter in Claude Code); always-relevant facts → the root file (https://code.claude.com/docs/en/memory).
- Prefer pointers over copies: reference files (`docs/x.md`, file:line) instead of embedding content that will go stale (HumanLayer, 2025-11-25; https://cursor.com/docs/rules).
- Contested: Vercel's eval found a compressed docs index inside AGENTS.md (pointing at local doc files) beat skills for framework knowledge — skills often failed to trigger (100% vs 79%/53%, https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals, 2026-01-27), while Anthropic steers sometimes-relevant content into skills. Default: AGENTS.md carries always-on "horizontal" rules plus a short pointer index to docs; skills only for discrete "vertical" workflows with strong trigger phrases.

## Evidence on value (calibrate effort accordingly)

- Human-written context files: ~+4% task success, +up-to-19% cost; LLM-auto-generated files: ~−3% success, >+20% cost (https://arxiv.org/abs/2602.11988, 2026-02). Separate study: AGENTS.md presence cut median runtime 28.6% and output tokens 16.6% at comparable completion rates (https://arxiv.org/abs/2601.20404, 2026-01). Net: a curated file pays for itself in efficiency and non-inferable knowledge; auto-generated bloat is worse than nothing.
- Consequence for the generator: NEVER ship raw auto-generated output. Every generated line must trace to the repo profile (a verified command, a real convention) or be cut. Instruction-following degrades with instruction count (~150–200 instructions practical ceiling, extrapolated from IFScale, https://arxiv.org/abs/2507.11538, 2025-07) [heuristic].

## Canonical-file convention

- AGENTS.md is the canonical file (Linux Foundation Agentic AI Foundation standard since 2025-12, adopted by 20+ tools incl. Codex, Cursor, Copilot, Gemini CLI, Zed, Aider; https://agents.md/; https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation, 2025-12-09).
- Claude Code does not read AGENTS.md natively: emit `CLAUDE.md` as either a symlink to AGENTS.md or a file containing `@AGENTS.md` plus Claude-specific lines (https://code.claude.com/docs/en/memory). Use the import form on Windows (symlinks need admin). See harness-targets.md for every tool's discovery rules.
- Tool-specific instructions go in tool-scoped sections or the tool's own overlay file, never mixed unlabeled into shared content [preference].
- Instruction files are prompt-injection attack surface — AGENTS.md, skills, and hooks get PR review like code (see security.md).
