---
topic: harness-evals
reviewed: 2026-09-02
---

# Measuring harness effectiveness

How to tell whether a harness change helped. This governs meta-harness's own honesty (never promise unmeasured wins) and what feedback loop a generated harness recommends to its team.

## Core calibration

- Vendors detect harness effects at millions of sessions (Cursor A/Bs keep rate, token efficiency, and LLM-classified dissatisfied follow-ups — https://cursor.com/blog/continually-improving-agent-harness, 2026-04-30). Academic ablations at team-feasible scale find context-file changes produce NO detectable correctness effect: ~120–200 tasks are needed for 80% power on a 10-point effect, so a 20–50-task suite cannot see single-digit deltas — the cited paper's own 17-task/288-run design only reached 57% power to detect a 30-point effect (https://arxiv.org/html/2607.27250, 2026-07-28; https://arxiv.org/abs/2411.00640, 2024-11).
- Consequence: at team scale, expect most instruction-file edits to be unmeasurable on correctness. Trust only large deltas, per-case flips, and cost/behavior proxies (tokens, turns, redundant tool calls) — those often move detectably when pass rates don't (https://arxiv.org/html/2607.27250, 2026-07-28).
- Self-perception is not evidence: devs measured 19% slower while feeling 20% faster (https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/, 2025-07-10).
- Harness bugs can dwarf model deltas — one harness regression (dropping reasoning traces between turns) cost 30% on an internal bench (https://cursor.com/blog/codex-model-harness, 2025-12-04). Verifying harness mechanics (does the hook fire, does the skill trigger) is higher-yield than micro-tuning prose.
- Harness gains are not model-portable: capability should be reported per model-harness configuration, not attributed to the base model alone — Harness-Bench (106 tasks, 5,194 trajectories across model×harness pairs) found harness configs transfer unevenly when the underlying model is swapped (https://arxiv.org/abs/2605.27922, 2026-05-27).
- No primary source prescribes a different eval methodology for steered vs. autonomous coding-agent harnesses; the only measured divergence found is harness self-evolution (see "Feeding failures back" below).

## The minimal credible loop (what a generated harness recommends)

1. Error analysis first: log real harness failures (rule ignored, wrong file edited, skill not triggered), taxonomize, and write eval cases only for observed failure classes (https://hamel.dev/blog/posts/evals-faq/, 2025-05-28; https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents, 2026-01-09).
2. Golden suite of 20–50 tasks drawn from those failures, outcome-graded (state checks/scripts over LLM judges), balanced should-trigger/should-not-trigger cases (https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents, 2026-01-09).
3. With/without ablation, ≥3 runs per case, fresh isolated sessions — leftover authoring context masks gaps (https://code.claude.com/docs/en/skills, current). Tooling exists: `claude plugin eval` (early access: ablation arms, regex/tool_used/llm graders, CI thresholds) and the skill-creator plugin's blind version A/B (https://claude.com/blog/improving-skill-creator-test-measure-and-refine-agent-skills, 2026-03-03). Cost is trivial (~$6 for 250 sandboxed runs in one practitioner measurement — https://scottspence.com/posts/measuring-claude-code-skill-activation-with-sandboxed-evals, 2026-02-08).
4. Continuous production proxies via session logs / opt-in OpenTelemetry (Claude Code OTel: cost, tokens, tool decisions; prompt content redacted by default — https://code.claude.com/docs/en/monitoring-usage, current): cost per task, plus a rework proxy (revert/churn on agent commits, or classified dissatisfied follow-ups). The only proxy with published outcome-correlation validation is suggestion acceptance rate, and it validates against PERCEIVED productivity (https://dl.acm.org/doi/10.1145/3633453, 2024-03) — treat all proxies as weak evidence.
5. Prune as a first-class move: re-run the suite after REMOVING instructions, not just adding — added context frequently costs tokens (+20% avg inference cost) without helping, and skills plateau as rules accumulate (https://arxiv.org/pdf/2602.11988, 2026-02; https://agentskills.io/skill-creation/evaluating-skills, current). The unhelpful content is specifically repository *overview* material, which vendors recommend but which measurably doesn't help; explicit *instructions* are well-followed — prune overviews, keep instructions (https://arxiv.org/abs/2602.11988, v2 2026-06-23).

## Skill trigger measurement

Trigger rate and output quality are separate axes — measure both. Baseline trigger rates are noisy (50–55% with 5-point run swings in one measurement); deterministic graders (parse transcripts for skill invocations) beat impressions, and a forcing hook reaches 100% when triggering must be guaranteed (https://scottspence.com/posts/measuring-claude-code-skill-activation-with-sandboxed-evals, 2026-02-08; see automation-surface.md).

## Adoption reality (calibrates generator defaults)

In a 2,853-repo mining study, context files dominate real harness config (61–100% per tool) while skills, subagents, and hooks all sit under 20% adoption — hooks ~3% (https://arxiv.org/pdf/2602.14690, AIware 2026). The generator's conservative defaults (few skills, starter hooks only, one subagent at most) match observed practice; the KB's job is making the rarely-adopted pieces cheap enough to be worth it.

## Feeding failures back

- When iterating on a harness from failed runs, give the RAW traces, not a summary of them. In an ablation on harness improvement, scores-only scored 34.6 median / 41.3 best, scores plus LLM-generated summaries 34.9 / 38.7 (i.e. summarising bought nothing over scores alone), and full trace access 50.0 / 56.7 (https://arxiv.org/abs/2603.28052, 2026-03-30). Compressing agent logs before analysis discards the signal.
- Change one thing at a time. In the same work, early iterations that bundled structural and prompt edits both regressed and were followed by six consecutive regressions; the eventual win was "purely additive" (same source) [trace-level]. This is the same reason `/harness-update` merges additively rather than rewriting.
- Autonomous: self-editing harness-evolution loops (agent mines its own failure traces and applies its own harness edits, unattended) do not reliably beat simple test-time-scaling baselines and do not generalize — without unit-test feedback, evolution underperformed parallel sampling (67.4% vs 72.3% pass@1), and evolved harnesses showed only +0.6pp transfer to held-out tasks despite larger gains on the training tasks, i.e. they memorize task-specific fixes rather than generalizing [single-source] (https://arxiv.org/abs/2607.12227, 2026-07-14). Rule: harness edits proposed by an unattended loop go through a human gate before landing, not auto-apply — steered iteration already has that gate by construction (a human is the one running `/harness-update`).

## Rules for meta-harness itself

- Generation reports state what is evidence-backed vs heuristic; no productivity promises.
- When `/harness-update` proposes removing content, that's normal operation, not regression — pruning has better evidence than adding.
- Recommend the eval loop only to teams feeling harness pain or investing in skills/hooks; a golden-suite recommendation for every 500-file repo is overkill [preference].
