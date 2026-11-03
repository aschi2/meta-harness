---
topic: harness-targets
reviewed: 2026-09-02
---

# Harness targets: per-tool emission rules

What files the generator emits per targeted tool. Default target set: Claude Code, Codex, Cursor, pi. Full-file verification against official docs 2026-08-24, with the Codex skills bullet re-verified 2026-08-29; tool config surfaces drift fast, so `/harness-research` re-verifies this file before other topics.

## Instructions: one canonical AGENTS.md

- `AGENTS.md` at repo root is canonical (Agentic AI Foundation standard, https://agents.md/, current). Read natively by Codex, Cursor, and pi; Claude Code is the holdout (https://code.claude.com/docs/en/memory, current).
- **Claude Code shim**: `ln -s AGENTS.md CLAUDE.md`; on Windows emit a CLAUDE.md containing `@AGENTS.md` instead (symlinks need admin). Claude-specific additions go below the import line in the import form, or in `.claude/rules/` files.
- **Claude Code `/import`** (v2.1.213+): one-time copies AGENTS.md content into CLAUDE.md, plus MCP servers, commands, subagents, and skills from another agent's config. A copy drifts from the source it was taken from; keep the symlink/`@AGENTS.md` shim as the default and note `/import` exists as an alternative for teams that want a one-time copy instead (https://code.claude.com/docs/en/memory, current). `CLAUDE_CODE_NEW_INIT=1 claude /init` additionally harvests `AGENTS.md`, `.devin/rules/`, `.windsurf/rules/`, and `.clinerules` when regenerating from an existing multi-tool repo (same doc).
- **Codex**: reads `AGENTS.md` from git root down to cwd, closest wins; 32 KiB default cap via `project_doc_max_bytes` gates the combined concatenated chain, not each file individually — Codex skips empty files and stops adding files once the combined size reaches the limit (https://learn.chatgpt.com/docs/agent-configuration/agents-md, fetched 2026-09-02) — nothing extra to emit.
- **Cursor**: reads root and nested AGENTS.md natively; `.cursor/rules/*.mdc` only for glob-scoped rules (frontmatter `globs` + auto-attach) when path-conditional guidance is needed (https://cursor.com/docs/context/rules, current).
- **pi**: reads AGENTS.md (and CLAUDE.md) walking parent dirs down; `.pi/` config is trust-gated — nothing extra to emit (https://github.com/badlogic/pi-mono coding-agent README, 2026-08-24).
- Monorepos: nested AGENTS.md per package; every tool in the target set honors closest-wins nesting. Emit the CLAUDE.md symlink only at levels that have an AGENTS.md.

## Skills: shared directory + symlink shim

- Agent Skills standard (https://agentskills.io/specification, current) is supported by all four targets.
- **Cross-tool repos**: skills live in `.agents/skills/<name>/SKILL.md` — read natively by Codex, Cursor, and pi. Codex scans `.agents/skills` in every directory from the cwd up to the repo root, plus `$HOME/.agents/skills` for user scope and `/etc/codex/skills` for system/admin scope (https://learn.chatgpt.com/docs/build-skills, 2026-08-29; admin path confirmed fetched 2026-09-02); confirmed empirically the same day on codex-cli 0.150.1, where a skill under a repo's `.agents/skills/` was enumerated by `codex exec` from that repo and absent from outside it. Cursor and pi remain doc-sourced and unverified here. Claude Code reads only `.claude/skills/` but supports symlinked skill dirs: emit `.claude/skills/<name>` → `../../.agents/skills/<name>` symlinks (https://code.claude.com/docs/en/skills, current). Use ONLY portable frontmatter (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`).
- **Claude-only repos**: `.claude/skills/` directly; Claude-specific frontmatter (`disable-model-invocation`, `paths`, `context`, hooks) allowed.

## Settings and per-tool config

- **Claude Code**: committed `.claude/settings.json` — permissions (allow/deny per automation-surface.md), hooks, `enabledPlugins` for LSP plugins, `claudeMdExcludes` for big monorepos. `.claude/settings.local.json` stays gitignored (auto-excluded).
- **Codex**: `.codex/config.toml` (loaded only for trusted projects) — sandbox/approval defaults per automation-surface.md. Verify current enum values against live docs at generation time; they drift.
- **Cursor**: `.cursorignore` mirroring the generated/vendored deny list (blocks agent access), `.cursorindexingignore` for index-only exclusions (https://cursor.com/docs/context/ignore-files, current). Hooks (`.cursor/hooks.json`) only if the team runs Cursor as primary.
- **pi**: `.pi/settings.json` only when there's something real to set; pi is deliberately minimal (no built-in MCP — CLI tools + skills preferred), so usually AGENTS.md + `.agents/skills/` covers it.

## Non-portable surfaces

- **Hooks did not converge** — four incompatible schemas. Generate hooks for the team's primary tool only (usually Claude Code); replicate must-happen gates as CI checks so other tools are still covered (see automation-surface.md). Mode split: steered — permission prompts are the pre-execution veto; hooks and CI are backup. Autonomous (`dontAsk`, `bypassPermissions`, `codex exec`) — there is no prompt, so hooks are the ONLY pre-execution veto and CI only catches damage after the fact; a non-primary tool with no hook support gets no veto at all in unattended runs (https://code.claude.com/docs/en/headless, current).
- **Subagents**: `.claude/agents/*.md` is the highest-leverage location — Cursor reads `.claude/agents/` for compatibility (https://cursor.com/docs/agent/subagents, current); Codex/pi don't consume it, acceptable for an optional surface. On a name collision across locations, `.cursor/agents/` wins over `.claude/agents/` or `.codex/agents/` (same doc, fetched 2026-09-02).
- **Memory**: per-tool native (Claude Code auto memory, Codex `features.memories`) — nothing to emit; shared cross-tool knowledge goes in docs/ (see memory-and-docs.md).
- **MCP**: project `.mcp.json` (Claude Code) and `.cursor/mcp.json` (Cursor) only when code-navigation.md tier rules call for an MCP tool; Codex MCP config is user-level TOML — document the server in AGENTS.md instead of emitting user config.

## Other tools

Copilot, Gemini CLI, Zed, Windsurf, Aider, Devin, Jules etc. all read AGENTS.md — the standard now lists 24 named tools and 60k+ adopting OSS projects (https://agents.md/, fetched 2026-09-02) — the canonical file covers them with no extra emission. Gemini CLI users may need `contextFileName` pointed at AGENTS.md; note it in the generation report only if the team uses Gemini [heuristic].

## Adding a target

A tool earns a place in the default set when it (a) has real adoption in the team, and (b) needs emission beyond AGENTS.md. Record its discovery rules here with primary-source citations before the generator emits anything for it.

Watch list (adoption bar not yet met — do not add to the default target set): **OpenCode** — ~199k GitHub stars, one industry survey reports ~7% developer adoption / 42% mindshare (https://blog.jetbrains.com/research/2026/08/ai-coding-agent-adoption-2026/, 2026-08); reads AGENTS.md natively, has its own `opencode.json`. **DeepSeek Harness (`dsh`)** — launched 2026-08-13; adoption evidence is GitHub star velocity only; reads both `AGENTS.md` and `CLAUDE.md` with content dedup, so the existing symlink shim is already safe for it if it's ever added (https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/config-catalog.md, fetched 2026-09-02). Both low-confidence.
