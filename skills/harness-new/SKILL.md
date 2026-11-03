---
name: harness-new
description: Interview the user and plan a tailored agent harness for a repo or PRD, then apply it through the meta-harness core. Use for creating, adopting, or bootstrapping a harness, AGENTS.md/CLAUDE.md, or agent setup.
---

# harness-new

The agent interviews and writes tailored prose; the core performs every target file operation. Current domain: coding. Read `${CLAUDE_PLUGIN_ROOT}/packs/coding/pack.json` and its knowledge at runtime rather than generating from memory.

## 1. Interview and profile

- Identify the target directory, existing code or PRD, intended agent tools, and user constraints. Default tools come from `packs/coding/kb/harness-targets.md`; confirm preferences where they matter.
- Inspect languages, frameworks, package managers, monorepo structure, source counts and LOC. Apply `packs/coding/kb/code-navigation.md` size rules, including structure over count.
- Discover formatter, linter, typechecker, tests and CI; verify every command proposed for instructions or hooks. Do not invent commands for a PRD-only repo.
- Read existing instructions, docs and tool config. Preserve still-true content in the plan; explain any proposed removal. Existing target files require explicit `adopted: true` in the plan.
- Discover toolchain/cache paths with commands on this machine. Never copy machine-specific values from another repo. Report necessary user-level configuration separately; this CLI only writes inside the target.
- For PRDs, extract domain, planned stack and constraints; use `packs/coding/kb/spec-and-planning.md` and `packs/coding/kb/agent-friendly-code.md` for sequencing.

## 2. Tailor the plan

Read top-level topics in `packs/coding/kb/` plus matching `packs/coding/kb/languages/*.md` and `packs/coding/kb/archetypes/*.md`. Apply conditional guidance and identify contested choices. The coding profile must match `packs/coding/profile.schema.json`; additional profile details are allowed.

Write a JSON plan conforming to `${CLAUDE_PLUGIN_ROOT}/schemas/plan.schema.json`:

- `pack`: `coding`; `profile`: the discovered profile.
- `files`: entries with `path`, `parts` (one or more of context, knowledge, actions, checks, loop), and either `content` or `template` plus string `variables`. Templates must be declared in the pack; paths are target-relative, template paths are pack-relative. Tailor prose; fill every placeholder or use inline content with unnecessary sections removed.
- `symlinks`: entries with `path`, relative `target`, and `parts`. Canonical instructions remain AGENTS.md with tool discovery shims per the KB.
- `adopted: true`: only on entries intentionally replacing existing files after their content was considered. Never use it to bypass an unexplained collision.

Keep instructions within KB budgets. Add notes only when requested or already present, with the file, read-when pointer and consolidation action together (`packs/coding/kb/memory-and-docs.md`). Include only justified hooks, skills and navigation. State the planned files and tailoring decisions before applying.

## 3. Apply and review

```bash
bun run "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" init --pack coding --plan "<plan.json>" --target "<target-dir>"
bun run "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" check --target "<target-dir>"
```

Review the report and generated artifacts. On refusal, correct the plan or ask about the specific collision; do not manually write, hash, baseline, merge or symlink target files. Private overlays and repo-external setup are outside this command's ownership; report them without executing them.

Report files, tool coverage, pack version, KB choices, verification results and deferred work. Recommend repo improvements from `packs/coding/kb/agent-friendly-code.md` without implementing them.
