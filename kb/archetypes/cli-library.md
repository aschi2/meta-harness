---
topic: archetypes/cli-library
reviewed: 2026-08-24
---

# CLI tool / library / SDK archetype

Consumers are other developers, so the public API and the release pipeline are the crown jewels — real library AGENTS.md files converge on fencing agents OUT of both. Everything below is grounded in shipped AGENTS.md files (cargo-semver-checks, openai-python, ruff, uv, bun, openai/codex, cli/cli — all fetched 2026-08-24).

## Public-API discipline

- API-diff tool as a CI gate, named in AGENTS.md: cargo-semver-checks (Rust; deny/warn lint levels, witness programs), `griffe check` (Python), API Extractor's committed `.api.md` report (TS), apidiff (Go). The gate makes "you broke the API" machine-detectable instead of review-dependent.
- Explicit fence lines (verbatim patterns from real repos): never touch `package.version`, `.github/`, CODEOWNERS, or license files (cargo-semver-checks AGENTS.md); public-API changes require human/CODEOWNER sign-off; don't add feature-table entries unless asked (features are public API in Rust).
- Version-floor discipline: read `rust-version`/`requires-python`/`engines` and target it; NEVER bump it unrequested; where the floor spans many files, a deterministic sync-check script proves the surfaces agree (openai-python's pattern, including a human-approval gate agents "must not bypass — including through a human's credentials").
- Generated-SDK repos: "generated code is the API" — handwritten code stays small and never alters exported surfaces; openai-python enforces a custom-code BUDGET with human sign-off to increase it.

## Docs as verification

- Executable docs so they can't rot: rustdoc doctests, pytest-examples (runs+lints docstring/markdown examples), Twoslash (type-checks TS doc blocks), ruff-style mdtests. Wire whichever the stack supports into the standard test run.
- Embedded `--help` output kept honest mechanically: cog-style blocks + a `--check` in CI that fails when README drifts from actual help text (https://til.simonwillison.net/python/cog-to-update-help-in-readme, 2021, still the pattern).
- The commit unit is implementation + tests + docs + issue link ("the perfect commit") — Willison's pre-agent discipline is now his agent harness; his 226 published tools carry per-commit links to the transcripts that produced them (https://simonwillison.net/2022/Nov/26/productivity/; https://tools.simonwillison.net/colophon, 2026-08-24).
- Changelog: conventional commits (release-please) or a changeset file per PR as the reviewable version-intent artifact; dated release notes.

## Backward compatibility

- Downstream test suites run against your main: pydantic runs FastAPI/SQLModel/Beanie's tests on cron + label-trigger; urllib3 has botocore/requests nox sessions. Recommend for libraries with major dependents; overkill below that [judgment].
- Lockfile conservatism as an explicit agent rule: never mass-update dependencies; precise, minimal bumps only (uv AGENTS.md verbatim).
- Pre-release adversarial review is a documented win: an agent prompted to attack the diff-since-last-major found 4 release blockers before sqlite-utils 4.0 shipped (https://simonwillison.net/2026/Jul/7/sqlite-utils-4/, 2026-07-07).

## Cross-platform reality

Agents can't run the CI matrix — the harness states what CI covers that local can't, the local approximation command (`cargo xwin clippy` for Windows-from-Unix; bun's check-all-targets script; note `#[cfg]`-gated code isn't type-checked unless that target builds), sandbox caveats per test class ("file-watcher tests don't work in the sandbox"), and a "here's what CI runs and how to reproduce each check" section (cargo-semver-checks' pattern). Optionally CI-feedback commands (bun's `ci:errors`/`ci:watch`).

## Release safety (the hard fence)

- Humans merge Release PRs; agents never publish. release-please/changesets keep versioning reviewable; publishing via Trusted Publishing (OIDC, 15-minute tokens) with separate build/publish jobs and `id-token: write` only on the upload job (openai-python AGENTS.md; https://docs.pypi.org/trusted-publishers/, current).
- Supply-chain rules agents must follow: SHA-pin third-party Actions; never introduce `pull_request_target` workflows or suppress dangerous-trigger lints (uv) — a `pull_request_target` injection is exactly how the nx compromise started (https://nx.dev/blog/s1ngularity-postmortem, 2025-09-05).
- Generated release workflows carry a "regenerate via the tool, never hand-edit" note (ruff/cargo-dist pattern).

## Emission checklist

AGENTS.md: commands (narrow tests, docs build), API-diff gate + fence lines, version-floor rule, snapshot protocol, test-integrity rules ("fix the problem, never delete the test"; "never assume failures are pre-existing" — uv), scope discipline, cross-platform section, release-safety block, changelog rule. CI: API-diff check, docs-as-tests, trusted-publishing pipeline if the generator touches release config at all (prefer advising over editing existing release pipelines).

Calibration: harness size for libraries is genuinely unconverged — bun/codex ship 16–22KB rule-dense files, Willison ships 425 bytes plus strong tests/docs. Default to small + strong gates; grow the file only from observed failures (see context-files.md).
