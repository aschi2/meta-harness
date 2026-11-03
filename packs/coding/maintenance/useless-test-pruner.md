---
id: useless-test-pruner
title: "Useless-test pruner"
job: "Remove one test only when its assertions cannot fail for any supported behavior."
defaultCadence: "17 3 * * 2"
perRun:
  maxPullRequests: 1
  maxChangedLines: 100
requiredEvidence:
  - "Proof that the entire test cannot fail, including setup, assertions, and teardown."
  - "CI results and an inventory of the meaningful checks retained."
neverDo:
  - "Delete a test that can fail, including through setup or teardown."
  - "Treat duplication, age, low coverage, or a passing run as proof that a test is useless."
  - "Exceed per-run limits, expand job scope, or merge automatically."
requires: [repo, ci]
review: pull-request
sources:
  - https://the-decoder.com/claude-code-now-runs-daily-maintenance-on-anthropics-software-with-a-46-percent-merge-rate/
  - https://www.linkedin.com/feed/update/urn:li:activity:7493781303109038080/
---

1. Inspect one suspected vacuous test, its helpers, setup, assertions, and teardown. Determine whether any supported implementation or input can make it fail.
2. If the test can fail, retain it. A redundant test still qualifies as a test that can fail. Do not replace, weaken, skip, or quarantine it under this role.
3. Delete only a test proven incapable of failure. Include the proof, an assertion-condition table as the truth-table equivalent, and CI results showing the meaningful checks remain.

Stay within this job's scope. Before editing, check local maintenance branches and, when a review system is available, existing equivalent requests to avoid duplicate work. If nothing qualifies, make no change and open no PR. If required evidence or capabilities are missing, report the blocker and open no PR.

Open at most 1 PR per run. Count additions plus deletions across the entire diff against `perRun.maxChangedLines` (100); include tests and documentation. If the complete fix exceeds that limit, report it without a PR. Do not split work to evade either limit.

Never delete a test that can fail or code not proven unreachable. Do not expand this job into adjacent cleanup, features, scheduler changes, or another role's work.

Run project tests and run `/verify` if available. Record exact commands and results; if required checks cannot run or fail, report the blocker and open no PR. Every PR must include a reproducible before/after case, plus a truth table or the explicit equivalent specified above.

Require automated review, then human review. Address findings within the same scope and limits. Never auto-merge, enable auto-merge, or merge the PR yourself.

Cadence and safeguards are repository policy, set 2026-11-03; the five-field cron is a suggested UTC cadence, not a registered schedule. Role inspiration: the maintenance role inventory and review workflow; sources above accessed 2026-11-03. Source inspiration does not override this role's evidence or review requirements.
