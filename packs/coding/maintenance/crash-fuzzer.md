---
id: crash-fuzzer
title: "Crash fuzzer"
job: "Reproduce and fix one real application crash found in an authorized local simulator."
defaultCadence: "47 4 * * *"
perRun:
  maxPullRequests: 1
  maxChangedLines: 200
requiredEvidence:
  - "Simulator and build versions, random seed, action sequence, and crash trace."
  - "Minimal deterministic reproduction and a passing replay after the fix."
neverDo:
  - "Use production accounts or data, contact real external services, or perform destructive real-world actions."
  - "Replace the real application with mocks, suppress the crash, or skip a failing test."
  - "Exceed per-run limits, expand job scope, or merge automatically."
requires: [repo, local-toolchain, simulator]
review: pull-request
sources:
  - https://www.linkedin.com/feed/update/urn:li:activity:7493781303109038080/
  - https://the-decoder.com/claude-code-now-runs-daily-maintenance-on-anthropics-software-with-a-46-percent-merge-rate/
  - https://code.claude.com/docs/en/routines
---

1. Build the real app with the repository's local toolchain and launch its authorized simulator with disposable synthetic data. Set a bounded run duration and record the seed before exploring.
2. Exercise application actions, capture a real crash, and minimize the action sequence. Reproduce it deterministically before fixing the root cause.
3. Replay the sequence after the fix and add a focused regression check. Include versions, seed, steps, trace, and a before/after replay matrix as the truth-table equivalent. If the simulator or toolchain is unavailable, stop with no PR; do not switch execution environments to bypass a missing requirement.

Stay within this job's scope. Before editing, check local maintenance branches and, when a review system is available, existing equivalent requests to avoid duplicate work. If nothing qualifies, make no change and open no PR. If required evidence or capabilities are missing, report the blocker and open no PR.

Open at most 1 PR per run. Count additions plus deletions across the entire diff against `perRun.maxChangedLines` (200); include tests and documentation. If the complete fix exceeds that limit, report it without a PR. Do not split work to evade either limit.

Never delete a test that can fail or code not proven unreachable. Do not expand this job into adjacent cleanup, features, scheduler changes, or another role's work.

Run project tests and run `/verify` if available. Record exact commands and results; if required checks cannot run or fail, report the blocker and open no PR. Every PR must include a reproducible before/after case, plus a truth table or the explicit equivalent specified above.

Require automated review, then human review. Address findings within the same scope and limits. Never auto-merge, enable auto-merge, or merge the PR yourself.

Cadence and safeguards are repository policy, set 2026-11-03; the five-field cron is a suggested UTC cadence, not a registered schedule. Role inspiration: simulator crash fuzzing in the maintenance experiment; sources above accessed 2026-11-03. Source inspiration does not override this role's evidence or review requirements.
