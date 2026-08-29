---
topic: memory-and-docs
reviewed: 2026-08-29
---

# Memory and documentation systems

Rules for what memory/docs infrastructure a generated harness sets up. Memory verifiably helps: GitHub Copilot's production A/B showed +7pt PR merge rate with memory enabled (p<0.00001) (https://github.blog/ai-and-ml/github-copilot/building-an-agentic-memory-system-for-github-copilot/, 2026-01-15); Anthropic measured +39% on agentic search from memory + context editing (https://claude.com/blog/context-management, 2025-09-29).

## Memory: plain files win

- Plain-markdown filesystem memory is the proven baseline; specialized vector/graph memory stores are unnecessary for coding agents. Letta benchmarked filesystem memory + grep retrieval at 74.0% on LoCoMo vs Mem0's 68.5% graph variant (https://www.letta.com/blog/benchmarking-ai-agent-memory/, 2025-08-12). Vector/graph memory claims come mainly from vendors benchmarking their own products on conversational (not coding) workloads — do not generate that infrastructure.
- The proven shape: an index file (one line per memory) + one topic file per fact, retrieved on demand. Claude Code's auto memory caps index loading at 200 lines / 25KB (https://code.claude.com/docs/en/memory, current). Generator: prefer each tool's NATIVE memory (Claude Code auto memory needs no setup) and only add a checked-in memory dir for cross-tool teams.
- Memory entries should be typed (user/feedback/project/reference), timestamped, and — best documented design — carry citations to code locations that agents verify just-in-time before trusting; citation-verified memory pools self-healed even against deliberately seeded false memories (GitHub, 2026-01-15). Generated memory conventions must require absolute dates (relative dates rot) and forbid storing anything derivable from code or already in AGENTS.md.
- Hygiene rules to encode: add a memory when the same mistake happens a second time (https://code.claude.com/docs/en/best-practices, current); delete contradicted memories rather than accumulating; keep memory human-auditable plain markdown.

## The four-way split (what lives where)

Consensus split (https://code.claude.com/docs/en/memory + /best-practices, current; mirrored by Codex docs):

1. **AGENTS.md** — human-written standing instructions loaded every session (see context-files.md).
2. **Memory** — agent-written learnings: corrections, preferences, confirmed approaches, context not derivable from code or git history.
3. **Skills / path-scoped rules** — conditional knowledge loaded on demand (see automation-surface.md).
4. **Regular docs** (docs/, ADRs, README) — durable truth retrieved just-in-time via search; instruction files point at docs, never contain them (https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents, 2025-09-29).

Working state (plans, progress logs, feature lists) is a fifth category: per-task files in the repo/worktree, not memory and not AGENTS.md.

## Consolidated experience (the notes layer)

A sixth artifact: one consolidated-learnings file (`docs/agent-notes.md`, template in `templates/agent-notes.md.template`), kept separate from raw session history and from the instruction files. The three-layer separation — immutable raw sources, an LLM-maintained markdown layer compiled from them, and the instructions themselves — is Karpathy's LLM Wiki design (https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f, 2026-04-04); WikiSkill benchmarked a skill-evolution loop built on it, improving over no-skill baselines in most model-benchmark settings across 5 models and 5 benchmarks (https://arxiv.org/abs/2608.27454, 2026-08-27). Collapsing it to a single file is this KB's simplification, not the paper's — WikiSkill's wiki is an index plus a directory of pattern pages [preference].

**Trigger — opt-in, never inferred.** Generate it when the user asks for it, or when the repo already has such a file to adopt. "This repo will do a lot of agent work" is not profileable at generation time; do not guess it from size or activity. Every other repo gets the capture line pointing at whatever memory or docs surface it does have, and no new file.

**Emit it only together with its consolidation procedure.** A notes file that is only ever appended to is the multi-file memory bank this KB bans, wearing one filename: same agent-authored truth, same conflicts, same staleness, no discipline. The consolidation pass (merge duplicates, mark superseded entries, propose promotions) is what makes it different, so if the repo won't run that pass, don't generate the file [heuristic].

- **Do not load it every session.** AGENTS.md points at it with a "read it when" condition; never inline it. The load-bearing reason is the measured cost of agent-written context in instruction files (see context-files.md: ~−3% task success, >+20% cost). WikiSkill points the same direction from a different setting — letting the agent that produced its training rollouts also read the accumulated wiki yielded *worse* skills out of the loop (63.7% without that access vs 60.9% with it) — but that measured skill quality inside an evolution loop, not repo-task performance, so treat it as directional only (https://arxiv.org/abs/2608.27454, 2026-08-27).
- **Append-mostly.** Entries survive the revert of whatever they motivated — that is what stops the same wrong turn being retaken, and it is the one structural rule WikiSkill states outright, keeping its wiki when a proposed skill edit is rejected (https://arxiv.org/abs/2608.27454, 2026-08-27). Editing an entry to correct it is fine; deleting one because the code moved is not — mark it superseded and name what replaced it [heuristic].
- **Promotion is the point.** A pattern that recurs gets proposed for promotion into AGENTS.md or a skill, and the promotion records which entry motivated it — WikiSkill keeps that provenance link explicitly (https://arxiv.org/abs/2608.27454, 2026-08-27). Promotion is a human decision here [heuristic]: the paper's automatic gate needs a scored validation split repos don't have, and such gates are noisy anyway — across 14 settings one selected an evolved skill in 11, of which 9 improved test performance (https://arxiv.org/abs/2608.02636, 2026-07-31).
- Entries carry absolute dates and a code location. Verification means re-checking the claim against current code, not that the path still resolves — a surviving `file.ext:120` can point at unrelated code after a refactor. An entry that fails verification is marked superseded, not silently trusted (see the 23% stale-reference rate in code-navigation.md).
- Scope caveat to keep in the generation report: WikiSkill's benchmarks are math, search, spreadsheet, document-QA and ALFWorld — no repository work — its ablation removes the maintainer agent along with the wiki so it isolates neither, and it is a v1 preprint from the method's own authors. The shape is adopted; the numbers do not transfer to repo work [heuristic].

## Docs-for-agents

- Structure docs so agents can retrieve just-in-time: a `docs/` directory with focused per-topic files (building, testing, deployment, domain concepts) and one-line pointers from AGENTS.md — "prefer pointers to copies" (https://www.humanlayer.dev/blog/writing-a-good-claude-md, 2025-11-25).
- ADRs earn their keep in the agent era: record decisions with explicit anti-patterns ("do not introduce a second HTTP framework") and rejection reasons — agents "never knew in the first place" (practitioner consensus, e.g. https://www.braingrid.ai/blog/architecture-decision-records-for-ai-coding-agents, 2026). Generator: create `docs/adr/` with a minimal template only when the repo makes architectural decisions worth recording; never backfill fake ADRs.
- llms.txt: won as a vendor docs-site index for coding agents, not as a general web standard — generate one only for repos that publish a docs site [heuristic; adoption data https://www.rankability.com/data/llms-txt-adoption/, 2026-06].
- Doc freshness: encode in AGENTS.md that a change altering behavior a doc describes updates the doc in the same change; optionally a hook that flags doc-pair drift (see automation-surface.md). Auto-generated architecture overviews are a documented anti-pattern for instruction files (see context-files.md) — don't generate them as docs either unless the team will maintain them.

## Cross-session continuity

- Plan/spec files are the official pattern: research → plan (~200-line plan.md/SPEC.md) → fresh session executes; keep context utilization moderate and compact status back into the plan after each verified phase (https://code.claude.com/docs/en/best-practices, current; https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/ace-fca.md, 2025 — self-reported results).
- Long-running/autonomous work: a progress log the agent maintains + git commits as checkpoints + a feature list the agent may only mark done, never edit — prevents agents deleting requirements to "finish" (https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents, 2025-11-26). Generate this scaffolding only for repos that will run long autonomous sessions, not by default.
- One continuity artifact per concern — a handoff doc duplicating a live todo file creates two seeds that disagree [heuristic].
- "Compounding" loop worth encoding as one AGENTS.md line: when a task teaches something non-obvious, capture it (memory or docs) before closing out (https://every.to/c/compounding-engineering, 2025–2026).

## Generator defaults

- All repos: doc-freshness rule; second-mistake memory rule; native tool memory left on. AGENTS.md pointer section to docs/ only when doc files actually exist — never point at docs that aren't there.
- Repos with real docs or domain complexity: `docs/` skeleton with per-topic files (only ones that can be filled truthfully today).
- Cross-tool teams: checked-in `docs/` + AGENTS.md conventions rather than any single tool's proprietary memory as the shared store [preference].
- On request (or adopting an existing one): the notes layer above — the file, the AGENTS.md "read it when" pointer, the capture line naming it, and the consolidation procedure. Never one without the others.
- Never generate: vector-store memory infra, Cline-style multi-file memory banks loaded every session with no consolidation step (they work only with heavy update discipline and have no conflict resolution — https://docs.cline.bot/best-practices/memory-bank, current; the single conditional notes file above is not this), auto-generated architecture overviews.
