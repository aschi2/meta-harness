---
id: harness-check
title: "Harness check"
job: "Run meta-harness check and propose one bounded repair or report the failure."
defaultCadence: "47 5 * * 1"
perRun:
  maxPullRequests: 1
  maxChangedLines: 150
requiredEvidence:
  - "Exact meta-harness check command, tool version, exit status, and sanitized diagnostics."
  - "For a repair, the same check failing before and passing after, with affected compatibility checks."
neverDo:
  - "Treat missing meta-harness check support as success or silently substitute another command."
  - "Modify compatibility contracts, suppress diagnostics, regenerate the whole harness, or apply changes to live checkouts."
  - "Exceed per-run limits, expand job scope, or merge automatically."
requires: [repo, local-toolchain]
review: pull-request
sources:
  - https://github.com/anthropics/claude-code-action/blob/main/action.yml
  - https://github.com/anthropics/claude-code-action/blob/main/README.md
  - https://code.claude.com/docs/en/routines
---

1. From the authorized repository checkout, run `meta-harness check` using the project's installed toolchain. Capture its version, exit status, and sanitized diagnostics.
2. If the check passes, report success with no PR. If the command is unavailable or fails for an unknown reason, report the issue with the exact failure and open no PR.
3. For one understood failure, identify a bounded source repair that preserves manifest compatibility and existing ownership rules. Re-run the same check after the repair.
4. If the repair cannot fit the limits or pass checks, report the issue without opening a speculative PR. Otherwise propose the repair as a PR with a failure/repaired-result matrix as the explicit truth-table equivalent. Report issues in the run output unless separate authorization permits creating an external issue.

Stay within this job's scope. Before editing, check local maintenance branches and, when a review system is available, existing equivalent requests to avoid duplicate work. If nothing qualifies, make no change and open no PR. If required evidence or capabilities are missing, report the blocker and open no PR.

Open at most 1 PR per run. Count additions plus deletions across the entire diff against `perRun.maxChangedLines` (150); include tests and documentation. If the complete fix exceeds that limit, report it without a PR. Do not split work to evade either limit.

Never delete a test that can fail or code not proven unreachable. Do not expand this job into adjacent cleanup, features, scheduler changes, or another role's work.

Run project tests and run `/verify` if available. Record exact commands and results; if required checks cannot run or fail, report the blocker and open no PR. Every PR must include a reproducible before/after case, plus a truth table or the explicit equivalent specified above.

Require automated review, then human review. Address findings within the same scope and limits. Never auto-merge, enable auto-merge, or merge the PR yourself.

Cadence and safeguards are repository policy, set 2026-11-03; the five-field cron is a suggested UTC cadence, not a registered schedule. The user selects an execution environment that satisfies this role's requirements; the check command is repository policy; sources above accessed 2026-11-03. Source inspiration does not override this role's evidence or review requirements.
