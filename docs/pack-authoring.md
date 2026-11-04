# Author a pack

A pack adds domain knowledge and generated files without changing the deterministic core. Packs live in `packs/<name>/`; paths in `pack.json` are relative to that directory. `packs/base` is included in every harness. An overlay pack is a normal pack with `"overlay": true`, stored in the user's overlay directory rather than this repository.

## Layout

```text
packs/example/
  pack.json
  profile.schema.json
  kb/                    # curated guidance and CHANGELOG.md
  templates/             # optional generated-file templates
  checkers/              # optional deterministic checks
  maintenance/           # optional role Markdown files
```

`pack.json` is validated against [schemas/pack.schema.json](../schemas/pack.schema.json). Required fields are `name` (lowercase slug), `version` (semantic version), `domain`, `description`, `parts`, `knowledge`, `templates`, `checkers`, `profileSchema`, and `researchTopics`. `parts` lists the supplied harness parts: `context`, `knowledge`, `actions`, `checks`, and `loop`. `profileSchema` points to a JSON Schema that validates the pack's profile object.

Optional fields include `changelog`; `maintenance` (role Markdown files); `ownerPaths` (owner-controlled paths); `commandRules`, `codeRules`, and `ruleTests`; `preferences` for overlay defaults; `targetsField` and `instructionBudgets` for tool-specific instruction limits. An overlay pack must set `overlay: true`. See the built-in manifests for complete examples.

## Files and modes

Plans name each output file, its content or declared template and variables, the harness parts it belongs to, and its mode. Templates must appear in `templates` in the manifest.

- `managed`: generator-owned. Drift is reported, then reconciled by update with a three-way merge.
- `seed`: initialized once and then owned by the workflow. It is not drift-tracked.
- `owner`: owner-controlled constraints. Changed files fail check until the owner approves them with `meta-harness approve <path> --target <dir>`.

Declare constraints such as a profile or user-maintained library in `ownerPaths`; this forces owner mode and protects those paths from maintenance runs. Use managed mode for generated instructions, including `AGENTS.md`, so owner edits can be merged. Use seed mode for evolving pages, logs, plans, and session records.

## Checkers

Checkers are listed in `checkers` and run by `meta-harness check` in the harness target directory. Prefer TypeScript for cross-platform checks; it runs through Bun. A checker should validate deterministic conditions, print a concise result, and exit non-zero on failure. Do not rely on a shell or undeclared tools. Pack checker files must be regular files, not symlinks. For example, `packs/knowledge-wiki/checkers/wiki-lint.ts` validates page metadata, provenance, links, ordering, and source immutability.

## Maintenance roles

Each file in `maintenance` contains YAML frontmatter followed by the role prompt as Markdown. Frontmatter follows [schemas/role.schema.json](../schemas/role.schema.json): `id`, `title`, one-line `job`, `defaultCadence`, per-run PR and changed-line limits, `requiredEvidence`, `neverDo`, `requires`, fixed `review: pull-request`, and source URLs. Keep the prompt within that role's limits, require tests and reviewable evidence, and make it open no PR when no qualifying work exists. Scheduler setup remains the user's choice; cadence is informational.

## Research topics

Every `researchTopics` entry has a pack-relative `path` and a valid `reviewed` date in `YYYY-MM-DD` form. The path must be listed as knowledge and its file must carry the same reviewed date in frontmatter. Cite claims to primary sources; label heuristics and preferences. Update the pack changelog when refreshing its knowledge.

## Validate and contribute

Run validation from a checkout with Bun installed:

```sh
bun install
bun run src/cli.ts validate .
bun run typecheck
bun test
```

Validation checks every pack manifest, declared file, profile schema, role, and research date. Add synthetic fixtures and tests for new checker behavior. Keep private overlays, user records, machine paths, and credentials out of the repository. Open a pull request with the pack, tests, and cited knowledge; do not change core behavior unless the new domain exposes a missing general capability.
