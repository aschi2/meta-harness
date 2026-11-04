---
name: harness-update
description: Interview and re-profile an existing harness, write a tailored update plan, and apply it through the meta-harness core while preserving user edits. Use to update, refresh, or modernize agent setup.
---

# harness-update

The agent decides what should change and writes the plan; the core owns classification, merging, file writes, hashes and baselines.

## 1. Understand the change

Read the target's `.harness/manifest.json`, current harness files and the bundled `packs/coding/kb/CHANGELOG.md`. Find entries above `kbEntry` (or newer than legacy `kbDate`). No manifest: use `/harness-new` to adopt existing material explicitly.

Re-profile as in `/harness-new`: stack, size, commands, target tools, existing conventions and PRD constraints. Interview only for missing decisions. If knowledge and profile are unchanged and the user requested no change, report that without applying a plan.

Read current `packs/coding/kb/` topics and matching `packs/coding/kb/languages/*.md` and `packs/coding/kb/archetypes/*.md`. Judge which changes apply; explain contested choices and preserve tailored user intent.

## 2. Write the new plan

Use the bundled `schemas/plan.schema.json` and the coding pack's `packs/coding/profile.schema.json`. Include the source `pack`, current `profile`, tailored `files` and `symlinks`, with each entry's five-part membership. Supply full desired generator content rather than editing target files yourself. Templates and variables follow `/harness-new`.

Review the proposed changes with the user when requirements are ambiguous. Do not copy machine-specific paths from old manifests. Preserve the external ownership of overlays and machine setup; these are not target files to regenerate.

Omitted managed paths remain untouched and tracked. User-deleted paths remain absent across later updates. New paths that collide with untracked files require deliberate `adopted: true` after reading them.

## 3. Apply and review

```bash
meta-harness update --plan "<new-plan.json>" --target "<target-dir>"
meta-harness check --target "<target-dir>"
```

If `meta-harness` is not on `PATH`, use the bundled CLI procedure in [CLI access](../cli.md). Resolve the plugin root as documented there; do not call a development source path directly.

The core classifies files and uses `git merge-file` for three-way text merges. Review its report and resulting artifacts. A conflict returns non-zero and writes markers for text conflicts; stop and present the conflict for a user decision. Do not silently resolve it or manually alter manifests/baselines. Feed the user's resolution into a revised plan; symlink/type conflicts are left untouched.

Report changed files, KB entries behind them, preserved deletions, conflicts, profile changes and check results. Do not re-run private overlays or modify shared machine configuration.
