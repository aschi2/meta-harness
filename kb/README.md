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
