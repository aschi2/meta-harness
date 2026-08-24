---
topic: runtime-feedback
reviewed: 2026-08-24
---

# Runtime feedback and debugging surfaces

How agents see what running code actually does. Vendors state the problem identically: "coding agents are not able to see what the code they generate actually does when it runs" (https://developer.chrome.com/blog/chrome-devtools-mcp, 2025-09-23; https://nextjs.org/blog/agentic-future, 2026-02-12). The harness closes that gap per project kind.

## Logs first (the highest-ROI surface)

- Log to a FILE as well as the terminal, always, and document the path in AGENTS.md — the agent reads logs without human relay (https://lucumr.pocoo.org/2025/6/12/agentic-coding/, 2025-06-12). Balance verbosity for token economy.
- Browser-console → terminal forwarding is now framework-mainstream: Next.js ≥16.2 ships it default-on at error level, explicitly for agents; Vite has a forward plugin (https://nextjs.org/blog/next-16-2-ai, 2026-03-18; https://github.com/mitsuhiko/vite-console-forward-plugin, 2025). Wire the repo's equivalent.
- Debug-mode flow artifacts to stdout — magic-link emails logged so the agent completes sign-in unaided; scoped API keys so it can curl any endpoint (https://lucumr.pocoo.org/2025/6/12/agentic-coding/, 2025-06-12; https://steipete.me/posts/just-talk-to-it, 2025-10-14). Document seeded test accounts and the seed command.
- Actionable error output is state of the art: labeled fix menus with doc URLs in build/dev output, "written for agents" (https://nextjs.org/blog/next-16-3-ai-improvements, 2026-06-26) — an advisory-report item for repos with poor error messages.

## Dev-server management

Single entry command (`make dev`), duplicate-start guard with an actionable error naming PID + log path — now a framework feature (Next 16.2's lock file) because agents "frequently attempt to start the server without knowing one is running" (https://nextjs.org/blog/next-16-2-ai, 2026-03-18); pidfile guard is the generic equivalent. Background/persistent sessions via the harness's background-task support or tmux.

## Browser loops (web repos)

- One browser surface, documented in AGENTS.md — not several. Current options: **agent-browser** (Vercel's CLI — snapshot + deterministic refs, console/network/screenshots/vitals/React introspection; fastest-adopted tool in the space, and CLI means near-zero context cost — https://github.com/vercel-labs/agent-browser, 2026), **chrome-devtools-mcp** (perf traces, network, console — https://developer.chrome.com/blog/chrome-devtools-mcp, 2025-09-23), **Playwright MCP** (accessibility-tree based, what Copilot's agent ships — https://github.com/microsoft/playwright-mcp, current), or the harness's native browser (Claude in Chrome/Cursor browser). Prefer already-installed native tools, then CLI, then MCP (see mcp-and-tools.md). No rigorous head-to-head exists — pick by what the team already runs.
- Screenshot-compare verification: well-supported for CATCHING regressions and verifying "it renders" (official prompt pattern: implement → screenshot → compare → fix; https://code.claude.com/docs/en/best-practices, current); unproven for pixel-accurate refinement — the one controlled study found self-revision-from-screenshots near-useless on 2024-era models (https://arxiv.org/abs/2403.03163, NAACL 2025). Encode it as a verification step, not a design-iteration engine.
- Visual snapshot tests (Playwright `toHaveScreenshot`) only with environment-pinned baselines (CI container) — cross-platform rendering makes local baselines flaky (https://playwright.dev/docs/test-snapshots, current). Accessibility: Playwright + axe-core as a gate where the team wants it (https://playwright.dev/docs/accessibility-testing, current).
- Design-system repos: expose the system (Storybook MCP) so generation conforms instead of hallucinating components (https://www.chromatic.com/blog/introducing-published-storybook-mcp-servers/, 2026-03-23).

## Debuggers and profilers

- Log/print-first is the de facto practice; interactive debugger access measurably helps (agents with pdb beat agents without across 9 models — https://arxiv.org/abs/2503.21557, 2025-03) but models use debuggers unreliably and ecosystem adoption is ~two orders of magnitude behind browser tools. Default: do NOT wire debuggers into a generated harness; note LLDB's first-party MCP (https://lldb.llvm.org/use/mcp.html, current) as an option for native-code repos on demand.
- Web perf profiling comes free with the browser surface (DevTools MCP traces, agent-browser vitals); standalone profiler MCPs are embryonic — skip.
- Prod-issue reproduction: observability CLI/MCP (sentry-cli is officially recommended; Sentry/Grafana MCPs exist) only for teams already on those services.

## Generator checklist by project kind

- **Web app**: browser surface + console forwarding + dev-server guard + log file + agent auth path + screenshot-verify convention; a11y/visual gates optional.
- **API service**: log-to-file + curl-able endpoints with scoped creds + seed command + structured errors; observability tool if the team has one.
- **CLI tool**: fast runnable check per feature; millisecond run commands; graceful misuse handling ("no such thing as user error" — tools must explain themselves); no browser/debugger wiring.
- **Mobile**: simulator tooling exists and is maturing (XcodeBuildMCP, ios-simulator skills) — see archetypes for specifics when generated.
