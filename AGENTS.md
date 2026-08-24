# meta-harness — agent instructions

This repo is a Claude Code plugin: three skills (`skills/*/SKILL.md`) plus the knowledge base (`kb/`) they read. `CLAUDE.md` is a symlink to this file.

## Layout

- `skills/harness-new/`, `skills/harness-update/`, `skills/harness-research/` — the skills. Orchestration logic lives here; best-practice CONTENT lives in `kb/`. Never duplicate KB content into a SKILL.md.
- `kb/` — the best-practices corpus. One topic per file, frontmatter with `reviewed:` date, claims cited inline as `(source URL, date)`. `kb/CHANGELOG.md` logs every refresh.
- `templates/` — file templates the generator fills in. Templates carry `{{placeholders}}`; anything repo-specific is decided at generation time, not baked in.

## Rules

- KB edits must come from verifiable sources with dates, or be explicitly marked as preference/heuristic. No uncited "best practices".
- When updating the KB, update `reviewed:` in the touched file's frontmatter and add an entry at the top of `kb/CHANGELOG.md` (newest-first) in the same change.
- The manifest schema (`.harness/manifest.json`, documented in `skills/harness-new/SKILL.md`) is a compatibility contract: `/harness-update` in the field depends on it. Extend it additively; never rename or repurpose existing fields.
- Keep skills lean: a SKILL.md is a procedure, not an essay. Push reference material into `kb/` or the skill's own `references/` dir.
