---
id: stale-page-review
title: "Stale wiki page review"
job: "Review one wiki claim against changed primary evidence and propose a cited correction."
defaultCadence: "47 6 * * 4"
perRun:
  maxPullRequests: 1
  maxChangedLines: 150
requiredEvidence:
  - "Existing claim, its review date, and dated primary evidence demonstrating a substantive change."
  - "Old/new claim comparison, provenance and log updates, and exact checker and test results."
neverDo:
  - "Treat page age alone as a factual change, invent a citation, or erase contradictory evidence."
  - "Read or copy raw contents, .env files, receipts, or tmp, or change the source archive."
  - "Delete a test that can fail or code not proven unreachable."
  - "Exceed one PR or the line cap, broaden scope, commit, push, or merge automatically."
requires: [repo, local-toolchain]
review: pull-request
sources:
  - https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
  - https://git-scm.com/docs/git-status
---

1. In the provided worktree, read AGENTS.md and owner-controlled profile.json and wiki reviewed dates. Select one claim with changed primary evidence, checking prior log entries and review requests for duplicates. Use only authorized public sources and existing wiki citations; inspect local raw references through metadata only. Missing access, evidence, or required owner approval means report the blocker and make no change.
2. Respect approveEdits before applying a correction. Compare the old claim and its date with the new dated primary evidence. Correct only supported claims, retain uncertainty and contradictions, and label inferences. An existing raw reference must support the revision; if a new raw source is needed, report an ingest prerequisite rather than writing into the archive.
3. Update the page's reviewed date and prepend an ISO-dated log entry. Include the old-claim/source-date/new-claim comparison as the truth-table equivalent. Run the declared Bun checker, project tests, and /verify if available; record exact commands and results. Failed or unavailable required checks block the PR.

Open at most 1 PR and change at most 150 lines per run, counting additions plus deletions including tests and docs. If the full correction exceeds the cap, report it without splitting it. Never delete a test that can fail or code not proven unreachable. Do not commit, push, change a scheduler, or expand scope. Require automated review then human PR review; never auto-merge. If nothing qualifies, make no change and open no PR.

Cadence and safeguards are pack policy / heuristics set 2026-11-03, not a registered schedule. Sources above were reviewed 2026-11-03.
