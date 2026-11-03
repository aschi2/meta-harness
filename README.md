# meta-harness

An open-source utility for generating and maintaining agent harnesses for any domain, from coding to personal finance and coaching. Every harness has five parts:

- **Context:** instructions, the user's profile, and preferences.
- **Knowledge:** sources and a curated store.
- **Actions:** skills and tools.
- **Checks:** deterministic validators for agent output.
- **Loop:** corrections become checks, research refreshes knowledge, and updates are re-applied.

A small TypeScript core on Bun handles deterministic file operations; agents keep judgment work. Domain packs supply knowledge, templates, and checkers. Available domain packs are coding, knowledge-wiki and coaching, exposed through the Claude Code plugin skills; personal overlays stay outside this repository. The core provides pack validation, plan-driven init/update, harness checks, and portable maintenance runs.

## Skills

| Skill               | What it does                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/harness-new`      | Select a domain pack, interview for its profile, and generate tailored files plus a `.harness/manifest.json` recording what was generated.                                     |
| `/harness-update`   | Re-apply current KB best practices to a previously generated harness. Uses the manifest to distinguish generated files from hand edits; never silently clobbers human changes. |
| `/harness-research` | Refresh the knowledge base: live web research against primary sources, written back to `packs/coding/kb/` as reviewable diffs with sources and dates.                          |

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

The package exposes the same CLI as `meta-harness`. Plans contain `pack`, `profile`, `files` (inline content or a declared template plus string variables), and `symlinks`; every entry names its `parts`. File modes are `managed` (generator-owned, drift is informational and update merges), `seed` (written at init, then workflow-owned), or `owner` (constraints whose changed hashes require `meta-harness approve <path> --target <dir>`). Packs declare owner paths, which maintenance automatically protects. Existing unmanaged files require `adopted: true`. Omitted managed paths are retained; user-deleted files remain deleted. Text conflicts return non-zero with markers and advance the generator baseline, so a resolved file survives rerunning the same plan. Symlink/type conflicts remain untouched.

Checks validate manifests and profiles, report managed drift and fail unapproved owner drift, enforce pack-declared instruction budgets, and execute declared checker files in the target directory. TypeScript/JavaScript checkers run through the CLI runtime; other checker files must be executable. All must return zero to pass. The coding pack distinguishes vendor limits from authoring policy; pi has no declared numeric budget.

Writes are atomic per file. An interrupted batch leaves `.harness/pending.json`; later commands refuse to proceed and print backup, restore, marker-removal and retry instructions. Automatic recovery is outside the current CLI.

## Maintenance

No maintenance role is enabled by default. Coding supplies twelve roles, and every harness implicitly includes the base knowledge-refresh, correction-miner and harness-check roles. Role contracts are published in `schemas/role.schema.json`; scheduler recipes live in `packs/base/knowledge/scheduler-recipes.md`.

The user chooses the scheduler, agent and review system. The core generates no scheduler configuration and calls no forge API for status. Repository `.harness/maintenance.json` contains only role state (`roles`, each with `enabled` and `cadence`; schema: `schemas/maintenance.schema.json`). It cannot choose executable commands.

Put machine-owned commands in `~/.config/meta-harness/maintenance.json` on macOS/Linux or `%APPDATA%\meta-harness\maintenance.json` on Windows, or pass `--config <path>` to run/schedule (schema: `schemas/maintenance-user.schema.json`):

```json
{
  "agent": [
    "claude",
    "-p",
    "--permission-mode",
    "acceptEdits",
    "Read {prompt_file}; work in {worktree}; write required evidence to {evidence_file}."
  ],
  "verify": ["bun", "test"],
  "timeoutMinutes": 60,
  "protectedPaths": ["security/**"]
}
```

For Codex, use `["codex", "exec", "--sandbox", "workspace-write", "-c", "approval_policy=\"never\"", "Read {prompt_file}; work in {worktree}; write evidence to {evidence_file}."]`. The owner must authorize access to the external evidence directory using their agent's filesystem permissions. Claude's `acceptEdits` permits edits; other commands still need owner-approved tool permissions ([Claude headless documentation](https://code.claude.com/docs/en/headless)). Codex's `workspace-write` permits edits in the worktree ([Codex non-interactive documentation](https://developers.openai.com/codex/noninteractive/)). Checked 2026-11-03 through Context7 and official documentation.

Any agent executable works. Commands are argv arrays, never interpreted by a shell by the core; the owner may deliberately configure an interpreter. Only `{prompt_file}`, `{worktree}`, `{evidence_file}`, `{branch}`, `{title}` and `{body_file}` expand. Other braces remain literal. Use absolute executable/script paths when a scheduler has a limited PATH. Keep credentials out of arguments.

Optional publisher argv examples:

- GitHub: `["gh", "pr", "create", "--head", "{branch}", "--title", "{title}", "--body-file", "{body_file}"]`. The publisher must arrange branch pushing; this invocation assumes its remote head already exists. A custom direct-executable publisher can push then create the request.
- GitLab: `["glab", "mr", "create", "--source-branch", "{branch}", "--title", "{title}", "--description-file", "{body_file}", "--push", "--yes"]` ([current CLI reference](https://docs.gitlab.com/cli/mr/create/), checked 2026-11-03).
- No forge: omit `publish`; retain the committed branch for local review.

```text
meta-harness maintenance list --target <dir>
meta-harness maintenance enable dead-code-remover --target <dir> --cadence "7 3 * * *"
meta-harness maintenance schedule dead-code-remover --target <dir>
meta-harness maintenance run dead-code-remover --target <dir>
meta-harness maintenance disable dead-code-remover --target <dir>
meta-harness maintenance status --target <dir>
```

Enable/disable update only the configuration, managed in the manifest's loop part. Cadences are five-field numeric cron suggestions, not installed schedules. The schedule command prints absolute argv for any scheduler. `run --force` permits a supervised test of a disabled role.

A run starts from the default branch in a fresh Git worktree. Prompt, evidence and publication body live in a new temporary directory outside it; symlinked run files are refused. Evidence must have a Markdown section for each required evidence item. Optional owner-configured verification runs after the agent; failures prevent publication, and its actual stdout/stderr enter the review body.

The core builds one commit with the base as its only parent, regardless of agent commits or checkouts. It measures that commit's additions plus deletions and rejects binaries, gitlinks/submodules, protected harness/CI paths and over-limit changes. User `protectedPaths` extend the defaults. Accepted branches remain for review; failed/no-change branches are discarded. A per-role PID lock prevents concurrent runs. Dead runs are swept on the next run; started and final records make interruptions visible. Timeouts and termination signals kill the agent process tree and trigger cleanup. Cleanup failure after publication is a recorded warning.

Status compares each published commit's stable patch-id with commits on the local default branch, detecting ordinary, rebase and squash merges even after branch deletion. Commits edited during review will not match. Publications younger than seven days do not enter the rate. Invalid/truncated log lines are skipped with warnings. Roles below 30% after five eligible publications need tuning. Fetch the default branch locally before interpreting status; the core never fetches or contacts a forge.
