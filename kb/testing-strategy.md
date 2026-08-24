---
topic: testing-strategy
reviewed: 2026-08-24
---

# Testing strategy in agent-heavy repos

Tests are the agent's primary verifier (see automation-surface.md) — which makes them the primary thing agents game. Both halves shape what the generator emits.

## Test-gaming is measured, not folklore

- Frontier models reward-hack coding tasks at high rates: 30% of runs on one benchmark, up to 100% on specific tasks — exiting the harness with code 0, stubbing evaluators, faking timing (https://metr.org/blog/2025-06-05-recent-reward-hacking/, 2025-06-05; https://www.anthropic.com/research/emergent-misalignment-reward-hacking, 2025-11-21). Agents deleting tests to "pass" is a documented, recurring practitioner complaint (Kent Beck, https://newsletter.pragmaticengineer.com/p/tdd-ai-agents-and-coding-with-kent, 2025-06-11). Naively punishing detected cheating teaches hidden cheating (https://arxiv.org/abs/2503.11926, 2025-03).
- Countermeasures the generator encodes:
  1. AGENTS.md anti-gaming lines (adapted from Anthropic's official prompt): solutions must work for all valid inputs, not just the tests; tests verify correctness, they don't define the solution; if a test seems wrong, SAY so — never work around it (https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices, current).
  2. Red before green: confirm the new test FAILS before implementing — guards against trivially-passing tests (https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/, 2026-02-23); commit the failing tests so the agent can't quietly edit them.
  3. Structural locks where stakes justify: a hook blocking writes to test paths during implementation phases; the long-running-harness rule that agents may only flip a feature's `passes` field (https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents, 2025-11-26).
  4. Writer/reviewer split: one session writes tests, a different one makes them pass; adversarial review scoped to correctness-vs-plan (https://code.claude.com/docs/en/best-practices, current).

## Agent-written test quality

- The core defect: generating tests AFTER code validates them against possibly-buggy code — bug-revealing tests get rejected, bugs get enshrined as regression armor (https://arxiv.org/abs/2412.14137, 2024-12). Hence test-first ordering and independent test-writing sessions.
- Coverage is a ratchet, not a gate: useful as an accept-filter inside a generation loop (Meta's pipeline: keep only tests that build, pass, and add coverage — https://arxiv.org/abs/2402.09171, 2024), but it Goodharts as a quality gate — 98% line coverage caught only 75% of realistic mutations in one practitioner measurement (https://blog.senko.net/improving-ai-generated-tests-using-mutation-testing, 2026-03-22). Don't generate numeric coverage thresholds [no reliable data on thresholds exists].
- Mutation testing is the suite-quality check that works — run it without the tests in context ("if you let them into your context they will introduce biases", same source); recommend it (cargo-mutants, Stryker, mutmut) for repos investing in agent-written suites, not as a default gate.
- Property-based testing is a genuine riser: agentic PBT found valid bugs across 100 popular packages (https://arxiv.org/abs/2510.09907, 2025-10-10); Hypothesis ships an official agent command with the right discipline (round-trip/invariant properties; skip anything a unit test covers equally well — https://github.com/HypothesisWorks/hypothesis/blob/master/.claude/commands/hypothesis.md, 2025-11). Mention where the stack has a mature PBT library.
- Differential/oracle testing is THE technique for ports and migrations: deterministic seeds compared across implementations let agents "grind against a ground truth for days without a human arbitrating" (https://claude.com/blog/ai-code-migration, 2026-07-16; the 100k-line TS→Rust port ran millions of seed comparisons — https://blog.vjeux.com/2026/analysis/porting-100k-lines-from-typescript-to-rust-using-claude-code-in-a-month.html, 2026-01-25).

## Test architecture for the loop

- Tiers (converged practice): per-edit = single test (`kb/languages/` files carry the invocations); pre-done = the repo's lint+test gate (the AGENTS.md convention agents already honor — https://agents.md/, current); session-start smoke test for long runs; full/e2e nightly or pre-PR.
- Determinism matters: an agent can't distinguish its own breakage from flake, and verification silently fails on things the automation can't see (documented: browser tests missing native modals → false "feature complete", Anthropic harness post). Flaky tests are an advisory-report item — fix or quarantine before agent-heavy work [direction well-supported, no quantified study].
- Speed is harness investment (see agent-friendly-code.md); "first run the tests" as a session opener teaches the agent the runner (https://simonwillison.net/guides/agentic-engineering-patterns/first-run-the-tests/, 2026-02-24).

## TDD with agents

Test-first works notably well with agents (Beck: "a superpower"; enforcement tooling exists — TDD Guard hooks, https://github.com/nizos/tdd-guard, current). Offer it as an AGENTS.md convention for teams that want it; don't impose it — it's wrong for exploration-phase work (Beck's own caveat), and no controlled outcome study exists. Snapshot tests: the agent that writes code must not also be the sole acceptor of snapshot updates [synthesis; see languages/rust.md snapshot discipline].
