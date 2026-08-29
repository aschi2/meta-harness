---
topic: harness-targets
reviewed: 2026-08-29
---

# Harness targets: per-tool emission rules

What files the generator emits per targeted tool. Default target set: Claude Code, Codex, Cursor, pi. Full-file verification against official docs 2026-08-24, with the Codex skills bullet re-verified 2026-08-29; tool config surfaces drift fast, so `/harness-research` re-verifies this file before other topics.

## Instructions: one canonical AGENTS.md

- `AGENTS.md` at repo root is canonical (Agentic AI Foundation standard, https://agents.md/, current). Read natively by Codex, Cursor, and pi; Claude Code is the holdout (https://code.claude.com/docs/en/memory, current).
- **Claude Code shim**: `ln -s AGENTS.md CLAUDE.md`; on Windows emit a CLAUDE.md containing `@AGENTS.md` instead (symlinks need admin). Claude-specific additions go below the import line in the import form, or in `.claude/rules/` files.
- **Codex**: reads `AGENTS.md` from git root down to cwd, closest wins; 32 KiB default cap via `project_doc_max_bytes` (sources differ on per-file vs combined — keep the total chain under it; see context-files.md) — nothing extra to emit (https://learn.chatgpt.com/docs/agent-configuration/agents-md, current).
- **Cursor**: reads root and nested AGENTS.md natively; `.cursor/rules/*.mdc` only for glob-scoped rules (frontmatter `globs` + auto-attach) when path-conditional guidance is needed (https://cursor.com/docs/context/rules, current).
- **pi**: reads AGENTS.md (and CLAUDE.md) walking parent dirs down; `.pi/` config is trust-gated — nothing extra to emit (https://github.com/badlogic/pi-mono coding-agent README, 2026-08-24).
- Monorepos: nested AGENTS.md per package; every tool in the target set honors closest-wins nesting. Emit the CLAUDE.md symlink only at levels that have an AGENTS.md.

## Skills: shared directory + symlink shim

- Agent Skills standard (https://agentskills.io/specification, current) is supported by all four targets.
- **Cross-tool repos**: skills live in `.agents/skills/<name>/SKILL.md` — read natively by Codex, Cursor, and pi. Codex scans `.agents/skills` in every directory from the cwd up to the repo root, plus `$HOME/.agents/skills` for user scope (https://learn.chatgpt.com/docs/build-skills, 2026-08-29); confirmed empirically the same day on codex-cli 0.150.1, where a skill under a repo's `.agents/skills/` was enumerated by `codex exec` from that repo and absent from outside it. Cursor and pi remain doc-sourced and unverified here. Claude Code reads only `.claude/skills/` but supports symlinked skill dirs: emit `.claude/skills/<name>` → `../../.agents/skills/<name>` symlinks (https://code.claude.com/docs/en/skills, current). Use ONLY portable frontmatter (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`).
- **Claude-only repos**: `.claude/skills/` directly; Claude-specific frontmatter (`disable-model-invocation`, `paths`, `context`, hooks) allowed.

## Settings and per-tool config

- **Claude Code**: committed `.claude/settings.json` — permissions (allow/deny per automation-surface.md), hooks, `enabledPlugins` for LSP plugins, `claudeMdExcludes` for big monorepos. `.claude/settings.local.json` stays gitignored (auto-excluded).
- **Codex**: `.codex/config.toml` (loaded only for trusted projects) — sandbox/approval defaults per automation-surface.md. Verify current enum values against live docs at generation time; they drift.
- **Cursor**: `.cursorignore` mirroring the generated/vendored deny list (blocks agent access), `.cursorindexingignore` for index-only exclusions (https://cursor.com/docs/context/ignore-files, current). Hooks (`.cursor/hooks.json`) only if the team runs Cursor as primary.
- **pi**: `.pi/settings.json` only when there's something real to set; pi is deliberately minimal (no built-in MCP — CLI tools + skills preferred), so usually AGENTS.md + `.agents/skills/` covers it.

## Non-portable surfaces

- **Hooks did not converge** — four incompatible schemas. Generate hooks for the team's primary tool only (usually Claude Code); replicate must-happen gates as CI checks so other tools are still covered (see automation-surface.md).
- **Subagents**: `.claude/agents/*.md` is the highest-leverage location — Cursor reads `.claude/agents/` for compatibility (https://cursor.com/docs/agent/subagents, current); Codex/pi don't consume it, acceptable for an optional surface.
- **Memory**: per-tool native (Claude Code auto memory, Codex `features.memories`) — nothing to emit; shared cross-tool knowledge goes in docs/ (see memory-and-docs.md).
- **MCP**: project `.mcp.json` (Claude Code) and `.cursor/mcp.json` (Cursor) only when code-navigation.md tier rules call for an MCP tool; Codex MCP config is user-level TOML — document the server in AGENTS.md instead of emitting user config.

## Other tools

Copilot, Gemini CLI, Zed, Windsurf, Aider, Devin, Jules etc. all read AGENTS.md (https://agents.md/, current) — the canonical file covers them with no extra emission. Gemini CLI users may need `contextFileName` pointed at AGENTS.md; note it in the generation report only if the team uses Gemini [heuristic].

## Adding a target

A tool earns a place in the default set when it (a) has real adoption in the team, and (b) needs emission beyond AGENTS.md. Record its discovery rules here with primary-source citations before the generator emits anything for it.
