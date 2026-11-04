# meta-harness — agent instructions

This repo contains a deterministic TypeScript core on Bun, domain packs, and a Claude Code plugin with five skills (`skills/*/SKILL.md`). `CLAUDE.md` is a symlink to this file.

## Layout

- `src/` — deterministic core and TypeBox schema source; `schemas/` — generated JSON Schemas (`bun run schemas`); `test/` — Bun tests and broken fixtures.
- `packs/coding/`, `packs/knowledge-wiki/`, `packs/coaching/` — domain packs; `packs/base/` — implicitly included domain-neutral roles and scheduler recipes. Paths inside packs are pack-relative.

- `skills/harness-new/`, `skills/harness-update/`, `skills/harness-research/`, `skills/harness-maintenance/`, `skills/harness-learn/` — the skills. Orchestration logic lives here; best-practice CONTENT lives in `packs/coding/kb/`. Never duplicate KB content into a SKILL.md.
- `packs/coding/kb/` — the best-practices corpus. One topic per file, frontmatter with `reviewed:` date, claims cited inline as `(source URL, date)`. `packs/coding/kb/CHANGELOG.md` logs every refresh.
- `packs/coding/templates/` — file templates the generator fills in. Templates carry `{{placeholders}}`; anything repo-specific is decided at generation time, not baked in.

## Rules

- KB edits must come from verifiable sources with dates, or be explicitly marked as preference/heuristic. No uncited "best practices".
- When updating the KB, update `reviewed:` in the touched file's frontmatter and add an entry at the top of `packs/coding/kb/CHANGELOG.md` (newest-first) in the same change.
- The manifest schema (`.harness/manifest.json`, defined in `src/schema.ts` and published under `schemas/`) is a compatibility contract: `/harness-update` in the field depends on it. Extend it additively; never rename or repurpose existing fields.
- Keep skills lean: a SKILL.md is a procedure, not an essay. Push reference material into `packs/coding/kb/` or the skill's own `references/` dir.

## Verification

Run `bun install`, then `bun run typecheck`, `bun test`, and `bun run src/cli.ts validate .`. The validator searches the repository's `packs/` directory; an explicit pack directory or packs directory is also accepted.
