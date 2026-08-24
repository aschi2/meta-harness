# Knowledge base conventions

One topic per file. Each file:

```markdown
---
topic: <slug>
reviewed: <YYYY-MM-DD of last research pass>
---

# <Topic>

<Guidance, organized so a generator can apply it: concrete rules, with the
conditions under which each applies (repo size, stack, tool).>
```

Rules:

- Every non-obvious claim cites its source inline: `(URL, date)`. Uncited statements are allowed only when explicitly labeled `[preference]` (a deliberate opinion, not research) or `[heuristic]` (works in practice, no strong source).
- Contested guidance is presented as contested, with both positions and a stated default.
- Superseded guidance is deleted, not struck through — git history is the archive. The deletion is logged in CHANGELOG.md.
- Every KB change updates the touched file's `reviewed:` date and adds an entry at the top of `CHANGELOG.md` (newest-first) in the same change.

Topic files:

- `context-files.md` — authoring AGENTS.md/CLAUDE.md/rules files
- `memory-and-docs.md` — memory systems and documentation-for-agents
- `code-navigation.md` — navigation/lookup by codebase size
- `automation-surface.md` — skills, commands, hooks, subagents, permissions, verification loops
- `harness-targets.md` — per-tool config surfaces and cross-tool compatibility
- `spec-and-planning.md` — spec/plan workflows and PRD-mode sequencing
- `agent-friendly-code.md` — code/stack properties that help agents; advisory guidance
- `security.md` — defensive defaults: injection, supply chain, secrets, sandbox, CI gates
- `team-workflows.md` — PR conventions, review structure, CI gates, config distribution
- `harness-evals.md` — measuring whether harness changes help; proxies and noise
- `testing-strategy.md` — anti-test-gaming, agent-written test quality, test tiers, TDD
- `runtime-feedback.md` — logs, browser loops, debuggers: how agents see running code
- `autonomous-operation.md` — scaffolding for unattended runs, loops, parallelism, containment
- `mcp-and-tools.md` — which external tools earn their context cost; CLI-first wiring
- `model-routing.md` — model/effort tiering; the small repo-level routing surface

`languages/` holds per-language playbooks (`python.md`, `typescript.md`, `go.md`, `rust.md`, `cpp.md`) and `archetypes/` holds per-project-type playbooks (`web-app.md`, `mobile.md`, `data-ml.md`, `cli-library.md`, `services-infra.md`), all with the same file conventions. Generators read only the ones matching the target repo's profile (a repo can match several archetypes); a language or type without a file just gets the general topics.
