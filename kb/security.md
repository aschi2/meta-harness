---
topic: security
reviewed: 2026-08-24
---

# Security defaults for generated harnesses

Defensive configuration a harness checks in. Threat model, all with 2025–2026 documented incidents: prompt injection via content agents consume (repo files, issues/PRs, web results, MCP tool output — e.g. GitLab Duo injection, Copilot CamoLeak CVE-2025-59145, Claude Code DNS-exfil CVE-2025-55284); malicious harness components (first in-the-wild malicious MCP server 2025-09; a skill-marketplace audit found 13.4% of 3,984 skills critically flawed with 76 confirmed malicious — https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub/, 2026-02); and supply-chain worms that specifically harvest AI-CLI credentials and MCP configs (Nx s1ngularity, Shai-Hulud — https://www.wiz.io/blog/s1ngularity-supply-chain-attack, 2025-08).

Organizing principle — the lethal trifecta: private data + untrusted content + external communication in one agent = exfiltration pipeline; remove one leg rather than trusting filters, which both Willison and OpenAI say cannot fully solve injection (https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/, 2025-06-16; https://openai.com/index/prompt-injections/, 2025-11).

## Checked-in defaults (every generated harness)

- **Secrets deny rules** in `.claude/settings.json`: `Read(.env)` (bare filename matches at any depth), `Read(./secrets/**)`, plus equivalents for key material the profile finds. Caveats that shape the rules: Read-deny covers Edit/Write on the same path (v2.1.208+), and deny rules bind built-in file tools and recognized Bash file commands but NOT arbitrary subprocesses — only the OS sandbox covers everything (https://code.claude.com/docs/en/permissions.md, current). So also recommend sandbox mode with `denyRead` mirroring the deny list.
- **Network egress**: don't allowlist raw fetch tools; grant web access per-domain (`WebFetch(domain:...)`). The CVE-2025-55284 lesson: even "safe" utilities (`ping`, `dig`, `nslookup`) are exfil channels — never put them on auto-approve allowlists (https://embracethered.com/blog/posts/2025/claude-code-exfiltration-via-dns-requests/, 2025-08).
- **Allowlist hygiene**: prefix rules have sharp edges (`Bash(ls*)` matches `lsof`; command chaining defeated CVE-2025-55284's allowlist; exec wrappers like `watch`/`find -exec` can't be safely prefix-approved) — generated allowlists stay narrow and exact (https://code.claude.com/docs/en/permissions.md, current).
- **Component policy** (AGENTS.md lines + settings): MCP server list checked into source control; skills/plugins/MCP pinned and source-reviewed before install — they execute arbitrary code and vendors do not security-audit them (https://code.claude.com/docs/en/security.md, current). Treat MCP tool descriptions and outputs as untrusted input; description changes after approval are a documented attack (rug pull / CVE-2025-54136).
- **Harness files are attack surface**: AGENTS.md, skills, and hooks get PR review like code; injected instructions in them are indistinguishable from team conventions [consensus; https://vibe-eval.com/updates/agent-skills-are-attack-surface/, 2026].

## Autonomous / CI posture

- Headless and autonomous runs go in containers/VMs with filesystem AND network isolation (egress allowlist). Claude Code's trust verification is disabled under `-p`, so headless loses that gate — the sandbox compensates (https://code.claude.com/docs/en/security.md, current). Never permission-bypass modes on a host machine (documented `rm -rf` incident; vendors' own demos say "run in a container").
- Rule of Two for agent workflows in CI: never combine untrusted input, secret access, and external communication in one workflow; least-privilege short-TTL tokens; agents processing untrusted GitHub content must not have workflow secrets in scope (https://www.microsoft.com/en-us/security/blog/2026/06/05/securing-ci-cd-in-agentic-world-claude-code-github-action-case/, 2026-06-05).
- Org enforcement (teams with managed settings): `disableBypassPermissionsMode`, `allowManagedPermissionRulesOnly`, ConfigChange audit hooks (https://code.claude.com/docs/en/managed-settings, current).

## Agent-written code gates

- AI-generated code carries measurably elevated vulnerability rates (flaws in 45% of tests across 100+ models, https://www.veracode.com/resources/analyst-reports/2025-genai-code-security-report/, 2025-10; privilege-escalation findings +322% in AI-heavy orgs, https://apiiro.com/blog/4x-velocity-10x-vulnerabilities-ai-coding-assistants-are-shipping-more-risks/, 2025-09). Newer models are not automatically safer.
- CI gates to recommend where the team has CI: secret scanning + dependency review always; SAST and an AI security review (e.g. the claude-code-security-review action or `/security-review`) for services handling untrusted input [scale to repo risk].
- Anti-slopsquatting rule for AGENTS.md: agent-added dependencies must be verified to exist and be the intended package — hallucinated package names are a registrable attack surface (5–22% hallucination rates by model; https://socket.dev/blog/slopsquatting-how-ai-hallucinations-are-fueling-a-new-class-of-supply-chain-attacks, 2025).
- Attribution/provenance for OSS: `Assisted-by:` trailer convention; some projects (QEMU, Gentoo) refuse AI contributions outright — the generator respects an existing policy, never overrides it (see team-workflows.md).

## What NOT to generate

- No security theater: rules duplicating what the sandbox/platform already enforces, or long threat-model essays in AGENTS.md. Encode enforcement in settings; instructions carry only the judgment rules (verify dependencies, treat external content as untrusted).
- Don't break workflows by default: deny lists beyond secrets/exfil (e.g. denying all curl) only when the repo's profile shows no legitimate need, and note every such rule in the generation report so the team can adjust.
