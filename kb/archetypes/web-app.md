---
topic: archetypes/web-app
reviewed: 2026-08-27
---

# Web application archetype

Layered on top of runtime-feedback.md (browser surface, console forwarding, dev-server guards) and languages/typescript.md. This file covers what's specific to shipping web apps.

## E2E strategy

- Playwright is the default e2e layer; **Playwright Agents** (official since v1.56: planner→generator→healer, installed per-harness via `npx playwright init-agents --loop=claude|codex|...`) generate and self-heal tests with live selector verification — emit the agent definitions + `specs/` convention for teams adopting it, and regenerate definitions on Playwright upgrades (https://playwright.dev/docs/test-agents, current) [official docs; no independent field reports yet].
- Auth state: `playwright/.auth/` gitignored (state files can impersonate users), setup-project + `storageState` when tests don't mutate server state, worker-scoped per-account fixtures when they do, role files for admin/user; API login over UI login for speed (https://playwright.dev/docs/auth, current).
- Fast agent loops: document `--only-changed`, `--last-failed`, `--grep` in AGENTS.md; sharding is CI-only (https://playwright.dev/docs/test-cli, current). Component tier: Vitest Browser Mode (stable) for real-browser component tests; jsdom only for logic (https://vitest.dev/guide/browser/, current).

## Preview deployments as a verification surface

- Protected previews block agents by design; the sanctioned path (Vercel) is the automation bypass secret — `x-vercel-protection-bypass` header + `x-vercel-set-bypass-cookie`, auto-exposed as `VERCEL_AUTOMATION_BYPASS_SECRET`, one secret per system, rotated, never in query params (https://vercel.com/docs/deployment-protection/automated-agent-access, 2026-07-15). Emit the e2e config wiring + a `deployment_status`-triggered workflow running Playwright against the preview URL.
- Platform MCPs (Vercel/Netlify) give agents deploy-log reading and failure diagnosis — wire only for teams on those platforms (see mcp-and-tools.md; prompt-injection caveat in security.md). Cloudflare Workers: `--preview-alias` stable preview URLs; previews are PUBLIC and skip Durable Objects (https://developers.cloudflare.com/workers/configuration/previews/, current).
- Per-preview database branches (Neon-style: branch per preview, migrations in the build command, auto-cleanup) where the stack supports it (https://neon.com/docs/guides/vercel-previews-integration, current).

## Seed and reset infrastructure

- A NAMED seed command and a NAMED reset command in AGENTS.md are mandatory harness content. Sharp edge: Prisma v7 removed auto-seeding on `migrate dev`/`reset` — agents relying on reset-implies-seed silently get empty DBs (https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding, current). Supabase reruns `seed.sql` on every `db reset`; drizzle-seed is DETERMINISTIC (same seed → same data), which makes agent verification runs reproducible — prefer deterministic generators (https://orm.drizzle.team/docs/seed-overview, current).
- Cloud-agent environments need deps/DB pre-provisioned (e.g. `copilot-setup-steps.yml` with Actions `services:`) — trial-and-error setup is slow and fails on private deps (https://docs.github.com/en/copilot/customizing-copilot/customizing-the-development-environment-for-copilot-coding-agent, current).

## Design-system conformance

Where a design system exists, emit the Storybook agent wiring (`@storybook/addon-mcp`: component manifests, story generation, `run-story-tests`) plus its guardrail line in AGENTS.md — "never use a component prop without checking the manifest; common-sounding props like `shadow` get hallucinated" (https://storybook.js.org/docs/ai, current — preview status, React-only; version-check before emitting). Figma Dev Mode MCP for design-to-code teams (beta pricing will change). Design-token pipelines are project-specific — the DTCG format is still a non-authoritative draft; don't scaffold token infrastructure.

- When core-loop quality or user-visible polish conflicts with implementation convenience, favor the user; implementation cost is rarely the user's problem (https://github.com/cursor/plugins/tree/main/pstack, 2026-08).

## Fullstack boundaries (RSC-era mistakes agents make)

- Emit `server-only`/`client-only` package imports on boundary modules — they turn wrong-side imports into build errors — and note `NEXT_PUBLIC_` env discipline (only prefixed vars reach the client) (https://nextjs.org/docs/app/getting-started/server-and-client-components, 2026-08-11).
- AGENTS.md pointer to the hydration-error checklist (invalid HTML nesting, `Date()`/window in render, etc. — https://nextjs.org/docs/messages/react-hydration-error, current) rather than inlining it.
- STALE-GUIDANCE trap: do not emit `runtime = 'edge'` — unsupported from Next.js 16.3, and Vercel now recommends Node runtime; 2023–24-era agent guidance pushing edge is actively wrong (https://vercel.com/docs/functions/runtimes/edge-runtime, 2026-08-03).
- API contracts: tRPC makes drift a compile error with no codegen step; OpenAPI codegen works cross-language but the regenerate-types step must be a named command agents can't skip. Keep the repo's existing choice; encode the regenerate command if there is one.

## Emission checklist

AGENTS.md (commands, ports, seed/reset, boundary + preview rules) → Playwright config + auth scaffolding → fast-loop test flags documented → preview bypass wiring + deployment-status test workflow (platform-dependent) → seed/reset commands verified runnable → design-system guardrails (if applicable) → cloud-agent setup file (if the team uses cloud agents).
