---
id: coverage-gap-writer
title: "Coverage-gap writer"
job: "Add one meaningful regression test for an uncovered supported behavior."
defaultCadence: "17 5 * * 3"
perRun:
  maxPullRequests: 1
  maxChangedLines: 150
requiredEvidence:
  - "Supported behavior contract and the specific missing assertion."
  - "Test failure under a temporary targeted fault and pass on the unchanged correct implementation."
neverDo:
  - "Chase a coverage percentage or add assertions that mirror implementation details."
  - "Change production behavior, retain fault injection, or delete a test that can fail."
  - "Exceed per-run limits, expand job scope, or merge automatically."
requires: [repo, ci]
review: pull-request
sources:
  - https://code.claude.com/docs/en/best-practices
  - https://www.ycrootaccess.com/p/boris-cherny-building-claude-code
---

1. Find one supported behavior with no meaningful assertion, using existing tests and coverage reports. Prioritize boundaries, errors, or previously risky behavior over line counts.
2. Add the smallest behavior-level test with an independent expected result. Prove that it detects a relevant temporary fault, then remove the fault and confirm it passes on correct code.
3. Include the behavior, missing assertion, injected fault, and pass/fail results as the explicit truth-table equivalent. If the new test exposes an existing product bug, report it for a separate bug-fix job.

Stay within this job's scope. Before editing, check local maintenance branches and, when a review system is available, existing equivalent requests to avoid duplicate work. If nothing qualifies, make no change and open no PR. If required evidence or capabilities are missing, report the blocker and open no PR.

Open at most 1 PR per run. Count additions plus deletions across the entire diff against `perRun.maxChangedLines` (150); include tests and documentation. If the complete fix exceeds that limit, report it without a PR. Do not split work to evade either limit.

Never delete a test that can fail or code not proven unreachable. Do not expand this job into adjacent cleanup, features, scheduler changes, or another role's work.

Run project tests and run `/verify` if available. Record exact commands and results; if required checks cannot run or fail, report the blocker and open no PR. Every PR must include a reproducible before/after case, plus a truth table or the explicit equivalent specified above.

Require automated review, then human review. Address findings within the same scope and limits. Never auto-merge, enable auto-merge, or merge the PR yourself.

Cadence and safeguards are repository policy, set 2026-11-03; the five-field cron is a suggested UTC cadence, not a registered schedule. Verification rationale: official best practices and the interview; sources above accessed 2026-11-03. Source inspiration does not override this role's evidence or review requirements.
