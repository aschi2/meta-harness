---
topic: archetypes/services-infra
reviewed: 2026-08-24
---

# Backend services / infrastructure archetype

Highest blast radius, so the harness here is mostly ENFORCED BOUNDARIES. The canonical incident: an agent deleted a production database, falsely claimed rollback was impossible, and violated an explicit code freeze — prose freezes don't hold (https://www.theregister.com/2025/07/21/replit_saastr_vibe_coding_incident/, 2025-07-21). The Claude Code docs are explicit that instruction files are advisory and only permission rules/hooks/platform controls actually constrain (https://code.claude.com/docs/en/permissions, current). So: tiers in prose, enforcement in config.

## Environment tiers (the governing policy)

Local: always. Staging: via PR + approval. Prod: never directly — read-only observability at most. Every vendor that thought about it converged here (LocalStack: "the dev/prod boundary doesn't disappear because the developer is now an AI"; Supabase MCP: dev project only, read-only if unavoidable; EKS MCP: read-only by default, write behind opt-in flags; Datadog's SRE agent reads everything, changes nothing except via human-merged PRs). Encode as:

- Deny rules: `terraform apply`, `terraform state *` (state files ARE secret stores — https://developer.hashicorp.com/terraform/language/state/sensitive-data, current), `kubectl delete`, `helm uninstall`, prod DB URLs, Read of `.env`/state files. Remember deny > allow, and env-runner wrappers (`npx`, `docker exec`) aren't stripped for rule matching — anticipate them (https://code.claude.com/docs/en/permissions, current).
- PreToolUse hook write-locking `migrations/` — literally the official example hook (https://code.claude.com/docs/en/best-practices, current).
- MCP hygiene: DB/infra MCP servers scoped to dev projects, read-only roles, restricted toolsets; never attach untrusted clients (https://supabase.com/docs/guides/getting-started/mcp; https://github.com/hashicorp/terraform-mcp-server — both current; injection side in security.md).

## Migrations

- The agent's verify loop is migration LINTING plus shadow-DB replay: `atlas migrate lint` (auto-fixes missing `CONCURRENTLY` etc.) or strong_migrations (Rails; blocks unsafe ops, forces the safe multi-step pattern) as the runnable check; Prisma's shadow database replays migrations on a throwaway DB to catch drift/data loss (https://atlasgo.io/blog/2025/08/19/teach-ai-agents-schema-management, 2025-08-19; https://github.com/ankane/strong_migrations; https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/shadow-database, current).
- Policy-as-code over manual review at agent volume: destructive-change detection with explicit allowlist naming for intentional drops, backward-incompat detection, tiered approval (https://atlasgo.io/blog/2026/04/29/policy-as-code, 2026-04-29). Expand/contract (pgroll-style) for zero-downtime discipline; platform-enforced no-direct-DDL (PlanetScale-style deploy requests) where available — a database-side gate no agent can talk around.
- Branch/snapshot-per-agent-run databases (Neon-style copy-on-write) where the platform supports it.

## IaC

- `terraform validate` + `terraform plan` is the agent loop; APPLY ONLY VIA PIPELINE with a policy gate (Sentinel/OPA/checkov) between plan and apply. This is HashiCorp's own stance — their MCP server explains plans and manages workspaces but "does not directly execute plan or apply... an intelligent interface layer... rather than autonomous infrastructure modifications" (https://www.hashicorp.com/en/blog/terraform-mcp-server-is-now-generally-available, 2026-06-11). Pulumi is notably more execution-willing (Neo agent with approval gates) — follow the team's platform, keep human approval in the path.
- Real emulated cloud beats mocks for the verify loop: LocalStack with IAM enforcement — "a mock returns whatever the agent expects it to return"; agent-generated IAM trends over-permissive (wildcards, public buckets), so policy scanning is a gate not a nicety (https://blog.localstack.cloud/give-your-coding-agent-a-real-cloud-to-break/, 2026-08-11; /ai-agent-sandbox/, 2026-08-06). Packaged IaC skills exist (Terramate's 37-rule Terraform skill set) for teams wanting priors.

## API services

- OpenAPI as source of truth with oasdiff `breaking` in CI (it also has an MCP so agents can query the analysis); generated typed clients; SDK-preview builds to see downstream breakage pre-merge (https://github.com/oasdiff/oasdiff, current; https://www.stainless.com/blog/steps-toward-great-agent-experience-every-api-provider-can-take-today, 2026-03-23).
- Local-stack fidelity (docker-compose/LocalStack/testcontainers) as the agent's runnable environment — see runtime-feedback.md for the log/seed side.

## Kubernetes / deploy

- Shift validation into the PR: kubeconform + Flux Schema offline validation (API-server-equivalent semantics; their public schema MCP measurably improved agent manifest generation — https://fluxcd.io/blog/2026/07/flux-schema-validation/, 2026-07-13).
- GitOps IS the agent boundary: agents PR manifests, controllers apply; cluster MCP access is read-only/diagnostic (`--read-only`, `--disable-destructive`, non-destructive-only modes across all major k8s MCP servers). Staged rollouts with metric-driven auto-rollback (Argo Rollouts) make the merged-PR path self-verifying [rollout-gates-for-agents specifically is synthesis, not sourced practice].
- Prod debugging: read-only observability MCP (Grafana `--disable-write`, scoped service account); the documented pattern is agent diagnoses and EMITS remediation commands, human runs them (https://claude.com/blog/how-anthropic-teams-use-claude-code, 2025).

## Emission checklist

AGENTS.md (commands, tier statement, migration/IaC workflow, security section) → deny rules + migrations-lock hook → migration lint + shadow-DB in the standard check → plan-only IaC loop + policy gate in CI → oasdiff/kubeconform gates per stack → local-stack environment with seed/reset → read-only observability wiring → MCP scoping per the hygiene rules. Prose never substitutes for enforcement here.
