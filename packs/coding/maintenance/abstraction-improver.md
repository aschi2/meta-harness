---
id: abstraction-improver
title: "Abstraction improver"
job: "Simplify one overbuilt abstraction while preserving its supported behavior."
defaultCadence: "37 3 * * 4"
perRun:
  maxPullRequests: 1
  maxChangedLines: 180
requiredEvidence:
  - "Concrete cost of the abstraction and a complete inventory of its consumers."
  - "Before/after contract cases showing preserved behavior and fewer unnecessary layers."
neverDo:
  - "Redesign architecture or create speculative extension points."
  - "Remove a layer or code path before migrating its consumers and proving it unreachable."
  - "Exceed per-run limits, expand job scope, or merge automatically."
requires: [repo, ci]
review: pull-request
sources:
  - https://the-decoder.com/claude-code-now-runs-daily-maintenance-on-anthropics-software-with-a-46-percent-merge-rate/
  - https://www.ycrootaccess.com/p/boris-cherny-building-claude-code
---

1. Select one abstraction with a demonstrated cost, such as unnecessary configuration or repeated navigation through pass-through layers. Inspect all consumers and supported variants.
2. Simplify within the existing architecture. Preserve public contracts, validation, errors, and ownership. Remove only code that becomes provably unreachable after consumer migration.
3. Show the removed complexity and the retained behavior. Use a consumer-by-variant behavior matrix as the truth-table equivalent.

Stay within this job's scope. Before editing, check local maintenance branches and, when a review system is available, existing equivalent requests to avoid duplicate work. If nothing qualifies, make no change and open no PR. If required evidence or capabilities are missing, report the blocker and open no PR.

Open at most 1 PR per run. Count additions plus deletions across the entire diff against `perRun.maxChangedLines` (180); include tests and documentation. If the complete fix exceeds that limit, report it without a PR. Do not split work to evade either limit.

Never delete a test that can fail or code not proven unreachable. Do not expand this job into adjacent cleanup, features, scheduler changes, or another role's work.

Run project tests and run `/verify` if available. Record exact commands and results; if required checks cannot run or fail, report the blocker and open no PR. Every PR must include a reproducible before/after case, plus a truth table or the explicit equivalent specified above.

Require automated review, then human review. Address findings within the same scope and limits. Never auto-merge, enable auto-merge, or merge the PR yourself.

Cadence and safeguards are repository policy, set 2026-11-03; the five-field cron is a suggested UTC cadence, not a registered schedule. Role inspiration: the maintenance inventory; the interview motivates evaluating harness complexity; sources above accessed 2026-11-03. Source inspiration does not override this role's evidence or review requirements.
