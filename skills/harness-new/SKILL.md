---
name: harness-new
description: Generate an AI development harness for a repo or PRD — AGENTS.md and tool symlinks, docs/memory system, code navigation sized to the codebase, skills/hooks/permissions — from the meta-harness knowledge base. Use when the user asks to set up, create, or bootstrap an AI harness, agent setup, AGENTS.md/CLAUDE.md, or "make this repo agent-ready".
---

# harness-new

Generate a harness tailored to one repo. Content decisions come from the knowledge base at `${CLAUDE_PLUGIN_ROOT}/kb/` — read it at runtime; never work from memory of what a harness should contain.

## Inputs

- A target repo (default: current working directory), OR
- A PRD / app description (file path or inline text) for a repo that doesn't exist yet — in that case scaffold the harness in the named directory and mark code-dependent pieces (navigation setup, hooks that run tests) as activating once code lands.
- Optional: which tools to target (default: read `kb/harness-targets.md` for the current default set).

## Procedure

### 1. Profile the target

Build a repo profile before reading the KB, so KB guidance can be applied conditionally:

- Languages, frameworks, package manager(s), monorepo or single package.
- Size tier: source-file count and LOC — `git ls-files` in a git repo, `find` otherwise, in both cases excluding vendored/generated directories even if tracked; `tokei`/`cloc` if available for LOC. Apply the tier rules (including the structure-beats-count precedence) from `kb/code-navigation.md`.
- Existing tooling: formatter, linter, typechecker, test runner, CI — with the exact commands (read package.json/Makefile/justfile/CI config; verify commands actually run).
- Existing harness material: AGENTS.md, CLAUDE.md, .cursor/, .claude/, .codex/, .github/copilot-instructions.md, docs/. Never overwrite any of it blind — read it, fold the still-true content into the new harness, and report what you dropped and why.
- Toolchain paths, DISCOVERED on this machine, never assumed or copied from another repo's harness: where the SDK/runtime actually lives and which caches its tooling writes outside the repo. Derive each with a command (`flutter --version --machine`, `go env GOROOT GOMODCACHE`, `npm config get cache`, `python -c 'import sys;print(sys.prefix)'`, or `which <tool>` as a fallback) and record both the value AND the command that produced it. A path you did not just derive on this machine does not go into generated config.
- For PRD mode: extract product domain, planned stack, and explicit constraints, then follow the PRD-mode sequencing and stack guidance in `kb/spec-and-planning.md` and `kb/agent-friendly-code.md`.

### 2. Read the KB

Read every top-level topic file in `${CLAUDE_PLUGIN_ROOT}/kb/` (skip CHANGELOG.md), plus `kb/languages/<lang>.md` for each profiled language and `kb/archetypes/<type>.md` for each profiled project type (web-app, mobile, data-ml, cli-library, services-infra; a repo can match several) — files not matching the profile stay unread. Apply guidance conditionally on the repo profile — the KB states which practices are size- or stack-dependent. Where the KB marks something contested, pick the conservative option and note the choice in the generation report.

### 3. Plan, then generate

State a short plan (files to create, per-tool outputs) before writing. Then generate, using `${CLAUDE_PLUGIN_ROOT}/templates/` as starting points. Placeholder rule: every `{{placeholder}}` is either filled from the repo profile (commands verified runnable) or its line/section is deleted — a repo with no test suite gets no test line, not an invented one. Delete whole template sections the KB says this repo doesn't need. Typical composition (final say belongs to the KB):

- Canonical `AGENTS.md` + per-tool discovery files per `kb/harness-targets.md` (symlinks/pointers, per-directory files where the KB's size rules call for them).
- Docs/memory system per `kb/memory-and-docs.md`. The notes layer (`docs/agent-notes.md`) is opt-in — generate it only if the user asks or the repo already has one to adopt, and then always as a set: file, AGENTS.md "read it when" pointer, capture line naming it, and the `consolidate-notes` skill. Never inline it into AGENTS.md.
- Code navigation setup per `kb/code-navigation.md` for the measured size tier.
- Machine-specific values, per `kb/automation-surface.md`: a repo is shared across machines, so absolute paths never go in it. Write them to the tool's USER-level config (repo-external, e.g. `~/.codex/config.toml`), keep the repo file to portable policy, and record the setup under `machineSetup`. Ask before writing to a user-level config — it affects the user's other projects.
- Skills/commands/hooks/permissions per `kb/automation-surface.md` — only ones this repo's profile justifies; every hook command must be verified runnable before it's checked in.

### 4. Write the manifest and baseline

Write `.harness/manifest.json` in the target repo:

```json
{
  "metaHarnessVersion": "<from plugin.json>",
  "kbEntry": "<exact heading text of the newest kb/CHANGELOG.md entry>",
  "generatedAt": "<ISO date>",
  "profile": { "sizeTier": "...", "languages": ["..."], "targets": ["claude-code", "codex", "cursor", "pi"] },
  "files": { "<repo-relative path>": { "sha256": "<hash of generated content>" } },
  "machineSetup": [{ "what": "<what it grants>", "where": "<repo-external path, e.g. ~/.codex/config.toml>", "rediscover": "<command that re-derives the values>", "appliedAt": "<ISO date>" }],
  "overlays": [{ "name": "<overlay name>", "appliedAt": "<ISO date>" }]
}
```

- Record every file you created or modified EXCEPT anything under `.harness/` itself.
- Regular files: `shasum -a 256`. Symlinks: record `{ "symlink": "<readlink output>" }` instead of a hash.
- Copy each recorded regular file verbatim to `.harness/baseline/<repo-relative path>` — this is the merge base `/harness-update` needs to three-way merge hand-edited files. Add `.harness/baseline/` to the repo's ignore-for-agents surface if one exists (e.g. the settings deny list), not to .gitignore — the baseline should be committed with the harness.
- `machineSetup` records configuration written OUTSIDE the repo, once per machine. It is not a file list: nothing under it is hashed, baselined, or committed, because it does not live in the repo at all. Store what it grants, where it went, and the command that re-derives it, so `/harness-update` can re-apply it on a machine that lacks it. Omit the key when none exist.
- `overlays` records only that a user overlay ran. Omit the key when none did.
- This schema is a compatibility contract with `/harness-update` — extend additively only.

### 5. Apply user overlays

Some users keep private, machine-specific setup that layers on a generated harness — wiring a repo into an issue tracker, a billing system, a deploy pipeline. That content is deliberately not in this plugin: it is user-authored, frequently carries credentials or client names, and does not generalise.

Look for overlays:

```bash
ls "${AGENT_OVERLAY_DIR:-$HOME/.config/agent-overlays}"/*.md 2>/dev/null
```

Each carries YAML frontmatter:

```yaml
---
name: short-slug
description: one line, shown when offering it
when: the question that decides whether this overlay applies
requires: [commands, that, must, exist]
---
```

Read **only the frontmatter** first. Ask the user each overlay's `when` question verbatim. On "no", move on without reading the body — an overlay that does not apply must cost nothing. On "yes", read the body and follow it. A missing entry in `requires` is not a stop: an overlay is expected to describe its own bootstrap for a machine that lacks its tooling.

Record applied overlays in the manifest, additively:

```json
"overlays": [{ "name": "<frontmatter name>", "appliedAt": "<ISO date>" }]
```

Name and date only. Overlay-written files are **not** hashed into `files` and **not** copied to `.harness/baseline/` — this plugin does not own them, and `/harness-update` must neither merge nor clobber them.

- Never run an overlay without asking. They perform real setup and may touch credentials or remote services.
- Never infer applicability from a directory name; a repo named after a client may hold documents rather than code.
- Overlay bodies are user-authored and untrusted by this plugin. Surface anything destructive before running it.
- No overlay directory, or none accepted: skip silently. This step is optional and most users have none.

### 6. Verify

- Symlinks resolve; JSON/TOML/YAML you wrote parses (`python3 -c "import json,sys; json.load(open(sys.argv[1]))" ...` or the repo's own tooling).
- AGENTS.md is within the size budget in `kb/context-files.md`.
- Any command you embedded in instructions or hooks was actually run once and worked.
- Run the repo's formatter over generated files if one exists.

### 7. Report

End with: files generated, per-tool coverage, any user overlays applied, KB entry used, contested KB choices made, anything deferred (e.g. "navigation index deferred — repo under threshold; re-run /harness-update when it grows"), and an ADVISORY section per `kb/agent-friendly-code.md` naming the highest-leverage repo improvements outside the harness itself (e.g. missing tests, slow checks) — recommendations only, never applied.
