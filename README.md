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

Run `/meta-harness:harness-new` and choose **coding**. For the direct CLI path, save [coding-plan.json](https://github.com/aschi2/meta-harness/blob/main/examples/coding-plan.json), then run:

```sh
mkdir coding-harness
meta-harness init --pack coding --plan coding-plan.json --target ./coding-harness
meta-harness check --target ./coding-harness
```

Run `/meta-harness:harness-new` and choose **knowledge-wiki**. For the direct CLI path, save [wiki-plan.json](https://github.com/aschi2/meta-harness/blob/main/examples/wiki-plan.json), then run:

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
