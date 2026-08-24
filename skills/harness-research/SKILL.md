---
name: harness-research
description: Refresh the meta-harness knowledge base with current best practices via live web research against primary sources; writes reviewable KB diffs with citations. Use when the user asks to refresh/update harness best practices, re-research the KB, or when the KB looks stale (reviewed dates several months old).
---

# harness-research

Update the knowledge base from live research. The KB is the single source of truth `/harness-new` and `/harness-update` read, so every change must be cited and land as a reviewable diff.

**Work in the meta-harness source repo** (`/Users/austin/codex-projects/meta-harness`), not a plugin cache copy — edits to a cache are lost on reinstall. After the refresh, tell the user to run `claude plugin update meta-harness` if the plugin was installed from the marketplace rather than referenced in place.

## Procedure

### 1. Scope

- Read `kb/CHANGELOG.md` and each topic file's `reviewed:` frontmatter.
- Default scope: every topic older than 3 months, plus any topics the user named. A full refresh re-researches everything.

### 2. Research

Spawn one research subagent per in-scope topic, in parallel, each with WebSearch/WebFetch. Per-topic instructions:

- Primary sources first: official docs and engineering blogs of the tool/model vendors, then high-signal practitioners. Every claim needs a URL and a date.
- Explicitly search for what changed since the topic's `reviewed:` date — new tool releases, new official guidance, retracted or superseded advice.
- Also scan for NEW harness tools gaining real adoption (candidates for `kb/harness-targets.md`) and for KB claims that are now wrong — refutation is as valuable as addition.
- Return raw structured findings with citations, plus a "disagreements / low-confidence" section. Mark anything unverifiable UNVERIFIED.

### 3. Synthesize into the KB

You judge the findings; subagents only gather. For each topic file:

- Integrate confirmed changes; keep the file's structure (see `kb/README.md` for conventions).
- Contested or single-source claims get marked as such in place — never presented as consensus.
- UNVERIFIED findings are dropped, not stored.
- Update `reviewed:` frontmatter on every touched file.

### 4. Record and report

- Add one entry at the TOP of `kb/CHANGELOG.md` (newest-first file) for the refresh, with a unique heading (date + short slug), topics touched, and a bullet per substantive change (added/changed/removed guidance) — this changelog is what `/harness-update` uses to scope upgrades, so a change that isn't logged effectively never happened.
- If a change affects what generated harnesses should contain, say so explicitly in the final report and recommend running `/harness-update` on live repos.
- Show the KB diff (`git diff` if the repo is under git, else summarize per file).
