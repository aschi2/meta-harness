# meta-harness

A Claude Code plugin that generates and upgrades AI development harnesses for any codebase or PRD, using a curated, refreshable knowledge base of current best practices.

A "harness" here means everything a repo carries so AI coding agents work well in it: the canonical instructions file (`AGENTS.md` + tool symlinks), a documentation and memory system, code navigation sized to the repo, skills/commands/hooks, permission settings, and per-tool config for Claude Code, Codex, Cursor, and pi.

## Skills

| Skill | What it does |
|---|---|
| `/harness-new` | Generate a harness for a repo (existing code or a PRD/app description). Profiles the repo, reads the KB, emits tailored files plus a `.harness/manifest.json` recording what was generated. |
| `/harness-update` | Re-apply current KB best practices to a previously generated harness. Uses the manifest to distinguish generated files from hand edits; never silently clobbers human changes. |
| `/harness-research` | Refresh the knowledge base: live web research against primary sources, written back to `kb/` as reviewable diffs with sources and dates. |

## Knowledge base

`kb/` holds the best-practices corpus the generator reads. Every file carries frontmatter with a `reviewed:` date and inline source citations. `kb/CHANGELOG.md` records each research refresh, so "best practices changed" is an explicit, auditable event and any generated harness can be traced to the KB state that produced it.

Research precedence: verifiable, recent primary sources first; personal conventions only where research is silent or genuinely a matter of preference.

## Install

```bash
claude plugin marketplace add /Users/austin/codex-projects/meta-harness
claude plugin install meta-harness@meta-harness
```

## Manifest

Generated harnesses get `.harness/manifest.json` (meta-harness version, the KB changelog entry used, repo profile, and a content hash per generated file) plus `.harness/baseline/` copies of each generated file. `/harness-update` compares hashes to detect hand edits and three-way merges against the baseline rather than overwriting.
