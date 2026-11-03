---
topic: model-routing
reviewed: 2026-09-02
---

# Model routing and cost management

What a generated harness encodes about model choice. Mostly this is personal/org config, not repo config — the generator's surface is small and marked below.

## Measured basis for tiering

- The plan-strong/execute-cheap split has real measurements: architect+editor model pairs beat solo models on the aider benchmark (77.4%→80.5% for Claude Sonnet self-paired; https://aider.chat/2024/09/26/architect.html, 2024-09); Anthropic's advisor strategy (cheap executor + strong advisor consulted at decision points) measured +2.7pp on SWE-bench Multilingual at −11.9% cost, and doubled a small model's BrowseComp score at 85% lower cost than mid-tier solo (https://claude.com/blog/the-advisor-strategy, 2026-04-09).
- Production-scale tiering works: Cloudflare's review fleet uses top-tier models only for coordination/final judgment, mid-tier for specialist reviewers, open-weights for text-heavy review — median $0.98/review across 131k reviews/month (https://blog.cloudflare.com/ai-code-review/, 2026-04-20).
- Counterweight: several strong practitioners run the top model throughout and solve cost with subscriptions instead ("multi-model setups feel too random" — https://lucumr.pocoo.org/2025/7/30/things-that-didnt-work/, 2025-07-30). Tiering is a lever, not a duty.
- Auto-routers (Cursor Auto, Copilot auto selection) ship with NO published quality data — treat as pricing features until measured.

## Effort levels

- Vendor guidance both sides agree on: lowest effort that produces the result; low for short scoped mechanical tasks, high+ for multi-step/tradeoff work; max "prone to overthinking — test before adopting broadly" (https://code.claude.com/docs/en/model-config, current; Codex `model_reasoning_effort`, https://learn.chatgpt.com/docs/config-file/config-reference, current). `ultracode` sits above max: xhigh reasoning plus automatic dynamic-workflow planning per substantive task, on by default for Max/Team/Enterprise and API use (https://code.claude.com/docs/en/model-config; /workflows, current). No published *vendor* quantitative effort-vs-quality curves exist; one independent one does — see below.
- Effort scales are calibrated per model — the same level name isn't the same compute across models.
- Steered vs autonomous split, SINGLE-SOURCE (one author, 90 runs): OpenAI's Codex prompting guide recommends medium effort for interactive use and high/xhigh for tasks Codex runs autonomously for hours (https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide, current). A measured curve backs the same direction: raising effort high→xhigh nearly eliminated first-try Docker/environment-setup failures (17–18/18 pass) — a failure class that only costs when no human turn is there to catch and correct it (https://arxiv.org/abs/2607.02436, 2026-07). Rule: bias unattended runs one effort rung higher than the same task would get interactively, since a first-try miss isn't cheaply corrected. Vendor effort tables carry no autonomy branch — that's vendor silence, not vendor disagreement.

## What the generator emits (the repo-level surface)

- `model:` and `effort:` frontmatter only on things that run in their own context: subagent definitions, and skills that also declare `context: fork` — cheap models/low effort for mechanical stages (classification, formatting, extraction), inherit for everything else (https://code.claude.com/docs/en/sub-agents, https://code.claude.com/docs/en/skills, current). Never on an inline skill: the field overrides the session model for the rest of the current turn, and a headless `claude -p` run is one turn, so an inline skill would silently re-route the whole run away from the model its runner chose. The same skill file is loaded by headed and headless sessions alike, so the field cannot be made conditional; with `context: fork` it applies to the forked subagent only and behaves identically in both. Routing for delegated work (e.g. a `codex exec` rung) goes in the skill's prose, since the field is Claude-Code-only and does not reach Codex, Cursor, or agentskills.io.
- Precedence for subagent model selection (v2.1.251, 2026-08-28): per-spawn model > agent-definition `model:` field > `CLAUDE_CODE_SUBAGENT_MODEL` env default — the env var is now a default, not a hard override, so a generated subagent's `model:` frontmatter is honored even when the env var is set. `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` (v2.1.259, 2026-09-02) is the org-wide escape hatch that pins every subagent/teammate/workflow-agent onto the env default regardless of per-spawn or definition overrides (https://code.claude.com/docs/en/model-config, current).
- `/advisor` (GA-experimental since 2026-04-22) is the productized form of the advisor-strategy research above — `/advisor`, the `advisorModel` setting, and a `--advisor` flag are levers a generated harness can set (https://code.claude.com/docs/en/advisor, current).
- CI workflows pin their model in the committed workflow config (via CLI args/settings input) so CI behavior is reproducible.
- Do NOT pin the main session model in project settings without an explicit team decision — it silently overrides every contributor's choice on next launch (https://code.claude.com/docs/en/model-config, current). Note: where routing lives is genuinely contested — Anthropic docs support repo-committed model fields while Cloudflare deliberately centralizes model choice OUTSIDE repos so models can shift without repo changes (https://blog.cloudflare.com/internal-ai-engineering-stack/, 2026-04-20). Default: repo pins only subagent/skill/CI models; session-model choice stays personal/org.

## Cost management notes (advisory, for the generation report)

- Cost observability: opt-in OTel streams per-user cost/token metrics with model/effort/skill/subagent attribution (https://code.claude.com/docs/en/monitoring-usage, current); `/usage` shows in-session attribution. Spend caps live at org/workspace level, not per-task.
- Multi-agent features are expensive by construction (agent teams ~7x tokens vs a single session — https://code.claude.com/docs/en/costs, current) — the harness should say when NOT to use them.
- Subscriptions vs API is a real economic fork (practitioners report ~5–10x effective savings on subscriptions; API teams report $12k/mo for three heavy users) [self-reported figures] — flag it, don't decide it.
