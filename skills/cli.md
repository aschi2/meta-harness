# Running the bundled CLI

Use `meta-harness <command>` when the installed CLI is on `PATH`.

If it is unavailable, resolve the plugin root and invoke the bundled command described by `bin.meta-harness` in that root's `package.json` with Bun. Pass `--no-env-file` and `--config=<plugin-root>/src/hook.bunfig.toml` before the command so the current repository's `.env` and `bunfig.toml` do not affect it. Do not hardcode the bin target; read it from package metadata.

In Claude Code plugin skills, `${CLAUDE_PLUGIN_ROOT}` expands to the plugin installation directory. In Codex, use the absolute path of the currently loaded `SKILL.md` and go up two directories from `skills/<skill-name>` to find the plugin root. Codex documents `${PLUGIN_ROOT}` for plugin hook commands, but does not document that substitution for skill instructions; do not assume it expands in a skill.

When a skill needs a bundled pack, schema or template, resolve its path from that same plugin root. Never use a development checkout path.

Verified 2026-11-03 against [Claude Code skill substitutions](https://code.claude.com/docs/en/skills) and [Codex plugin packaging](https://developers.openai.com/plugins/build/plugins).
