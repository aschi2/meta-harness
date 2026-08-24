---
topic: automation-surface
reviewed: 2026-08-24
---

# Automation surface: skills, hooks, subagents, permissions, verification

What executable/config machinery a generated harness includes. Governing principle: instructions are advisory, hooks are deterministic, and the highest-value single addition is a pass/fail verification check (https://code.claude.com/docs/en/best-practices, current).

## Skills

- Create a skill when instructions are a PROCEDURE used sometimes (a checklist, a multi-step workflow, something repeatedly pasted into chat); facts and always-on conventions stay in AGENTS.md (https://code.claude.com/docs/en/skills, current). Reference material goes in skill supporting files, loaded on demand.
- The Agent Skills format (SKILL.md + optional scripts/references/assets) is an open standard (https://agentskills.io/specification, current) supported by Claude Code, Codex, Cursor, pi, Copilot, Gemini CLI, and ~40 more tools — generated skills are cross-tool assets. Placement per tool is in harness-targets.md.
- Spec essentials the generator must follow: `name` (lowercase-hyphen, matches dir name) + `description` (what it does AND when to use it, keyword-rich, key use case first — trigger reliability lives or dies on the description); body under 500 lines / ~5k tokens; file references one level deep; only the spec's six frontmatter fields are portable — Claude-specific fields (`disable-model-invocation`, `context`, `paths`, hooks) break portability, use them only in Claude-only repos.
- Side-effect workflows (deploy, release, commit) get `disable-model-invocation: true` in Claude-only repos so only the user triggers them (https://code.claude.com/docs/en/skills, current); in cross-tool repos, state the same restriction in the skill body.
- Scripts for deterministic operations, prose for judgment; add scripts only where they improve reliability (https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills, 2025-10-16).
- Caution: skills can fail to trigger — for always-needed knowledge prefer the AGENTS.md pointer index (see context-files.md, Vercel eval).
- Generate few skills. Candidates that earn a skill in most repos: a "run/launch the app" recipe, a deploy/release procedure, a domain workflow with 3+ non-obvious steps. Everything else starts as an AGENTS.md line [heuristic].

## Hooks

- Use hooks for actions that must happen every time with zero exceptions; if the agent already reliably follows a written rule, delete the rule or make it a hook (https://code.claude.com/docs/en/best-practices, current).
- The proven starter set (generate only those matching the repo's actual tooling):
  1. Format-on-edit: PostToolUse on Edit|Write → run the repo's formatter on the touched file (https://code.claude.com/docs/en/plugins, current).
  2. Dangerous-command block: PreToolUse on Bash denying destructive patterns (force-push, rm -rf outside the repo, prod credentials, migrations dirs) — evaluated even under permission-bypass modes (https://code.claude.com/docs/en/hooks, current). Skip if an equivalent guard (e.g. a safety-net plugin) is already installed.
  3. Stop gate: run the cheap check suite (typecheck/lint/fast tests) on Stop, exit 2 blocks the turn ending until it passes (auto-overridden after 8 consecutive blocks) (https://code.claude.com/docs/en/best-practices, current).
- Mechanics the generator must get right: exit code 2 blocks, exit 1 does NOT; narrow matchers + `if:` conditions so hooks don't spawn processes on every tool call; explicit timeouts; `async: true` for expensive non-blocking post-hooks (https://code.claude.com/docs/en/hooks, current).
- Hooks execute arbitrary code — keep generated hooks short, readable, dependency-free shell; anything complex becomes a checked-in script the hook calls [preference].
- Hooks are Claude Code-specific (Codex's hooks feature is immature as of 2026) — for cross-tool repos, duplicate must-happen behaviors as CI checks so other tools' output is still gated (see Verification).

## Subagents

- Define a project subagent (`.claude/agents/`, checked in) only when it's coupled to the codebase and repeatedly needed: a reviewer that knows repo conventions, a test-writer for the repo's framework (https://claude.com/blog/subagents-in-claude-code, 2026-04-07). Description states trigger conditions, not capabilities.
- Delegation that verifiably helps: read-only parallel research/exploration (context isolation; Anthropic's parallel research system +90.2% over single-agent, at ~15x tokens — https://www.anthropic.com/engineering/built-multi-agent-research-system, 2025-06) and fresh-context adversarial review of a diff. Never parallel writers to shared state — conflicting implicit decisions produce incoherent results (https://cognition.com/blog/dont-build-multi-agents, 2025-06-12). The two sources agree on close read: parallelize reads, single-thread writes.
- Review-subagent prompt must scope to correctness/requirement gaps only — an open-ended "find issues" reviewer invents findings (https://code.claude.com/docs/en/best-practices, current).
- Default: generate at most one subagent (a repo-conventions reviewer) and only for repos with real review conventions to encode [heuristic].

## Permissions and sandboxing

- Committed `.claude/settings.json` = team policy; `settings.local.json` (gitignored) = personal. Evaluation: deny > ask > allow, first match wins; deny rules have no exceptions, so allowlists can be generous when deny is the safety net (https://code.claude.com/docs/en/permissions, current).
- Generate: an allowlist of the repo's verified safe read/build/test commands (test runner, linter, formatter, git status/diff), deny rules for secrets paths (`.env*`, key material) and Read of generated/vendored dirs (also a navigation win, see code-navigation.md). Promote repeatedly-approved commands to allow rules over time — encode that as a maintenance note, not more upfront rules.
- Codex: repos can carry `.codex/config.toml`; secure default `sandbox_mode = "workspace-write"` + `approval_policy = "on-request"` (https://developers.openai.com/codex/concepts/sandboxing, current). Verify the current enum values against live docs at generation time — they drift between versions.
- Never generate permission-bypass settings or auto-approve-everything profiles.

## Verification loops

- "Give the agent a way to verify its work" is the top-ranked practice: something that produces pass/fail closes the loop; require evidence (test output, command + result), not assertions (https://code.claude.com/docs/en/best-practices, current). Verification classes ranked: rules-based (tests/typecheck/lint — most robust) > visual (screenshots for UI) > LLM-as-judge (least robust) (https://claude.com/blog/building-agents-with-the-claude-agent-sdk, 2025-09-29).
- Encode definition-of-done in this order: (1) AGENTS.md states the exact verify commands and "run before declaring done"; (2) Stop-gate hook for the cheap checks (Claude Code); (3) CI as the harness-independent backstop — headless review/checks on PR (claude -p / codex exec / Codex GitHub review integration) for teams already using CI.
- A repo without tests gets an AGENTS.md rule that new code ships with a minimal runnable check, not a generated test framework [preference].

## Distribution

- Harness pieces live in the repo (`.claude/`, `.agents/`, AGENTS.md) — versioned with the code they describe. Convert to a plugin only when sharing across repos/teams (official decision rule, https://code.claude.com/docs/en/plugins, current).
- Prefer CLI tools and skills over MCP servers for context cost; MCP only for live external services (https://code.claude.com/docs/en/best-practices, current; tool-definition overhead evidence: https://www.anthropic.com/engineering/code-execution-with-mcp, 2025-11).
