---
name: harness-research
description: Refresh the meta-harness knowledge base with current best practices via live web research against primary sources; writes reviewable KB diffs with citations. Use when the user asks to refresh/update harness best practices, re-research the KB, or when the KB looks stale (reviewed dates several months old).
---

# harness-research

Update the knowledge base from live research. The KB is the single source of truth `/harness-new` and `/harness-update` read, so every change must be cited and land as a reviewable diff.

**Work in the meta-harness source checkout**, not the installed plugin cache — edits to a cache are lost on reinstall. If the current directory is inside a plugin cache (a path under `~/.claude/plugins/`), ask the user where the source checkout lives before editing. After the refresh: bump `version` in `.claude-plugin/plugin.json` (updates are version-gated), then run `claude plugin update meta-harness@meta-harness` so the installed copy picks up the new KB.

## Procedure

### 1. Scope

- Read `packs/coding/kb/CHANGELOG.md` and each topic file's `reviewed:` frontmatter.
- Default scope: every topic older than 3 months, plus any topics the user named. A full refresh re-researches everything.

### 2. Research

Spawn one research subagent per in-scope topic, in parallel, each with WebSearch/WebFetch. Per-topic instructions:

- Primary sources first: official docs and engineering blogs of the tool/model vendors, then high-signal practitioners. Every claim needs a URL and a date.
- Explicitly search for what changed since the topic's `reviewed:` date — new tool releases, new official guidance, retracted or superseded advice.
- For every rule, ask whether it differs between engineer-steered work (interactive session, human can approve, redirect, triage) and autonomous work (headless `claude -p` / `codex exec`, CI, queue workers, no human until PR review). Report the split with evidence for each side; flag rules the topic file states once that are only right for one mode.
- Also scan for NEW harness tools gaining real adoption (candidates for `packs/coding/kb/harness-targets.md`) and for KB claims that are now wrong — refutation is as valuable as addition.
- Return raw structured findings with citations, plus a "disagreements / low-confidence" section. Mark anything unverifiable UNVERIFIED.

### 3. Synthesize into the KB

You judge the findings; subagents only gather. For each topic file:

- Integrate confirmed changes; keep the file's structure (see `packs/coding/kb/README.md` for conventions).
- Contested or single-source claims get marked as such in place — never presented as consensus.
- UNVERIFIED findings are dropped, not stored.
- Update `reviewed:` frontmatter on every touched file and its matching `researchTopics` date in `packs/coding/pack.json`. Keep the manifest's knowledge file list and research topics current when adding or removing files.

### 4. Record and report

- Add one entry at the TOP of `packs/coding/kb/CHANGELOG.md` (newest-first file) for the refresh, with a unique heading (date + short slug), topics touched, and a bullet per substantive change (added/changed/removed guidance) — this changelog is what `/harness-update` uses to scope upgrades, so a change that isn't logged effectively never happened.
- If a change affects what generated harnesses should contain, say so explicitly in the final report and recommend running `/harness-update` on live repos.
- Run `bun run src/cli.ts validate .` in the source checkout and resolve validation errors before reporting.
- Show the KB diff (`git diff` if the repo is under git, else summarize per file).
