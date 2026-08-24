---
topic: team-workflows
reviewed: 2026-08-24
---

# Team workflows and CI for agent-generated code

What a generated harness encodes for teams: PR conventions, review structure, CI gates, and config distribution. Governing evidence: AI lifts individual output but org-level delivery stays flat and quality drops WITHOUT strong gates — telemetry across 22k devs showed PR review time +441%, incidents-per-PR +243% (https://pages.faros.ai/hubfs/AI_Engineering_Report_2026_The_Acceleration_Whiplash_Faros.pdf, 2026-04); DORA's framing is "AI amplifies what's already there" — value is gated on testing, fast feedback, and small batches (https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report, 2025-09). So for teams, the verification layer is the harness's load-bearing part.

## PR conventions to encode in AGENTS.md

- Small PRs, non-negotiable: human defect detection collapses past ~200–400 lines per sitting, and vendors' own review tools state they work best on small diffs (https://blog.codacy.com/code-review-is-dead-why-ai-generated-code-needs-verification-not-human-approval, 2026; https://github.blog/ai-and-ml/github-copilot/unlocking-the-full-power-of-copilot-code-review-master-your-instructions-files/, 2025). Production auto-approval systems reject large/broad-scoped changes outright (https://www.intercom.com/blog/ai-is-approving-our-pull-requests-heres-how-we-made-it-safe/, 2026-04-21).
- Attribution is a TEAM DECISION the generator asks about, not a default it imposes: vendor defaults (Co-Authored-By trailers) caused backlash when silently imposed (https://github.com/microsoft/vscode/issues/314311, 2026). For OSS repos note the measured norms: of repos with AI policies, 51% require disclosure and 74% require a human in the loop (https://arxiv.org/abs/2605.16706, 2026-05). Record the chosen convention as one AGENTS.md line.
- Agent PRs stay drafts until a human reviews; the person who tasked the agent shouldn't be its sole required approver (GitHub's own control set, https://docs.github.com/en/copilot/concepts/agents/cloud-agent/risks-and-mitigations, current).
- Risk-tiering scales review depth to blast radius — auto-merge only ever for low-risk tiers, with logged, auditable approvals (https://claude.com/blog/how-anthropic-secures-its-ai-native-software-development-lifecycle, 2026; Intercom above). Encode the repo's risk tiers (paths/kinds of change) if the team has them; don't invent tiers for small teams.

## Review structure

- Human review concentrates on specs/plans, not generated lines — "review the 200-line plan, not the 2,000-line diff" (https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/ace-fca.md, 2025; see spec-and-planning.md).
- AI review of AI code works in production but lives or dies on noise control. Proven countermeasures: explicit "what NOT to flag" instructions, filtering generated/lockfile diffs, severity floors (P0/P1-only), dedup, nit caps after first review (https://blog.cloudflare.com/ai-code-review/, 2026-04-20 — 131k reviews/month, median $0.98; https://developers.openai.com/codex/integrations/github, current; https://code.claude.com/docs/en/code-review, current). Habituation is measured and real: reviewers approve more and comment less on agent PRs over time (https://arxiv.org/abs/2606.22721, 2026-06) — noisy bots train people to ignore them.
- For teams using a repo-level review tool, emit its tuning file (e.g. REVIEW.md for Claude Code review: severity rules, nit caps, skip rules for generated code) instead of prose review rules; for Codex, nested AGENTS.md `## Code Review Rules` sections (https://code.claude.com/docs/en/code-review, current; https://developers.openai.com/codex/integrations/github, current).
- Treat review prompts/harness config as maintained software — "prompt rot" is a named production failure mode (https://getdx.com/blog/how-faire-platform-team-built-an-ai-code-review-agent/, 2025-08).

## CI gates

- Deterministic CI (tests, typecheck, lint, security scan) is the harness-independent enforcement layer — it holds no matter which agent produced the code; neither agent nor reviewer-bot may reinterpret a red build (consensus across Cloudflare/Intercom/Anthropic/Codex docs, above). Keep mechanical checks in CI; instruction files carry only judgment-dependent rules.
- Mention-triggered agents (@claude / @codex on PRs) are mature; generator emits a workflow only for teams already on GitHub Actions. Mechanics that must be right: bot actors rejected unless allowlisted (prevents bot-triggering-bot loops), and agent pushes must authenticate as an app — default GITHUB_TOKEN commits don't trigger CI (https://code.claude.com/docs/en/github-actions, current).
- Cost controls for agent CI: max-turns/timeouts/concurrency caps, risk-tiered depth so expensive models skip trivial diffs, concise instruction files (read every run) (https://code.claude.com/docs/en/github-actions, current; https://blog.cloudflare.com/ai-code-review/, 2026-04-20).

## Distributing harness config

- The committed, PR-reviewed team layer is `.claude/settings.json` (+ AGENTS.md + checked-in skills); personal overrides in gitignored local settings; org mandates in managed settings individuals can't override (https://code.claude.com/docs/en/settings, current).
- Plugins via committed `extraKnownMarketplaces` + `enabledPlugins` give every contributor the same catalog on folder trust; CI accepts the same plugins/settings inputs, so one reviewed config drives local and CI identically (https://code.claude.com/docs/en/plugin-marketplaces, current; https://code.claude.com/docs/en/github-actions, current).
- OSS repos get a CONTRIBUTING/AGENTS.md note on AI contribution policy — unverified AI slop is a documented maintainer crisis (curl killed its bug bounty over it; https://www.theregister.com/2026/01/21/curl_ends_bug_bounty/, 2026-01-21). State what's welcome (verified, disclosed, human-reviewed) and what gets closed.

## Calibration on impact claims

Individual-output gains are real; org-level speedup is unproven (METR's RCT measured experienced devs 19% SLOWER with early-2025 tools while feeling 20% faster, and its 2026 follow-up found only weak evidence of improvement — https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/, 2025-07-10; https://metr.org/blog/2026-02-24-uplift-update/, 2026-02-24). Vendor near-zero-revert numbers coexist with population-level quality declines because gated auto-approval selects easy changes. Generator stance: never promise productivity; encode the gates that make the quality risk manageable.
