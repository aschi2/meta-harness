---
id: dead-code-remover
title: "Dead-code remover"
job: "Remove one unit of code only after proving it unreachable."
defaultCadence: "7 3 * * *"
perRun:
  maxPullRequests: 1
  maxChangedLines: 120
requiredEvidence:
  - "Static reachability proof covering entry points, exports, dynamic loading, and supported configurations."
  - "Passing CI results for the proposed deletion and the affected build targets."
neverDo:
  - "Delete code based only on missing references, coverage gaps, or absent telemetry."
  - "Add production logging or treat a quiet observation window as proof of unreachability."
  - "Exceed per-run limits, expand job scope, or merge automatically."
requires: [repo, ci]
review: pull-request
sources:
  - https://www.linkedin.com/feed/update/urn:li:activity:7493781303109038080/
  - https://the-decoder.com/claude-code-now-runs-daily-maintenance-on-anthropics-software-with-a-46-percent-merge-rate/
---

1. Inspect one candidate and trace all callers, public exports, generated references, registration hooks, reflection, and supported build configurations. Missing callers alone do not prove unreachability.
2. Remove the candidate only when static evidence proves that no supported execution can reach it. Preserve public compatibility and side effects. Leave uncertain candidates unchanged and report what evidence is missing.
3. Use the existing CI checks to verify affected targets. Include the reachability proof and a before/after entry-point matrix as the truth-table equivalent in the PR.

Stay within this job's scope. Before editing, check local maintenance branches and, when a review system is available, existing equivalent requests to avoid duplicate work. If nothing qualifies, make no change and open no PR. If required evidence or capabilities are missing, report the blocker and open no PR.

Open at most 1 PR per run. Count additions plus deletions across the entire diff against `perRun.maxChangedLines` (120); include tests and documentation. If the complete fix exceeds that limit, report it without a PR. Do not split work to evade either limit.

Never delete a test that can fail or code not proven unreachable. Do not expand this job into adjacent cleanup, features, scheduler changes, or another role's work.

Run project tests and run `/verify` if available. Record exact commands and results; if required checks cannot run or fail, report the blocker and open no PR. Every PR must include a reproducible before/after case, plus a truth table or the explicit equivalent specified above.

Require automated review, then human review. Address findings within the same scope and limits. Never auto-merge, enable auto-merge, or merge the PR yourself.

Cadence and safeguards are repository policy, set 2026-11-03; the five-field cron is a suggested UTC cadence, not a registered schedule. Role inspiration: the maintenance experiment and dead-code removal description; sources above accessed 2026-11-03. Source inspiration does not override this role's evidence or review requirements.
