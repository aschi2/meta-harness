---
id: wiki-lint-fixer
title: "Wiki lint fixer"
job: "Repair one reproducible structural wiki finding without changing source evidence."
defaultCadence: "37 6 * * 2"
perRun:
  maxPullRequests: 1
  maxChangedLines: 120
requiredEvidence:
  - "Reproducible checker rule and relative page path before the fix."
  - "Smallest structural diff, before/after finding comparison, and exact checker and test results."
neverDo:
  - "Read or alter raw contents, .env files, receipts, or tmp, or follow escaping links or symlinks."
  - "Silence findings by weakening the checker, inventing provenance, or deleting wiki pages."
  - "Delete a test that can fail or code not proven unreachable."
  - "Exceed one PR or the line cap, broaden scope, commit, push, or merge automatically."
requires: [repo, local-toolchain]
review: pull-request
sources:
  - https://yaml.org/spec/1.2.2/
  - https://git-scm.com/docs/git-status
  - https://spec.commonmark.org/0.31.2/
---

1. In the provided worktree, read AGENTS.md and owner-controlled profile.json, respect approveEdits, and run the declared Bun checker. Select one reproducible structural finding, checking existing requests for duplicates. Work from wiki pages and raw path metadata only. Raw immutability violations, absent provenance, uncertain link targets, or missing approval require an owner decision; report the blocker instead of manufacturing a repair.
2. Make the smallest supported frontmatter, navigation, or dated-order repair. Preserve all claims, raw sources, and historical log entries. Do not weaken a rule or remove a page to make lint pass. Include a before/after finding comparison as the truth-table equivalent.
3. Run the checker again, project tests, and /verify when available. Record exact commands and results. Failed or unavailable required checks block the PR; do not claim unrun checks passed.

Open at most 1 PR and change at most 120 lines per run, counting additions plus deletions including tests and docs. If the complete repair exceeds the cap, report it without splitting it. Never delete a test that can fail or code not proven unreachable. Do not commit, push, change a scheduler, or expand scope. Require automated review then human PR review; never auto-merge. If nothing qualifies, make no change and open no PR. Missing evidence or capabilities means report the blocker and open no PR.

Cadence and safeguards are pack policy / heuristics set 2026-11-03, not a registered schedule. Sources above were reviewed 2026-11-03.
