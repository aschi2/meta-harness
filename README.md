# meta-harness

An open-source utility for generating and maintaining agent harnesses for any domain, from coding to personal finance and coaching. Every harness has five parts:

- **Context:** instructions, the user's profile, and preferences.
- **Knowledge:** sources and a curated store.
- **Actions:** skills and tools.
- **Checks:** deterministic validators for agent output.
- **Loop:** corrections become checks, research refreshes knowledge, and updates are re-applied.

A small TypeScript core on Bun handles deterministic file operations; agents keep judgment work. Domain packs supply knowledge, templates, and checkers. The first pack is coding, exposed through the existing Claude Code plugin skills; personal overlays stay outside this repository. The core provides pack validation, plan-driven init/update, and harness checks.

## Skills

| Skill | What it does |
|---|---|
| `/harness-new` | Generate a harness for a repo (existing code or a PRD/app description). Profiles the repo, reads the KB, emits tailored files plus a `.harness/manifest.json` recording what was generated. |
| `/harness-update` | Re-apply current KB best practices to a previously generated harness. Uses the manifest to distinguish generated files from hand edits; never silently clobbers human changes. |
| `/harness-research` | Refresh the knowledge base: live web research against primary sources, written back to `packs/coding/kb/` as reviewable diffs with sources and dates. |

## Knowledge base

`packs/coding/kb/` holds the best-practices corpus the generator reads. Every file carries frontmatter with a `reviewed:` date and inline source citations. `packs/coding/kb/CHANGELOG.md` records each research refresh, so "best practices changed" is an explicit, auditable event and any generated harness can be traced to the KB state that produced it.

Research precedence: verifiable, recent primary sources first; personal conventions only where research is silent or genuinely a matter of preference.

## User overlays

Users can keep private setup routines that layer on a generated harness — wiring a repo into an issue tracker, a billing system, a deploy pipeline. That content stays out of this project: it is user-authored, often carries credentials or client names, and does not generalise.

Overlay execution is outside the current CLI. Existing overlay and machine-setup metadata is preserved during updates; the core neither reruns private routines nor writes repo-external configuration.

## Install

Bun 1.4.2 or later and Git are required. Run `bun install` in the source checkout to install dependencies.

```bash
git clone https://github.com/aschi2/meta-harness.git
claude plugin marketplace add ./meta-harness
claude plugin install meta-harness@meta-harness
```

After changing the knowledge base, bump `version` in `.claude-plugin/plugin.json` and run `claude plugin update meta-harness@meta-harness` — updates are version-gated.

## Manifest

Generated harnesses get `.harness/manifest.json` (meta-harness version, the KB changelog entry used, repo profile, and a content hash per generated file) plus `.harness/baseline/` copies of generator content. Applied-file hashes include cleanly merged user edits; baselines retain generator content so those edits survive subsequent updates. `/harness-update` compares hashes to detect hand edits and three-way merges against the baseline rather than overwriting.

## Core commands

The agent writes a plan matching `schemas/plan.schema.json`; the core applies all target changes. Pack profiles are validated against the JSON Schema declared in each pack.

```bash
bun run src/cli.ts validate .
bun run src/cli.ts init --pack coding --plan plan.json --target /path/to/repo
bun run src/cli.ts update --plan new-plan.json --target /path/to/repo
bun run src/cli.ts check --target /path/to/repo
bun run schemas
```

The package exposes the same CLI as `meta-harness`. Plans contain `pack`, `profile`, `files` (inline content or a declared template plus string variables), and `symlinks`; every entry names its `parts`. Existing unmanaged files require `adopted: true`. Omitted managed paths are retained; user-deleted files remain deleted. Text conflicts return non-zero with markers and advance the generator baseline, so a resolved file survives rerunning the same plan. Symlink/type conflicts remain untouched.

Checks validate manifests and profiles, detect drift, enforce pack-declared instruction budgets, and execute declared checker files in the target directory. Checkers must be executable and return zero to pass. The coding pack distinguishes vendor limits from authoring policy; pi has no declared numeric budget.

Writes are atomic per file. An interrupted batch leaves `.harness/pending.json`; later commands refuse to proceed and print backup, restore, marker-removal and retry instructions. Automatic recovery is outside the current CLI.
