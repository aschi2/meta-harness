# meta-harness

Generate and maintain agent harnesses for any domain: software, a source wiki, coaching, or a domain of your own. The agent interviews you and writes a plan; the Bun core validates the plan and applies files deterministically.

Every harness has five parts: **context** (instructions and profile), **knowledge** (sources and curated material), **actions** (skills and tools), **checks** (deterministic validators), and a **loop** (corrections become checks, knowledge is refreshed, and updates are reapplied). Packs provide domain knowledge, templates, profile schemas, checkers, and maintenance roles. A personal overlay adds private preferences and rules outside the repository.

## Install

Install [Bun](https://bun.sh/docs/installation) 1.4.2 or newer and Git. Bun must remain installed to run the CLI; this package does not bundle the runtime. Then install the CLI globally:

```sh
bun add -g meta-harness
```

For one-off commands, `bunx meta-harness` is also available. Persistent hooks need the global install so their command path remains stable.

Install the Claude Code plugin from its marketplace:

```sh
claude plugin marketplace add https://github.com/aschi2/meta-harness.git
claude plugin install meta-harness@meta-harness
```

Restart Claude Code or reload plugins, then invoke `/meta-harness:harness-new`.

## Quickstarts

In a software repository, run `/meta-harness:harness-new`, choose the **coding** pack, and answer the questions about tools, tests, project structure, and conventions. Review the proposed files, then let the skill apply and check the harness. For a direct CLI example, save this as `coding-plan.json` and target an empty directory:

```json
{
  "pack": "coding",
  "profile": { "sizeTier": "S", "languages": ["typescript"], "targets": [] },
  "files": [
    {
      "path": "AGENTS.md",
      "parts": ["context"],
      "mode": "managed",
      "content": "# Project instructions\n\n## Verify\n\nRun the project tests before finishing.\n"
    }
  ],
  "symlinks": []
}
```

```sh
mkdir coding-harness
meta-harness init --pack coding --plan coding-plan.json --target ./coding-harness
meta-harness check --target ./coding-harness
```

For a source wiki, run `/meta-harness:harness-new`, choose **knowledge-wiki**, and describe the topic, source types, ingest cadence, and whether you approve wiki edits. The pack supplies source and analysis templates plus `wiki-lint`; keep original material under `raw/` and let the workflow create cited pages. This minimal `wiki-plan.json` makes the entry pages without inventing source material:

```json
{
  "pack": "knowledge-wiki",
  "profile": {
    "topic": "Example topic",
    "sourceTypes": ["reports", "articles"],
    "ingestCadence": "on demand",
    "approveEdits": true
  },
  "files": [
    {
      "path": "AGENTS.md",
      "parts": ["context"],
      "mode": "managed",
      "content": "# Wiki instructions\n\nKeep existing raw sources immutable. Maintain cited pages under wiki/ and link them from the index. Run meta-harness check --target . before finishing.\n"
    },
    {
      "path": "profile.json",
      "parts": ["context"],
      "mode": "owner",
      "content": "{\"topic\":\"Example topic\",\"sourceTypes\":[\"reports\",\"articles\"],\"ingestCadence\":\"on demand\",\"approveEdits\":true}\n"
    },
    {
      "path": "wiki/index.md",
      "parts": ["knowledge"],
      "mode": "seed",
      "content": "---\ntitle: Index\ntype: index\n---\n\n# Index\n\n- [Overview](overview.md)\n"
    },
    {
      "path": "wiki/overview.md",
      "parts": ["knowledge"],
      "mode": "seed",
      "content": "---\ntitle: Overview\ntype: overview\n---\n\n# Overview\n\nAdd cited summaries as sources arrive.\n"
    },
    {
      "path": "wiki/log.md",
      "parts": ["loop"],
      "mode": "seed",
      "content": "---\ntitle: Log\ntype: log\n---\n\n# Log\n\n## 2026-11-03 Initialized\n\n- Created the wiki structure.\n"
    }
  ],
  "symlinks": []
}
```

```sh
mkdir wiki-harness
meta-harness init --pack knowledge-wiki --plan wiki-plan.json --target ./wiki-harness
meta-harness check --target ./wiki-harness
```

Run `meta-harness validate` to check the installed packs.

Plans are JSON validated against the selected pack's profile schema. See the [plan schema](https://github.com/aschi2/meta-harness/blob/main/schemas/plan.schema.json) and [pack authoring guide](https://github.com/aschi2/meta-harness/blob/main/docs/pack-authoring.md).

## Packs, rules, and overlays

Built-in packs are **coding**, **knowledge-wiki**, and **coaching**; **base** roles are included in every harness. Packs are ordinary directories with a `pack.json`, profile schema, knowledge, templates, optional checkers, and maintenance roles. See the [pack authoring guide](https://github.com/aschi2/meta-harness/blob/main/docs/pack-authoring.md) to make one.

Command rules run before shell tools. Code rules use ast-grep during checks and Stop hooks. Repo-local rules must be approved by the owner; personal rules belong in an overlay outside the repo. Install or remove user-level hooks with `meta-harness overlay install` and `meta-harness overlay uninstall`.

The security model keeps decisions with the owner: repo rules need owner approval stored outside the repository, and owner-controlled files need approval after edits. Hooks ignore the working directory's Bun config and `.env`, have deadlines, and fail open with diagnostics. Maintenance creates reviewable branches or pull requests; it never auto-merges.

## Maintenance

Maintenance roles are off by default. Enable only the roles you want, choose your agent and scheduler, then use `meta-harness maintenance schedule <role>` to print the command for your scheduler. The core installs no scheduler configuration. Recipes for cron, systemd, launchd, Task Scheduler, CI, and agent automations are in [the base pack](https://github.com/aschi2/meta-harness/blob/main/packs/base/knowledge/scheduler-recipes.md).

## Platforms and license

The CLI supports macOS, Linux, and Windows with Bun and Git installed. Hook registration supports Claude Code and Codex; the plugin interface is for Claude Code. meta-harness is distributed under the [MIT License](https://github.com/aschi2/meta-harness/blob/main/LICENSE).

## Maintainers

`package.json` is the version source. Before a release, update its version, synchronize the plugin and marketplace version mirrors, and keep the metadata checks and CI green. The release workflow runs tests on macOS, Linux, and Windows, then publishes to npm with provenance when a `v*` tag is pushed. Add an `NPM_TOKEN` repository secret with npm publish access before enabling a release. After review and approval, prepare the matching tag with `git tag v<version>` and `git push origin v<version>`; that push triggers the workflow.

For local checks, run `bun install`, `bun run typecheck`, `bun test`, and `bun run src/cli.ts validate .`. To install the plugin from a checkout, use `claude plugin marketplace add ./meta-harness` and `claude plugin install meta-harness@meta-harness`.
