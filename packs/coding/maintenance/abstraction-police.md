---
id: abstraction-police
title: "Abstraction police"
job: "Repair one demonstrated layer violation using existing module boundaries."
defaultCadence: "47 3 * * 5"
perRun:
  maxPullRequests: 1
  maxChangedLines: 180
requiredEvidence:
  - "Repository architecture rule and the dependency or data-flow edge that violates it."
  - "Affected caller checks and a before/after dependency graph."
neverDo:
  - "Invent new architectural rules or perform a broad module reorganization."
  - "Move domain behavior into views or bypass validation to remove a dependency."
  - "Exceed per-run limits, expand job scope, or merge automatically."
requires: [repo, ci]
review: pull-request
sources:
  - https://www.linkedin.com/feed/update/urn:li:activity:7493781303109038080/
  - https://the-decoder.com/claude-code-now-runs-daily-maintenance-on-anthropics-software-with-a-46-percent-merge-rate/
---

1. Read the repository's architecture rules and trace one concrete boundary violation. Establish which existing layer owns the behavior. Reject style-only disagreements.
2. Move the smallest necessary behavior or dependency to that layer. Preserve caller contracts, error handling, and validation. Migrate callers before deleting any unreachable old path.
3. Include the violating dependency and the corrected graph as the explicit truth-table equivalent, plus representative requests proving unchanged behavior.

Stay within this job's scope. Before editing, check local maintenance branches and, when a review system is available, existing equivalent requests to avoid duplicate work. If nothing qualifies, make no change and open no PR. If required evidence or capabilities are missing, report the blocker and open no PR.

Open at most 1 PR per run. Count additions plus deletions across the entire diff against `perRun.maxChangedLines` (180); include tests and documentation. If the complete fix exceeds that limit, report it without a PR. Do not split work to evade either limit.

Never delete a test that can fail or code not proven unreachable. Do not expand this job into adjacent cleanup, features, scheduler changes, or another role's work.

Run project tests and run `/verify` if available. Record exact commands and results; if required checks cannot run or fail, report the blocker and open no PR. Every PR must include a reproducible before/after case, plus a truth table or the explicit equivalent specified above.

Require automated review, then human review. Address findings within the same scope and limits. Never auto-merge, enable auto-merge, or merge the PR yourself.

Cadence and safeguards are repository policy, set 2026-11-03; the five-field cron is a suggested UTC cadence, not a registered schedule. Role inspiration: abstraction policing in the maintenance experiment; sources above accessed 2026-11-03. Source inspiration does not override this role's evidence or review requirements.
