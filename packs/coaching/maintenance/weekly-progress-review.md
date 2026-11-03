---
id: weekly-progress-review
title: Weekly progress review
job: Compare logged coaching sessions with the plan and propose one bounded adjustment.
defaultCadence: "19 8 * * 1"
perRun:
  maxPullRequests: 1
  maxChangedLines: 100
requiredEvidence:
  - "A dated comparison of planned and completed sessions with missing data identified."
  - "A before and after constraint matrix and actual plan-check results for any proposed adjustment."
neverDo:
  - "Change profile precautions, excluded tags, the movement library, or the available equipment."
  - "Infer medical clearance, invent completed sessions, access a tracker without approval, or expand scope."
  - "Delete a test that can fail, delete code not proven unreachable, or merge automatically."
requires: [repo]
review: pull-request
sources:
  - https://acsm.org/resistance-training-guidelines-update-2026/
  - https://acsm.org/EIM/
---

1. Read the authorized plan and logs/sessions.json, then compare planned sessions, completed items, durations and user feedback. Missing logs are unknown, not failed or successful sessions. Keep private health and tracking data out of a public review; use sanitized counts and relative paths. If approved private evidence cannot be supplied safely, report the blocker and open no PR.
2. If the logs support a useful change, propose one small plan adjustment using existing owner-approved library items and existing locations. Preserve all limits and precautions. Never change profile precautions, exclusions, library items or their tags/equipment requirements. Do not infer readiness or relax constraints from completion alone; clinical concerns go to the clinician.
3. Run meta-harness check including plan-check, the project's tests and /verify if available. Include a before/after constraint matrix, reproducible case and real verification output in the review evidence. If nothing qualifies or evidence is missing, do nothing and open no PR.

Stay within this job's scope. Before editing, check local maintenance branches and, when a review system is available, existing equivalent requests to avoid duplicate work. If nothing qualifies, make no change and open no PR. If required evidence or capabilities are missing, report the blocker and open no PR.

Open at most 1 PR per run. Count additions plus deletions across the entire diff against `perRun.maxChangedLines` (100); include tests and documentation. If the complete fix exceeds that limit, report it without a PR. Do not split work to evade either limit.

Never delete a test that can fail or code not proven unreachable. Do not expand this job into adjacent cleanup, features, scheduler changes, or another role's work.

Run project tests and run `/verify` if available. Record exact commands and results; if required checks cannot run or fail, report the blocker and open no PR. Every PR must include a reproducible before/after case, plus a truth table or the explicit equivalent specified above.

Require automated review, then human review. Address findings within the same scope and limits. Never auto-merge, enable auto-merge, or merge the PR yourself.

Cadence, line limits and the review method are pack policy (2026-11-03), not a medical prescription. Source guidance concerns healthy adults and human professional referral; it does not authorize clinical decisions by an agent.
