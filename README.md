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

## User overlays

Users can keep private setup routines that layer on a generated harness — wiring a repo into an issue tracker, a billing system, a deploy pipeline. That content stays out of this project: it is user-authored, often carries credentials or client names, and does not generalise.

`/harness-new` looks for them in `${AGENT_OVERLAY_DIR:-~/.config/agent-overlays}`. Each is a markdown file whose frontmatter declares `name`, `description`, a `when` question, and `requires`. Only the frontmatter is read up front; the body runs only if the user answers yes to `when`. Applied overlays are recorded in the manifest by name, and the files they write are deliberately not tracked in `files` or `baseline/` — this plugin does not own them, and `/harness-update` leaves them alone.

No overlay directory means the step is skipped silently. Overlay bodies are user-authored and untrusted by this plugin.

## Install

```bash
claude plugin marketplace add /Users/austin/codex-projects/meta-harness
claude plugin install meta-harness@meta-harness
```

## Manifest

Generated harnesses get `.harness/manifest.json` (meta-harness version, the KB changelog entry used, repo profile, and a content hash per generated file) plus `.harness/baseline/` copies of each generated file. `/harness-update` compares hashes to detect hand edits and three-way merges against the baseline rather than overwriting.
