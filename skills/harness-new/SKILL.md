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
- For PRD mode: extract product domain, planned stack, and explicit constraints.

### 2. Read the KB

Read every topic file in `${CLAUDE_PLUGIN_ROOT}/kb/` (skip CHANGELOG.md). Apply guidance conditionally on the repo profile — the KB states which practices are size- or stack-dependent. Where the KB marks something contested, pick the conservative option and note the choice in the generation report.

### 3. Plan, then generate

State a short plan (files to create, per-tool outputs) before writing. Then generate, using `${CLAUDE_PLUGIN_ROOT}/templates/` as starting points. Placeholder rule: every `{{placeholder}}` is either filled from the repo profile (commands verified runnable) or its line/section is deleted — a repo with no test suite gets no test line, not an invented one. Delete whole template sections the KB says this repo doesn't need. Typical composition (final say belongs to the KB):

- Canonical `AGENTS.md` + per-tool discovery files per `kb/harness-targets.md` (symlinks/pointers, per-directory files where the KB's size rules call for them).
- Docs/memory system per `kb/memory-and-docs.md`.
- Code navigation setup per `kb/code-navigation.md` for the measured size tier.
- Skills/commands/hooks/permissions per `kb/automation-surface.md` — only ones this repo's profile justifies; every hook command must be verified runnable before it's checked in.

### 4. Write the manifest and baseline

Write `.harness/manifest.json` in the target repo:

```json
{
  "metaHarnessVersion": "<from plugin.json>",
  "kbEntry": "<exact heading text of the newest kb/CHANGELOG.md entry>",
  "generatedAt": "<ISO date>",
  "profile": { "sizeTier": "...", "languages": ["..."], "targets": ["claude-code", "codex", "cursor", "pi"] },
  "files": { "<repo-relative path>": { "sha256": "<hash of generated content>" } }
}
```

- Record every file you created or modified EXCEPT anything under `.harness/` itself.
- Regular files: `shasum -a 256`. Symlinks: record `{ "symlink": "<readlink output>" }` instead of a hash.
- Copy each recorded regular file verbatim to `.harness/baseline/<repo-relative path>` — this is the merge base `/harness-update` needs to three-way merge hand-edited files. Add `.harness/baseline/` to the repo's ignore-for-agents surface if one exists (e.g. the settings deny list), not to .gitignore — the baseline should be committed with the harness.
- This schema is a compatibility contract with `/harness-update` — extend additively only.

### 5. Verify

- Symlinks resolve; JSON/TOML/YAML you wrote parses (`python3 -c "import json,sys; json.load(open(sys.argv[1]))" ...` or the repo's own tooling).
- AGENTS.md is within the size budget in `kb/context-files.md`.
- Any command you embedded in instructions or hooks was actually run once and worked.
- Run the repo's formatter over generated files if one exists.

### 6. Report

End with: files generated, per-tool coverage, KB date used, contested KB choices made, and anything deferred (e.g. "navigation index deferred — repo under threshold; re-run /harness-update when it grows").
