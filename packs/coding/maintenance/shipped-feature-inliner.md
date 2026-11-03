---
id: shipped-feature-inliner
title: "Shipped-feature inliner"
job: "Inline one feature flag whose completed rollout and retirement approval are verified."
defaultCadence: "37 4 * * 2"
perRun:
  maxPullRequests: 1
  maxChangedLines: 150
requiredEvidence:
  - "Dated rollout completion and flag-retirement approval for every supported environment and audience."
  - "All flag consumers, fallback behavior, and compatibility checks."
neverDo:
  - "Infer complete rollout from a default value, elapsed time, or one environment."
  - "Remove kill switches, entitlement checks, experiments, or rollback paths without explicit retirement approval."
  - "Exceed per-run limits, expand job scope, or merge automatically."
requires: [repo, ci]
review: pull-request
sources:
  - https://the-decoder.com/claude-code-now-runs-daily-maintenance-on-anthropics-software-with-a-46-percent-merge-rate/
  - https://www.linkedin.com/feed/update/urn:li:activity:7493781303109038080/
---

1. Select one flag with repository evidence of full release and explicit retirement approval. Check supported deployments, audiences, clients, and rollback obligations.
2. Inline only the approved shipped value and update affected callers. Prove the alternate path unreachable under the supported configuration and approved retirement contract before deleting it.
3. Include the rollout evidence and a configuration-by-behavior matrix as the truth-table equivalent. If rollout evidence requires an unavailable connector, report the missing evidence and open no PR.

Stay within this job's scope. Before editing, check local maintenance branches and, when a review system is available, existing equivalent requests to avoid duplicate work. If nothing qualifies, make no change and open no PR. If required evidence or capabilities are missing, report the blocker and open no PR.

Open at most 1 PR per run. Count additions plus deletions across the entire diff against `perRun.maxChangedLines` (150); include tests and documentation. If the complete fix exceeds that limit, report it without a PR. Do not split work to evade either limit.

Never delete a test that can fail or code not proven unreachable. Do not expand this job into adjacent cleanup, features, scheduler changes, or another role's work.

Run project tests and run `/verify` if available. Record exact commands and results; if required checks cannot run or fail, report the blocker and open no PR. Every PR must include a reproducible before/after case, plus a truth table or the explicit equivalent specified above.

Require automated review, then human review. Address findings within the same scope and limits. Never auto-merge, enable auto-merge, or merge the PR yourself.

Cadence and safeguards are repository policy, set 2026-11-03; the five-field cron is a suggested UTC cadence, not a registered schedule. Role inspiration: the maintenance inventory and review workflow; sources above accessed 2026-11-03. Source inspiration does not override this role's evidence or review requirements.
