---
topic: languages/rust
reviewed: 2026-08-24
---

# Rust playbook

Benchmark reality: Rust scores BEST of 9 languages on small well-tested issues (58% SWE-bench Multilingual, 2025) and near-WORST on large multi-file patches (5–16%, Multi-SWE-bench, https://arxiv.org/html/2504.02605v1, 2025-04). Harness consequence: exploit the compiler-as-verifier loop, keep agent tasks bounded, and split workspaces/files small — a 100k-line port succeeded largely by splitting methods into separate files and using deterministic differential testing as the outer verifier (https://blog.vjeux.com/2026/analysis/porting-100k-lines-from-typescript-to-rust-using-claude-code-in-a-month.html, 2026-01-25).

## Verification loop

- Per-edit verifier: `cargo check` (2–3x faster than build); strictness at the COMMAND level — `cargo clippy --workspace --all-targets --all-features -- -D warnings` — never `#![deny(warnings)]` in source (documented anti-pattern: toolchain updates break the build with no code change; https://rust-unofficial.github.io/patterns/anti_patterns/deny-warnings.html, current).
- Tests: **cargo-nextest** (faster, per-test process isolation, retries); single-test via filtersets `cargo nextest run -E 'test(name)'` — worth spelling out in AGENTS.md because agents fumble `cargo test`'s `--` argument syntax (https://lucumr.pocoo.org/2025/6/12/agentic-coding/, 2025-06-12). Nextest does NOT run doctests — the gate must also run `cargo test --doc` (https://nexte.st/, current).
- Compile-time mitigations when the loop is slow: workspace splitting (also an agent-context win), faster linker (mold/lld), sccache, `split-debuginfo = "unpacked"` on macOS (https://corrode.dev/blog/tips-for-faster-rust-compile-times/, updated 2026-03-14).
- Use `--locked` in agent/CI commands so builds don't drift.

## Lints that catch agent mistakes

Config in `[workspace.lints.clippy]` (stable since 1.74), inherited per-crate via `[lints] workspace = true`:

- `unwrap_used`/`expect_used` = deny in prod code, with `allow-unwrap-in-tests = true` in clippy.toml so strict lints don't fight test code (https://rtaw.co.uk/posts/clippy-lints/, 2024-11). Real-repo phrasings: "never `.unwrap()` except in tests" (nushell AGENTS.md, 2026-08).
- The AI-review-time patterns to gate: unnecessary `clone()`, owned `String`/`Vec` where slices suffice, `unsafe` without documented invariants, overly complex lifetimes (https://kodus.io/en/rust-code-review-practices-and-ai-tools/, 2026-05-04). `#![forbid(unsafe_code)]` where the crate permits.
- `pedantic` as warn with overrides; never enable whole `restriction` group (mutually contradictory lints). Prefer `#[expect()]` over `#[allow()]` (ruff AGENTS.md, 2026-08).

## Dependencies and features

- **cargo-deny** in the gate: advisories, license allowlist, banned sources — blocks agent-added deps violating policy (https://embarkstudios.github.io/cargo-deny/, current); centralize versions in `[workspace.dependencies]` so agents don't add divergent per-crate versions; commit Cargo.lock for binaries.
- Feature-flag trap: `--all-features` masks broken individual combos (feature unification); `cargo hack --each-feature` in CI for crates with meaningful features (https://github.com/taiki-e/cargo-hack, current). rust-analyzer diagnostics are feature-sensitive — wrong config gives agents misleading results.

## AGENTS.md lines with pedigree (ruff, nushell, rustfs — all fetched 2026-08)

- Exact commands with flags: check/clippy/nextest/`cargo test --doc`, one umbrella "run before done" gate (`make pre-commit`-style) mirroring CI.
- Error-handling policy: thiserror (libs) / anyhow (bins); no unwrap in libs; "no defaults that convert corruption into a plausible result".
- Cargo process hygiene: wait for a cargo command to finish before starting another (lock contention); avoid `cargo clean`.
- Snapshot-test discipline where insta is used: regenerate via the blessed command, never hand-edit snapshot files.
- Dependency policy in prose: license allowlist, no git deps in PRs.

## LSP

Immature but useful: rust-analyzer-over-MCP bridges exist (young; slow initial indexing, feature-flag sensitivity — https://github.com/zeenix/rust-analyzer-mcp, 2026-08); an official-marketplace rust-analyzer plugin is reported but UNVERIFIED against Anthropic docs — check the marketplace at generation time. Macro expansion is the one capability agents can't approximate with grep — the distinctive Rust LSP win.
