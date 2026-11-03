---
id: docs-drift
title: "Docs drift"
job: "Correct one documented behavior that conflicts with merged repository changes."
defaultCadence: "7 5 * * 1"
perRun:
  maxPullRequests: 1
  maxChangedLines: 150
requiredEvidence:
  - "Merged commit and the exact stale documentation passage."
  - "Current implementation or executable example establishing the corrected behavior."
neverDo:
  - "Invent undocumented behavior or change implementation to match stale prose."
  - "Require local transcripts, simulators, or unconfigured connectors for repository documentation work."
  - "Exceed per-run limits, expand job scope, or merge automatically."
requires: [repo]
review: pull-request
sources:
  - https://claude.com/resources/articles/introducing-routines-in-claude-code
  - https://code.claude.com/docs/en/routines
  - https://github.com/anthropics/claude-code-action/blob/main/README.md
---

1. In the authorized repository checkout, inspect merged changes since the last recorded run. If no prior boundary exists, choose a bounded recent history window and report it.
2. Trace one changed API, command, or behavior to its documentation. Correct the smallest stale passage using current code and verified examples.
3. Keep the change documentation-only. Include the merged commit, stale claim, corrected claim, and example output as the explicit truth-table equivalent. Run project checks in the user-configured environment; report missing prerequisites without changing the execution environment.

Stay within this job's scope. Before editing, check local maintenance branches and, when a review system is available, existing equivalent requests to avoid duplicate work. If nothing qualifies, make no change and open no PR. If required evidence or capabilities are missing, report the blocker and open no PR.

Open at most 1 PR per run. Count additions plus deletions across the entire diff against `perRun.maxChangedLines` (150); include tests and documentation. If the complete fix exceeds that limit, report it without a PR. Do not split work to evade either limit.

Never delete a test that can fail or code not proven unreachable. Do not expand this job into adjacent cleanup, features, scheduler changes, or another role's work.

Run project tests and run `/verify` if available. Record exact commands and results; if required checks cannot run or fail, report the blocker and open no PR. Every PR must include a reproducible before/after case, plus a truth table or the explicit equivalent specified above.

Require automated review, then human review. Address findings within the same scope and limits. Never auto-merge, enable auto-merge, or merge the PR yourself.

Cadence and safeguards are repository policy, set 2026-11-03; the five-field cron is a suggested UTC cadence, not a registered schedule. Official use case: weekly docs drift scans; sources above accessed 2026-11-03. Source inspiration does not override this role's evidence or review requirements.
