---
topic: mcp-and-tools
reviewed: 2026-09-02
---

# MCP and external-tool curation

Which integrations a generated harness wires in, and how. Governing principle: every tool must earn its context cost, and the cheapest good option wins — CLI first, then skills-with-scripts, then MCP.

## Context economics

- Tool definitions are expensive: a five-server setup cost ~55K tokens of definitions before any work; deferred tool loading cut that ~85% AND improved tool-selection accuracy (Opus 4: 49%→74% on MCP evals) (https://www.anthropic.com/engineering/advanced-tool-use, 2025-11-24). Presenting MCP as code APIs the agent loads on demand cut one workflow 150K→2K tokens (https://www.anthropic.com/engineering/code-execution-with-mcp, 2025-11-04).
- Claude Code ships tool search ON by default (schemas deferred, names only at startup), so the standing tax of extra servers is now low there — but 2025-era "GitHub MCP costs 23–50K tokens" measurements still apply to harnesses without deferral, and MCP OUTPUT is separately capped (25K default) (https://code.claude.com/docs/en/mcp, current).
- Anthropic thresholds: deferral matters above ~10K tokens of definitions / 10+ tools (https://www.anthropic.com/engineering/advanced-tool-use, 2025-11-24).

## CLI first — with the honest caveat

- Official guidance: "CLI tools are the most context-efficient way to interact with external services" — `gh` for GitHub, `sentry-cli`, `psql`; agents learn unknown CLIs from `--help` (https://code.claude.com/docs/en/best-practices, current). The AGENTS.md line "use foo --help to learn it" is free.
- The one controlled comparison found protocol choice matters LESS than tool design quality — a well-built CLI ≈ well-built MCP on success and cost (https://mariozechner.at/posts/2025-08-15-mcp-vs-cli/, 2025-08-15). So the rule is "don't add a server that duplicates a good CLI", not "MCP is bad".
- MCP is genuinely necessary for: OAuth'd remote services (Linear, official vendor servers with scope pinning), stateful sessions a CLI can't hold (live browser/DevTools), and push/event channels into sessions (https://code.claude.com/docs/en/mcp, current).

## Category verdicts (2026)

- **Browser/devtools: the strongest earn-their-keep category** — it closes the verify loop nothing else can. Even CLI-first advocates keep exactly this one. Options and wiring: runtime-feedback.md.
- **Docs servers** (context7-style): only for repos with framework-currency pain, and note the eval finding that an AGENTS.md docs index beats on-demand retrieval (see languages/typescript.md); context7 itself now ships CLI/skills modes (https://github.com/upstash/context7, current).
- **LSP bridges** (Serena etc.): being absorbed into harness-native code-intelligence plugins — prefer native plugins where the tool has them (see code-navigation.md).
- **Issue trackers**: official vendor OAuth servers where chat-with-tracker is actually part of the workflow; otherwise `gh`/CLI covers it.
- **DB access**: weak case — reference PostgreSQL server was archived; `psql` + a scoped read-only credential is the default [directional evidence].
- **Redundant by default**: filesystem/git servers (harness-native), anything with a first-class CLI.

## Wiring rules

- Project-shared servers in committed `.mcp.json`. Steered: first use of a project server prompts for interactive trust-gated approval. Autonomous: `claude -p`, Agent SDK, and cloud sessions "can't show that prompt: it loads project-scoped servers without asking" (https://code.claude.com/docs/en/mcp, fetched 2026-09-02); Cursor CLI `agent -p` likewise shares desktop MCP config with no headless gate (https://cursor.com/docs/cli/changelog, fetched 2026-09-02). Rule for autonomous: a committed `.mcp.json` is an implicit trust grant — only commit servers you would run unprompted, and use `disabledMcpjsonServers` for the rest, not just "awareness" of it. Pin OAuth scopes per server (`oauth.scopes`) — unset, Claude Code requests whatever scope the server advertises, which matters more in autonomous runs since no one sees the consent screen to notice over-broad scopes (v2.1.196+, same doc) (see security.md for the attack side).
- Untrusted content reaching MCP tool calls, autonomous, SINGLE-SOURCE (one research team, corroborated by several outlets citing the same disclosure): "Comment and Control" found Claude Code Security Review Action, Gemini CLI Action, and Copilot Agent all interpolated PR titles/issue bodies/comments unsanitized into the prompt while the CI subprocess inherited API keys/`GITHUB_TOKEN`/OIDC tokens with no tool restriction (https://labs.cloudsecurityalliance.org/research/csa-research-note-claude-code-github-action-prompt-injection/, 2026-06-05). Autonomous rules: run agent workflows holding no write credentials; require environment protection before agent output is acted on; scope tools with `--allowedTools`/`--disallowedTools`. Related: agentjacking via Sentry MCP DSN injection recovered 85% of tested credentials from interactive agents (https://labs.cloudsecurityalliance.org/research/csa-research-note-agentjacking-mcp-sentry-injection-20260612/, 2026-06-12) [single-source] — its mitigation (human approval before acting on MCP content) is absent by construction in autonomous runs.
- Scope tools: per-tool allowlists (`mcp__server__tool`), server `--toolsets`/read-only flags where offered (GitHub's server has both).
- Bundle MCP servers inside skills rather than globally where the harness supports it — tools stay hidden until the skill loads (https://ampcode.com/manual, current).
- Every emitted server gets one AGENTS.md line naming its purpose and when to use it [preference; mentions drive usage, see context-files.md].

## Maintenance reality

14 of the original reference servers are already archived (https://github.com/modelcontextprotocol/servers-archived, archived 2025-05-29), several replaced by official vendor servers (https://github.com/modelcontextprotocol/servers, 2026-08-24); spec majors land ~2x/year — the 2026-07-28 major deprecates Roots/Sampling/Logging and the legacy HTTP+SSE transport on a 12-month clock, so emitted servers on those get re-verified (https://blog.modelcontextprotocol.io/posts/2026-07-28/, 2026-07-28). Rules: prefer official vendor servers; pin versions (`.mcpb` bundles where available); expect churn — `/harness-update` re-verifies emitted servers still exist and are still the blessed option. Tool poisoning / "rug pull" — a tool's description or behavior silently changed after approval, with every session calling it inheriting the poisoned version — is the concrete "why" behind pinning; mitigation converges on version pinning, static scanning in CI, and signed/hashed tool definitions (https://labs.cloudsecurityalliance.org/research/csa-research-note-mcp-tool-poisoning-ai-agent-exfiltration-2/, 2026).

## Generator defaults

Emit per profile, not by habit: browser tool for web repos (runtime-feedback.md picks which), observability CLI/server only if the team uses that service, docs server only on demonstrated currency pain. Most repos correctly get ZERO project MCP servers and a handful of AGENTS.md CLI lines.
