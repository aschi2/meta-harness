---
topic: autonomous-operation
reviewed: 2026-08-24
---

# Autonomous and long-running operation

Scaffolding for unattended runs. OPT-IN: generate this layer only for repos/teams that will actually run agents autonomously — it's overhead for interactive work.

## Repo scaffolding (the canonical recipe)

From Anthropic's long-running-harness post (https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents, 2025-11-26):

- An initializer session writes: a progress log (`claude-progress.txt`-style), a JSON feature list (`{description, steps, passes: false}`) agents may only flip to `passes: true` — with the explicit rule that removing/editing tests or features is unacceptable — and an `init.sh` for fast startup + smoke test.
- Every session starts with standardized orientation: read git log + progress file + feature list, pick the highest-priority incomplete item, work ONE feature, end with commit + progress update, leave the env clean.
- Three test tiers: session-start smoke test; end-to-end tests simulating a real user; explicit feature-completion validation before marking done.

Fresh-context-per-cycle with externalized state beats marathon sessions — every serious source converges on it (Anthropic above; ralph loops' "deterministically allocate the stack the same way every loop", https://ghuntley.com/ralph/, 2025-07-14; ACE-FCA's 40–60% context-utilization target [one team's heuristic]). Reviewability is the second reason: a 200-line plan is reviewable, 2,000 lines of diff aren't.

## Loops

- The productized ladder (Claude Code, current docs): in-prompt check → `/goal` (separate small-model evaluator per turn, stall detection, caps written into the condition) → Stop hook (deterministic, 8-block override) → adversarial review subagent. Prefer these over hand-rolled while-true loops; `/loop` self-paces and hard-expires after 7 days (https://code.claude.com/docs/en/goal; /scheduled-tasks, current).
- Documented loop failure modes to design against (https://blog.vjeux.com/2026/analysis/porting-100k-lines-from-typescript-to-rust-using-claude-code-in-a-month.html, 2026-01-25; https://ghuntley.com/ralph/, 2025-07-14): stub/placeholder implementations instead of faithful ones; hardcoded workarounds instead of refactors; editing the source-of-truth it was told to preserve; indefinitely deferring hard tasks; waking to non-compiling state (fix: checkpoint commits + reset-and-restart). Counter-prompts that worked are blunt ("YOU CANNOT skip a method because it is too hard").
- Loops suit work with a machine-checkable end state that transforms existing code or has a short shelf life (https://lucumr.pocoo.org/2026/6/23/the-coming-loop/, 2026-06-23). The strongest documented long run still "required constant babysitting" (vjeux) — set expectations accordingly; ralph-loop economic claims are single-author and promotional.
- The best outer verifier is task-shaped and deterministic: vjeux's port used committed seed-based differential test results as the progress ledger (2.4M seeds, divergences tracked in-repo).

## Parallelism

- Worktree-per-agent with PR-per-agent merge is the cross-vendor convergent pattern (Claude Code `/batch` and background agents; Copilot one-branch-one-PR; Cursor cloud agents) (https://code.claude.com/docs/en/agents; /worktrees, current).
- Agent teams (experimental) do NOT isolate members in worktrees — partition by file ownership; 3–5 teammates, "three focused beat five scattered"; ~7x token cost vs a single session, so single sessions for routine work (https://code.claude.com/docs/en/agent-teams, current).
- Review funnel: adversarial reviewer scoped to correctness-vs-plan only (open-ended reviewers invent findings; see automation-surface.md).

## Containment (the governing rule)

Permission-bypass runs go ONLY inside a container/VM/sandbox runtime — with no prompts, isolation is the only protection; per-command sandboxes aren't sufficient for unattended runs (MCP/hooks run outside them) (https://code.claude.com/docs/en/sandbox-environments, current). Default-deny egress allowlist; never mount `~/.ssh`/cloud creds — a compromised container exfiltrates whatever it can read (see security.md). Cloud agents (Claude cloud, Codex cloud, Copilot agent) get isolation, secrets-out-of-sandbox, and parallelism for free; the documented pattern is "plan locally, commit the plan, execute remotely" (https://code.claude.com/docs/en/claude-code-on-the-web, current).

## What remains human

Plan approval before autonomous execution; PR review of the output; evidence-not-assertion ("if you can't verify it, don't ship it"). Autonomy-worthiness test to encode in AGENTS.md: a machine-checkable end state exists, the blast radius is contained, and the longer the run, the stronger the independent check (https://code.claude.com/docs/en/best-practices, current).
