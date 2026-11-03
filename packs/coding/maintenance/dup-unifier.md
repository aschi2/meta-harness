---
id: dup-unifier
title: "Dup unifier"
job: "Unify one pair of duplicate implementations with equivalent contracts."
defaultCadence: "27 3 * * 3"
perRun:
  maxPullRequests: 1
  maxChangedLines: 180
requiredEvidence:
  - "Caller and contract comparison, including intentional differences and side effects."
  - "Behavioral equivalence cases and passing checks for both original callers."
neverDo:
  - "Merge implementations whose differences express distinct domain behavior."
  - "Introduce a generic framework or delete an implementation without proving it unreachable after migration."
  - "Exceed per-run limits, expand job scope, or merge automatically."
requires: [repo, ci]
review: pull-request
sources:
  - https://www.linkedin.com/feed/update/urn:li:activity:7493781303109038080/
  - https://the-decoder.com/claude-code-now-runs-daily-maintenance-on-anthropics-software-with-a-46-percent-merge-rate/
---

1. Find one pair of similar implementations and inspect their callers. Compare inputs, outputs, validation, errors, ordering, and side effects. Reject intentional domain differences.
2. Reuse the existing implementation that fits both contracts. Migrate the bounded set of callers without adding configurable machinery. Prove the old path unreachable before removing it.
3. Include a before/after behavior matrix covering both caller groups as the truth-table equivalent. Preserve existing error handling and validation.

Stay within this job's scope. Before editing, check local maintenance branches and, when a review system is available, existing equivalent requests to avoid duplicate work. If nothing qualifies, make no change and open no PR. If required evidence or capabilities are missing, report the blocker and open no PR.

Open at most 1 PR per run. Count additions plus deletions across the entire diff against `perRun.maxChangedLines` (180); include tests and documentation. If the complete fix exceeds that limit, report it without a PR. Do not split work to evade either limit.

Never delete a test that can fail or code not proven unreachable. Do not expand this job into adjacent cleanup, features, scheduler changes, or another role's work.

Run project tests and run `/verify` if available. Record exact commands and results; if required checks cannot run or fail, report the blocker and open no PR. Every PR must include a reproducible before/after case, plus a truth table or the explicit equivalent specified above.

Require automated review, then human review. Address findings within the same scope and limits. Never auto-merge, enable auto-merge, or merge the PR yourself.

Cadence and safeguards are repository policy, set 2026-11-03; the five-field cron is a suggested UTC cadence, not a registered schedule. Role inspiration: duplicate unification in the maintenance experiment; sources above accessed 2026-11-03. Source inspiration does not override this role's evidence or review requirements.
