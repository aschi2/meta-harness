# KB changelog

Newest first — new entries go at the top, with a unique heading (date + short slug). `/harness-update` scopes upgrades to the entries above a manifest's recorded `kbEntry`.

## 2026-08-24 — initial corpus

Full research pass across all five topics (5 parallel agents, primary sources fetched 2026-08-24).

- context-files: established — non-inferable content only, <200-line target, pointers over copies, nested files for monorepos, never ship auto-generated instruction files (ETH arXiv:2602.11988: LLM-generated files −3% success/+20% cost; human-written +4%; AGENTS.md presence −28.6% median runtime per arXiv:2601.20404).
- memory-and-docs: established — plain-file memory is proven (GitHub Copilot A/B +7pt merge rate; Letta files-beat-graph benchmark); four-way split (instructions/memory/skills/docs); prefer native tool memory; no vector-store infra.
- code-navigation: established — grep-first default with size tiers (S/M/L); LSP plugins + committed deny-rules at tier M; semantic index only on measured pain at tier L; repo maps unproven and staleness-prone.
- automation-surface: established — skills for procedures (Agent Skills open standard, cross-tool), hook starter set (format-on-edit, dangerous-command block, stop gate), verification-first (pass/fail check is the top practice), parallelize reads never writes.
- harness-targets: established — AGENTS.md canonical (Codex/Cursor/pi native; Claude Code via symlink or @import); `.agents/skills/` shared dir with `.claude/skills/` symlink shim; hooks non-portable → CI backstop; pi confirmed as badlogic/pi-mono.
