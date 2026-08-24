---
topic: model-routing
reviewed: 2026-08-24
---

# Model routing and cost management

What a generated harness encodes about model choice. Mostly this is personal/org config, not repo config — the generator's surface is small and marked below.

## Measured basis for tiering

- The plan-strong/execute-cheap split has real measurements: architect+editor model pairs beat solo models on the aider benchmark (77.4%→80.5% for Claude Sonnet self-paired; https://aider.chat/2024/09/26/architect.html, 2024-09); Anthropic's advisor strategy (cheap executor + strong advisor consulted at decision points) measured +2.7pp on SWE-bench Multilingual at −11.9% cost, and doubled a small model's BrowseComp score at 85% lower cost than mid-tier solo (https://claude.com/blog/the-advisor-strategy, 2026-04-09).
- Production-scale tiering works: Cloudflare's review fleet uses top-tier models only for coordination/final judgment, mid-tier for specialist reviewers, open-weights for text-heavy review — median $0.98/review across 131k reviews/month (https://blog.cloudflare.com/ai-code-review/, 2026-04-20).
- Counterweight: several strong practitioners run the top model throughout and solve cost with subscriptions instead ("multi-model setups feel too random" — https://lucumr.pocoo.org/2025/7/30/things-that-didnt-work/, 2025-07-30). Tiering is a lever, not a duty.
- Auto-routers (Cursor Auto, Copilot auto selection) ship with NO published quality data — treat as pricing features until measured.

## Effort levels

- Vendor guidance both sides agree on: lowest effort that produces the result; low for short scoped mechanical tasks, high+ for multi-step/tradeoff work; max "prone to overthinking — test before adopting broadly" (https://code.claude.com/docs/en/model-config, current; Codex `model_reasoning_effort`, https://learn.chatgpt.com/docs/config-file/config-reference, current). No published quantitative effort-vs-quality curves exist — vendor assertion only.
- Effort scales are calibrated per model — the same level name isn't the same compute across models.

## What the generator emits (the repo-level surface)

- `model:` and `effort:` frontmatter on generated subagents and skills where the task shape is stable — cheap models/low effort for mechanical stages (classification, formatting, extraction), inherit for everything else (https://code.claude.com/docs/en/sub-agents, current). This is the one place routing belongs in a repo.
- CI workflows pin their model in the committed workflow config (via CLI args/settings input) so CI behavior is reproducible.
- Do NOT pin the main session model in project settings without an explicit team decision — it silently overrides every contributor's choice on next launch (https://code.claude.com/docs/en/model-config, current). Note: where routing lives is genuinely contested — Anthropic docs support repo-committed model fields while Cloudflare deliberately centralizes model choice OUTSIDE repos so models can shift without repo changes (https://blog.cloudflare.com/internal-ai-engineering-stack/, 2026-04-20). Default: repo pins only subagent/skill/CI models; session-model choice stays personal/org.

## Cost management notes (advisory, for the generation report)

- Cost observability: opt-in OTel streams per-user cost/token metrics with model/effort/skill/subagent attribution (https://code.claude.com/docs/en/monitoring-usage, current); `/usage` shows in-session attribution. Spend caps live at org/workspace level, not per-task.
- Multi-agent features are expensive by construction (agent teams ~7x tokens vs a single session — https://code.claude.com/docs/en/costs, current) — the harness should say when NOT to use them.
- Subscriptions vs API is a real economic fork (practitioners report ~5–10x effective savings on subscriptions; API teams report $12k/mo for three heavy users) [self-reported figures] — flag it, don't decide it.
