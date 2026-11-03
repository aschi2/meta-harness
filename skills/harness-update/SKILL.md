---
name: harness-update
description: Re-apply current best practices to an existing AI harness — upgrade AGENTS.md, memory/docs, navigation, skills/hooks to the latest knowledge base without clobbering hand edits. Use when the user asks to update, upgrade, refresh, or modernize a repo's harness/agent setup, or after /harness-research changes the KB.
---

# harness-update

Bring a repo's harness up to the current knowledge base. The unit of safety is the manifest: it records what meta-harness generated, so hand edits are detectable and never silently lost.

Validate the installed coding pack before proceeding (requires Bun):

```bash
bun run "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" validate "${CLAUDE_PLUGIN_ROOT}"
```

## Procedure

### 1. Load state

- Read `.harness/manifest.json` in the target repo (default: current working directory).
- **No manifest?** This is adopt mode: the existing harness (any AGENTS.md/CLAUDE.md/.cursor/.claude material) is a hand-written baseline. Run the `/harness-new` procedure, folding existing content in as it prescribes, and write a first manifest. Everything below assumes a manifest exists.
- Read `${CLAUDE_PLUGIN_ROOT}/packs/coding/kb/CHANGELOG.md` (newest-first). Find the manifest's `kbEntry` heading; every entry listed above it is in scope. (Older manifests may carry a `kbDate` instead — treat entries newer than that date as in scope.)

### 2. Re-profile

Re-run the profiling step from `/harness-new` (step 1). Size tier or stack may have crossed a KB threshold since generation — that alone can warrant changes even for KB topics that didn't move.

If the KB scope is empty AND the profile matches the manifest's, say so and stop — do not churn files to no effect. Otherwise read every KB topic file (as in `/harness-new` step 2): the changelog scopes the update, but the topic files are the rules you generate from.

### 3. Classify each manifest file

For every path in `manifest.files`, compare disk state to the manifest (regular files: `shasum -a 256` vs recorded hash; symlinks: `readlink` vs recorded target):

- **Unchanged** (matches): meta-harness owns it. Regenerate or patch freely per the updated KB.
- **Hand-edited** (differs): a human touched it. Three-way merge using `.harness/baseline/<path>` as the base (`diff3`, or manual merge from base→ours/base→theirs diffs): apply KB-driven changes that don't collide with the hand edits; where they collide, show the conflict as a diff and ask the user rather than guessing. Never discard a hand edit without an explicit decision. If the baseline copy is missing, treat the whole file as a conflict and ask.
- **Missing**: the user deleted it. Respect that — skip it, drop it from the manifest, and note it in the report. Do not resurrect deleted files.

New files the updated KB calls for (that the old KB didn't) are generated as in `/harness-new`.

### 3b. Re-apply machine setup

For every entry in `manifest.machineSetup`: this is configuration living OUTSIDE the repo, so a clone on a new machine will not have it. Re-run the entry's `rediscover` command on THIS machine, compare the result with what the `where` file currently grants, and offer to write it if absent or stale. Never carry values forward from the manifest — they were derived on whichever machine ran last, and a stale absolute path fails silently rather than loudly.

Ask before editing a user-level config; it is shared with the user's other projects. If a rediscover command no longer resolves, report it and change nothing rather than writing a guess.

Manifests written by v0.7.0 may carry `machineLocal` (an in-repo gitignored file) instead. Treat it as the same intent, and offer to move it repo-external.

### 4. Verify and re-manifest

Run the `/harness-new` verify step over everything touched. Rewrite `.harness/manifest.json` with fresh hashes, the new `kbEntry`, and the re-profiled `profile`, and refresh `.harness/baseline/` copies to match the new generated state.

Record the five-part file mapping and source pack versions as in `/harness-new` step 4, adding them when absent from an older manifest.

Carry `manifest.overlays` through verbatim. Overlay-written files are outside this plugin's ownership: they are absent from `files` and from the baseline, so they are never classified, merged, or deleted by this procedure. Do not re-run overlays here — `/harness-new` step 5 offers them, an update does not.

### 5. Report

End with: what changed and which KB changelog entries drove each change, hand-edit conflicts and how each was resolved, files skipped as deleted, and profile-threshold changes (e.g. "repo crossed the navigation-index threshold; index config added").
