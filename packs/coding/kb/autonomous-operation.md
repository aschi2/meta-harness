---
topic: autonomous-operation
reviewed: 2026-09-02
---

# Autonomous and long-running operation

Scaffolding for unattended runs. OPT-IN: generate this layer only for repos/teams that will actually run agents autonomously — it's overhead for interactive work.

## Repo scaffolding (the canonical recipe)

From Anthropic's long-running-harness post (https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents, 2025-11-26):

- An initializer session writes: a progress log (`claude-progress.txt`-style), a JSON feature list (`{description, steps, passes: false}`) agents may only flip to `passes: true` — with the explicit rule that removing/editing tests or features is unacceptable — and an `init.sh` for fast startup + smoke test.
- Every session starts with standardized orientation: read git log + progress file + feature list, pick the highest-priority incomplete item, work ONE feature, end with commit + progress update, leave the env clean.
- Three test tiers: session-start smoke test; end-to-end tests simulating a real user; explicit feature-completion validation before marking done.

Fresh-context-per-cycle with externalized state beats marathon sessions — widely converged on, but not a timeless law: Anthropic's newer harness-design post ties the original reset requirement to Sonnet 4.5's "context anxiety" and reports Opus 4.6 sustaining longer coherent sessions without resets, so the practice is partly model-capability-dependent (Anthropic above; ralph loops' "deterministically allocate the stack the same way every loop", https://ghuntley.com/ralph/, 2025-07-14; ACE-FCA's 40–60% context-utilization target [one team's heuristic]; weakened by https://www.anthropic.com/engineering/harness-design-long-running-apps, 2026-03-24). Reviewability is the second, independent reason and holds regardless of model: a 200-line plan is reviewable, 2,000 lines of diff aren't.

That same 2026-03-24 post describes a newer canonical recipe for multi-hour autonomous full-stack app generation: a three-agent planner/generator/evaluator harness where generator and evaluator negotiate a "sprint contract" of testable done-criteria before coding, and the evaluator drives the running app via Playwright like a real user to file specific bug reports — a second reference recipe alongside the 2025-11-26 one above, for that project shape specifically.

## Loops

- The productized ladder (Claude Code, current docs): in-prompt check → `/goal` (separate small-model evaluator per turn, stall detection, caps written into the condition) → Stop hook (deterministic, 8-block override) → adversarial review subagent. Prefer these over hand-rolled while-true loops; `/loop` self-paces and hard-expires after 7 days (https://code.claude.com/docs/en/goal; /scheduled-tasks, current). `/goal` now runs fully non-interactively (`claude -p "/goal <condition>"`) but does not itself change permission mode — unattended tool calls during the loop still need `dontAsk`/pre-approved permissions or a sandboxed bypass (https://code.claude.com/docs/en/goal, current).
- Ralph loop is now an Anthropic-published, Verified Claude Code plugin, not just a hand-rolled technique: `/ralph-loop "<prompt>" --max-iterations N --completion-promise "DONE"`, intercepts session exit via a Stop hook, ~196k installs (https://claude.com/plugins/ralph-loop; https://github.com/anthropics/claude-plugins-official/tree/main/plugins/ralph-loop, checked 2026-09-02) — productized alongside `/goal`/Stop hooks above; the ghuntley technique below remains the primary source for the failure modes.
- Documented loop failure modes to design against (https://blog.vjeux.com/2026/analysis/porting-100k-lines-from-typescript-to-rust-using-claude-code-in-a-month.html, 2026-01-25; https://ghuntley.com/ralph/, 2025-07-14): stub/placeholder implementations instead of faithful ones; hardcoded workarounds instead of refactors; editing the source-of-truth it was told to preserve; indefinitely deferring hard tasks; waking to non-compiling state (fix: checkpoint commits + reset-and-restart). Counter-prompts that worked are blunt ("YOU CANNOT skip a method because it is too hard").
- Loops suit work with a machine-checkable end state that transforms existing code or has a short shelf life (https://lucumr.pocoo.org/2026/6/23/the-coming-loop/, 2026-06-23). The strongest documented long run still "required constant babysitting" (vjeux) — set expectations accordingly; ralph-loop economic claims are single-author and promotional.
- The best outer verifier is task-shaped and deterministic: vjeux's port used committed seed-based differential test results as the progress ledger (2.4M seeds, divergences tracked in-repo).

## Parallelism

- Worktree-per-agent with PR-per-agent merge is the cross-vendor convergent pattern (Claude Code `/batch` and background agents; Copilot one-branch-one-PR; Cursor cloud agents) (https://code.claude.com/docs/en/agents; /worktrees, current).
- Agent teams (experimental) do NOT isolate members in worktrees — partition by file ownership; 3–5 teammates, "three focused beat five scattered"; ~7x token cost when teammates run in plan mode specifically, so single sessions for routine work (https://code.claude.com/docs/en/agent-teams; /costs#agent-team-token-costs, current). Steered-only: teammates require an interactive session — in `-p`/Agent SDK sessions Claude does not spawn teammates, and a named teammate runs as an ordinary subagent instead (same doc).
- Review funnel: adversarial reviewer scoped to correctness-vs-plan only (open-ended reviewers invent findings; see automation-surface.md).
- Terminology watch: "graph engineering" (coined on X ~2026-07) names multi-agent orchestration graphs — nodes work, edges route, shared state flows — via frameworks like LangGraph/Google ADK/Microsoft Agent Framework. Its own flagship guide concedes the mechanics predate the name, cites no benchmarks, and says most tasks never need it (https://www.aibuilderclub.com/blog/graph-engineering-guide-2026, 2026-07-20, commercial secondary source). For dev harnesses, the evidence-backed subset is already here: parallelize read-only work, single-thread writes, harness-native orchestration (subagents/teams/workflows) over app frameworks. Revisit if independent evidence appears.

## Containment (the governing rule)

`--dangerously-skip-permissions` runs go ONLY inside a container/VM/sandbox runtime, no exception stated — with no prompts, isolation is the only protection; per-command sandboxes aren't sufficient for unattended runs (MCP/hooks run outside them) (https://code.claude.com/docs/en/sandbox-environments, current). Auto mode's per-action classifier is "a per-action control, not an isolation boundary" (same doc) — for unattended auto-mode runs, isolation remains recommended defense-in-depth but is "not required the way it is for" skip-permissions; see security.md for the 2026-08-27 incident where auto mode's own classifier blocked the kill command for a process it had let run. Default-deny egress allowlist; never mount `~/.ssh`/cloud creds — a compromised container exfiltrates whatever it can read (see security.md). Cloud agents (Claude cloud, Codex cloud, Copilot agent) get isolation, secrets-out-of-sandbox, and parallelism for free; the documented pattern is "plan locally, commit the plan, execute remotely" (https://code.claude.com/docs/en/claude-code-on-the-web, current).

## What remains human

Plan approval before autonomous execution; PR review of the output; evidence-not-assertion ("if you can't verify it, don't ship it"). Autonomy-worthiness test to encode in AGENTS.md: a machine-checkable end state exists, the blast radius is contained, and the longer the run, the stronger the independent check (https://code.claude.com/docs/en/best-practices, current).
