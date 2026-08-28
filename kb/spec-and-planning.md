---
topic: spec-and-planning
reviewed: 2026-08-27
---

# Spec and planning workflows

How a generated harness supports PRD→spec→plan→implement work, and what `/harness-new`'s PRD mode should do. The field splits three ways: heavyweight spec-driven development (GitHub Spec Kit, AWS Kiro), lightweight plan-first (Anthropic, HumanLayer ACE-FCA, Every), and no-plan loop-driven (Ronacher). The converged middle position is the default here.

## The default: plan sized to the task

- Skip criterion (Anthropic official): "If you could describe the diff in one sentence, skip the plan" — planning pays when the approach is uncertain, multiple files change, or the code is unfamiliar (https://code.claude.com/docs/en/best-practices, current).
- For larger features: interview → self-contained SPEC.md → execute in a FRESH session with clean context. Spec quality bar: names the files and interfaces involved, states what's out of scope, ends with an end-to-end verification step (https://code.claude.com/docs/en/best-practices, current).
- When a design decision is genuinely novel with several viable shapes (new architecture, new UX surface), generate 2–3 concrete competing candidates and compare them before committing; skip this for routine changes (https://github.com/cursor/plugins/tree/main/pstack, 2026-08).
- For deliberate refactors, sketch what the design would be if the new requirement had existed on day one, then use the gap as a guide — not a mandate to rewrite (https://github.com/cursor/plugins/tree/main/pstack, 2026-08).
- Plan review is the primary human leverage point — "a bad line of a plan could lead to hundreds of bad lines of code"; ~200 lines is the cited practical plan size; compact status back into the plan file after each verified phase (https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/ace-fca.md, 2025; self-reported results).
- Plan-against-diff review: an adversarial reviewer checks the diff against the plan — every requirement implemented, listed edge cases tested, nothing out of scope changed (https://code.claude.com/docs/en/best-practices, current).

## Why not heavyweight SDD by default

- Spec Kit is huge (131k stars, 2026-08-24) but the best hands-on comparison found it generated 4,839 lines of markdown for 989 lines of code, shipped a trivial bug anyway, and lost ~10x to plain iterative prompting on the same feature (n=1; https://blog.scottlogic.com/2025/11/26/putting-spec-kit-through-its-paces-radical-idea-or-reinvented-waterfall.html, 2025-11-26). Kiro's own docs scope specs to unfamiliar/compliance-sensitive work and route well-understood features to lighter modes (https://kiro.dev/docs/specs/best-practices/, current); reviewers report a "spec tax" on small changes.
- Named failure modes: waterfall regression, spec drift from implementation, over-formalization impeding iteration, no way to evaluate spec quality (https://www.thoughtworks.com/en-us/insights/blog/agile-engineering-practices/spec-driven-development-unpacking-2025-new-engineering-practices, 2025-12-04).
- Calibration: most pro-plan numbers are self-reported; the METR RCT found experienced devs 19% SLOWER with early-2025 tools while believing they were 20% faster (https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/, 2025-07-10) — treat productivity claims skeptically, keep the artifacts light.
- Generate a full SDD pipeline only when the team explicitly wants one (compliance-heavy domains, large multi-team greenfield); even then, integrate an existing tool (Spec Kit) rather than reinventing it.

## Task decomposition

- "Agent-sized" task: fits one focused context window and has an objectively checkable completion signal [heuristic; consistent across Spec Kit/Kiro/ACE-FCA].
- Parallelize only tasks independent by construction, isolated in worktrees; parallel agents with decision authority over shared state produce conflicting implicit decisions (https://cognition.com/blog/dont-build-multi-agents, 2025-06-12; see automation-surface.md).
- Contested: markdown plan files vs structured trackers. Plan files are the mainstream carrier (Anthropic, ACE-FCA); Yegge's Beads argues markdown plans rot into unqueryable piles at scale and a git-backed graph tracker should be agent memory (https://steveyegge.spicytakes.org/post/2025-11-12-introducing-beads-a-coding-agent-memory-system, 2025-11-12). Default: plan files; note the tracker option for repos running many concurrent autonomous streams.
- Contested: whether migrations may pass through planned broken intermediate states. Position 1: every commit is green. Position 2: scoped intermediate breakage is acceptable when the sequence is planned and a final verification gate proves the end state. Default: green per unit for team repos; planned breakage is acceptable on solo short-lived branches (https://github.com/cursor/plugins/tree/main/pstack, 2026-08).

## What the generator emits

- An AGENTS.md line stating the plan convention: where plan/spec files live (`docs/plans/` or the repo's existing convention), the skip criterion, and that specs end with a verification step. Nothing more for most repos — the workflow is behavior, not infrastructure [preference].
- Optionally (repos doing regular feature work): one `spec` skill encoding interview→SPEC.md→fresh-session-execute, per automation-surface.md skill rules.
- Never scaffold specs/ hierarchies, constitutions, or per-feature template trees by default.

## PRD mode (greenfield, no code yet)

Sequencing consensus (https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/, 2025-09-02; https://aaronstannard.com/software-2.0-case-study-textforge/, ~2026; https://code.claude.com/docs/en/best-practices, current):

1. Human-reviewed spec from the PRD (interview to fill gaps; mark unknowns explicitly rather than assuming).
2. Conventions before code: AGENTS.md with the chosen stack, architecture decisions, and constraints — the case-study pattern is a substantial instructions file as the first commit. A reference architecture/template to copy patterns from beats inventing structure.
3. Verification harness before features: test runner wired up, CI, a runnable end-to-end check — agents' own tests trend anemic, so the harness defines the bar (TextForge case study, ~2026).
4. Implement task-by-task with per-task verification.

The generated harness marks code-dependent pieces (navigation tiers, hooks that run tests) as activating once code exists, and records planned-stack values in the manifest profile so `/harness-update` re-profiles against reality later.
