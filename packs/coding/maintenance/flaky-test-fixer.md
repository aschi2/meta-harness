---
id: flaky-test-fixer
title: "Flaky-test fixer"
job: "Fix one CI test that alternates between pass and fail without relevant code changes."
defaultCadence: "27 4 * * *"
perRun:
  maxPullRequests: 1
  maxChangedLines: 180
requiredEvidence:
  - "CI run references showing pass and fail at the same revision or equivalent unchanged inputs."
  - "Reproducible seed, order, timing, or environment trigger and before/after repeat results."
neverDo:
  - "Delete, skip, quarantine, or weaken a test that can fail."
  - "Hide flakiness with retries, longer sleeps, or looser timeouts without fixing the cause."
  - "Exceed per-run limits, expand job scope, or merge automatically."
requires: [repo, ci]
review: pull-request
sources:
  - https://the-decoder.com/claude-code-now-runs-daily-maintenance-on-anthropics-software-with-a-46-percent-merge-rate/
  - https://www.linkedin.com/feed/update/urn:li:activity:7493781303109038080/
---

1. Inspect existing CI failures for one test with evidence of nondeterminism. Separate infrastructure outages from test or product defects.
2. Reproduce the trigger using controlled seed, order, clock, or environment. Fix the cause in the owning code, such as shared state, missing synchronization, or missing cleanup.
3. Repeat the failing conditions and existing CI checks. Include the trigger, repetition count, pass/fail counts, and an environment-by-outcome matrix as the truth-table equivalent. Do not claim statistical certainty from a few passing runs.

Stay within this job's scope. Before editing, check local maintenance branches and, when a review system is available, existing equivalent requests to avoid duplicate work. If nothing qualifies, make no change and open no PR. If required evidence or capabilities are missing, report the blocker and open no PR.

Open at most 1 PR per run. Count additions plus deletions across the entire diff against `perRun.maxChangedLines` (180); include tests and documentation. If the complete fix exceeds that limit, report it without a PR. Do not split work to evade either limit.

Never delete a test that can fail or code not proven unreachable. Do not expand this job into adjacent cleanup, features, scheduler changes, or another role's work.

Run project tests and run `/verify` if available. Record exact commands and results; if required checks cannot run or fail, report the blocker and open no PR. Every PR must include a reproducible before/after case, plus a truth table or the explicit equivalent specified above.

Require automated review, then human review. Address findings within the same scope and limits. Never auto-merge, enable auto-merge, or merge the PR yourself.

Cadence and safeguards are repository policy, set 2026-11-03; the five-field cron is a suggested UTC cadence, not a registered schedule. Role inspiration: the maintenance inventory and review workflow; sources above accessed 2026-11-03. Source inspiration does not override this role's evidence or review requirements.
