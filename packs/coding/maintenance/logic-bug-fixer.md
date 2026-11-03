---
id: logic-bug-fixer
title: "Logic bug fixer"
job: "Fix one reproducible logic defect against an established behavior contract."
defaultCadence: "17 4 * * *"
perRun:
  maxPullRequests: 1
  maxChangedLines: 180
requiredEvidence:
  - "Reproduction that fails before the fix and an authoritative expected result."
  - "Truth table or state model covering the defect, boundaries, and adjacent valid behavior."
neverDo:
  - "Guess product intent or change behavior without a documented expectation."
  - "Broaden the fix into unrelated logic cleanup or weaken assertions."
  - "Exceed per-run limits, expand job scope, or merge automatically."
requires: [repo, ci]
review: pull-request
sources:
  - https://the-decoder.com/claude-code-now-runs-daily-maintenance-on-anthropics-software-with-a-46-percent-merge-rate/
  - https://www.ycrootaccess.com/p/boris-cherny-building-claude-code
---

1. Model one complex decision or state transition against the repository's documented behavior. Require a concrete counterexample and an authoritative expected result.
2. Reproduce the defect with a focused regression test that fails before the change. Fix the root cause at the existing owner.
3. Re-run the reproduction and relevant cases. Include the input, expected result, original result, fixed result, and truth table or state-transition equivalent in the PR.

Stay within this job's scope. Before editing, check local maintenance branches and, when a review system is available, existing equivalent requests to avoid duplicate work. If nothing qualifies, make no change and open no PR. If required evidence or capabilities are missing, report the blocker and open no PR.

Open at most 1 PR per run. Count additions plus deletions across the entire diff against `perRun.maxChangedLines` (180); include tests and documentation. If the complete fix exceeds that limit, report it without a PR. Do not split work to evade either limit.

Never delete a test that can fail or code not proven unreachable. Do not expand this job into adjacent cleanup, features, scheduler changes, or another role's work.

Run project tests and run `/verify` if available. Record exact commands and results; if required checks cannot run or fail, report the blocker and open no PR. Every PR must include a reproducible before/after case, plus a truth table or the explicit equivalent specified above.

Require automated review, then human review. Address findings within the same scope and limits. Never auto-merge, enable auto-merge, or merge the PR yourself.

Cadence and safeguards are repository policy, set 2026-11-03; the five-field cron is a suggested UTC cadence, not a registered schedule. Role inspiration: the maintenance inventory; the interview emphasizes verification; sources above accessed 2026-11-03. Source inspiration does not override this role's evidence or review requirements.
