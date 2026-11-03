---
name: harness-new
description: Interview the user and plan a tailored agent harness for a domain, project or knowledge workspace, then apply it through the meta-harness core. Use for creating, adopting, or bootstrapping a harness, AGENTS.md/CLAUDE.md, or agent setup.
---

# harness-new

The agent interviews and writes tailored prose; the core performs every target file operation. Select the domain pack with the user, then read its manifest, profile schema and knowledge at runtime rather than generating from memory. A target may contain sources, coaching records, code, or no existing files.

## 1. Select a pack and interview

- Ask what the harness should help with, which directory it will manage, what already exists, and what must remain private or immutable. Inspect available `packs/*/pack.json` manifests. Choose `knowledge-wiki` for source-grounded knowledge work, `coaching` for goals and bounded practice plans, or `coding` for software work. The base maintenance pack is implicit. Do not select coding merely because the target is a Git repository.
- Read the selected pack's `profileSchema`, templates, knowledge and checker contracts. Ask for its required profile fields; do not invent missing values. For a wiki, confirm topic, source types, ingest cadence and edit approval. For coaching, confirm goals, limits, equipment by location, tracking tool and user/clinician-supplied exclusions. Only the owner supplies the library and precaution tags; do not infer health precautions or clearance.
- Read existing instructions and workflow descriptions before planning. Preserve still-true content; ask about conflicts, sensitive sources and external services. Inspect only authorized material. Do not copy source archives or private records into the meta-harness repository.

### Coding-specific discovery (only when coding was selected)

- Identify the target directory, existing code or PRD, intended agent tools, and user constraints. Default tools come from `packs/coding/kb/harness-targets.md`; confirm preferences where they matter.
- Inspect languages, frameworks, package managers, monorepo structure, source counts and LOC. Apply `packs/coding/kb/code-navigation.md` size rules, including structure over count.
- Discover formatter, linter, typechecker, tests and CI; verify every command proposed for instructions or hooks. Do not invent commands for a PRD-only repo.
- Read existing instructions, docs and tool config. Preserve still-true content in the plan; explain any proposed removal. Existing target files require explicit `adopted: true` in the plan.
- Discover toolchain/cache paths with commands on this machine. Never copy machine-specific values from another repo. Report necessary user-level configuration separately; this CLI only writes inside the target.
- For PRDs, extract domain, planned stack and constraints; use `packs/coding/kb/spec-and-planning.md` and `packs/coding/kb/agent-friendly-code.md` for sequencing.

## 2. Tailor the plan

Read the selected pack's declared knowledge, templates and formats. For coding only, include matching topics in `packs/coding/kb/`, `packs/coding/kb/languages/*.md` and `packs/coding/kb/archetypes/*.md`. Apply conditional guidance and identify contested choices. Every profile must match its pack's declared schema.

Write a JSON plan conforming to `${CLAUDE_PLUGIN_ROOT}/schemas/plan.schema.json`:

- `pack`: the selected pack name; `profile`: the discovered profile validated against that pack's profile schema.
- `files`: entries with `path`, `parts` (one or more of context, knowledge, actions, checks, loop), a `mode` (`managed`, `seed`, or `owner`), and either `content` or `template` plus string `variables`. Templates must be declared in the pack; paths are target-relative, template paths are pack-relative. Tailor prose; fill every placeholder or use inline content with unnecessary sections removed.
- `symlinks`: entries with `path`, relative `target`, and `parts`. Canonical instructions remain AGENTS.md, with CLAUDE.md as its symlink when that tool is selected.
- Use `managed` for generator instructions such as coding AGENTS.md: edits are reported and merged on update, not failed as drift. Use `seed` for workflow plans, logs and wiki pages: init writes them once, then the workflow owns them. Use `owner` for constraints such as profile.json and the coaching library: changes fail check until the owner runs `meta-harness approve <path>`. Packs force their declared owner paths into owner mode and maintenance protects them. Legacy plans without a mode default to managed.
- `adopted: true`: only on entries intentionally replacing existing files after their content was considered. Never use it to bypass an unexplained collision.

Keep instructions within the selected tool's budgets. Include only justified actions, checks and navigation. For wiki work, preserve immutable sources and the chosen edit-approval policy. For coaching, preserve owner/clinician precautions and the owner-controlled library. If those inputs are missing, request them rather than creating a real plan or safety library. State the planned files and tailoring decisions before applying.

## 3. Apply and review

```bash
bun run "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" init --pack "<selected-pack>" --plan "<plan.json>" --target "<target-dir>"
bun run "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" check --target "<target-dir>"
```

Review the report and generated artifacts. On refusal, correct the plan or ask about the specific collision; do not manually write, hash, baseline, merge or symlink target files. Private overlays and repo-external setup are outside this command's ownership; report them without executing them.

Report files, tool coverage, pack version, knowledge choices, verification results and deferred work. Domain-specific improvements remain recommendations unless separately requested.
