---
id: knowledge-refresh
title: "Knowledge refresh"
job: "Refresh one stale harness knowledge topic through harness-research with dated primary evidence."
defaultCadence: "27 5 * * 1"
perRun:
  maxPullRequests: 1
  maxChangedLines: 200
requiredEvidence:
  - "Stale topic, its prior reviewed date, and dated primary sources showing a substantive change."
  - "Cited knowledge diff with required reviewed-date, research-topic, and changelog updates."
neverDo:
  - "Treat age alone as evidence that guidance changed or store unverified claims as fact."
  - "Install plugins, publish releases, update live checkouts, or rewrite unrelated harness topics."
  - "Exceed per-run limits, expand job scope, or merge automatically."
requires: [repo]
review: pull-request
sources:
  - https://code.claude.com/docs/en/best-practices
  - https://www.ycrootaccess.com/p/boris-cherny-building-claude-code
  - https://code.claude.com/docs/en/routines
---

1. Work in the meta-harness source checkout. Read the knowledge changelog and reviewed dates. Select one stale topic using the installed `/harness-research` procedure.
2. Research current primary sources and compare claims with the existing topic. Use harness-research within this job's scope and limits. If the skill is unavailable, report the blocker instead of inventing a substitute.
3. Integrate only confirmed substantive changes with URLs and absolute dates. Apply the procedure's matching reviewed-date, research-topic, and changelog updates. Preserve compatibility and label preferences as preferences.
4. Include an old-claim/source-date/new-claim comparison as the explicit truth-table equivalent. Stop before any install, release, cache update, or live-repository application prescribed after research.

Stay within this job's scope. Before editing, check local maintenance branches and, when a review system is available, existing equivalent requests to avoid duplicate work. If nothing qualifies, make no change and open no PR. If required evidence or capabilities are missing, report the blocker and open no PR.

Open at most 1 PR per run. Count additions plus deletions across the entire diff against `perRun.maxChangedLines` (200); include tests and documentation. If the complete fix exceeds that limit, report it without a PR. Do not split work to evade either limit.

Never delete a test that can fail or code not proven unreachable. Do not expand this job into adjacent cleanup, features, scheduler changes, or another role's work.

Run project tests and run `/verify` if available. Record exact commands and results; if required checks cannot run or fail, report the blocker and open no PR. Every PR must include a reproducible before/after case, plus a truth table or the explicit equivalent specified above.

Require automated review, then human review. Address findings within the same scope and limits. Never auto-merge, enable auto-merge, or merge the PR yourself.

Cadence and safeguards are repository policy, set 2026-11-03; the five-field cron is a suggested UTC cadence, not a registered schedule. Rationale: verify harness assumptions against current evidence; sources above accessed 2026-11-03. Source inspiration does not override this role's evidence or review requirements.
