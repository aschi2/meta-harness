---
topic: languages/cpp
reviewed: 2026-08-24
---

# C++ playbook

C++ is the worst mainstream language for agents on benchmarks (3.1% resolved on Multi-SWE-bench vs 44.6% Python, same model — https://arxiv.org/html/2504.02605v1, 2025-04; bottom of SWE-bench Multilingual). But outcome tracks HARNESS INVESTMENT: a reported 15-hour autonomous run shipped an ASan-verified 2x database speedup — and spent 10 of those 15 hours discovering how to build and run ASan, which pre-wired sanitizer infra would have eliminated (~3x wall-time estimate) (https://www.deeplake.ai/blog/coding-agent-15h, 2026-01-28) [single-source case study — a follow-up search could not corroborate it; the underlying mechanisms (ccache, sanitizer presets, staged tests) are corroborated by primary tool docs]. C++ repos get the FULLEST harness this KB generates.

## Build system (the load-bearing layer)

- **One blessed build path, in AGENTS.md, via CMake presets**: `cmake --preset <name>` / `cmake --build --preset <name>` / `ctest --preset <name>` — presets exist exactly to make configuration shareable and discoverable (https://cmake.org/cmake/help/latest/manual/cmake-presets.7.html, current). CMakePresets.json checked in; CMakeUserPresets.json not.
- **compile_commands.json is mandatory**: `-DCMAKE_EXPORT_COMPILE_COMMANDS=ON`, symlinked to repo root — without it clangd (and every clangd-based agent tool) can't resolve includes (https://clangd.llvm.org/design/compile-commands, current). Non-CMake: `bear -- make`. Regenerate, never hand-edit, don't commit.
- **Build caching makes the loop viable**: ccache (or sccache for shared/remote caches) turned 30-minute full builds into <1-minute incrementals in the Deep Lake run — described as essential. Ninja over Make so incremental builds don't hit agent command timeouts.
- Pre-warm before agent sessions: compile_commands generated + one full build done, so clangd indexes immediately and the first loop is incremental [practitioner guidance, corroborated by primary docs].

## Verification loop

- clang-format on edit; **clang-tidy** with `bugprone-*, cppcoreguidelines-*, modernize-*, performance-*` against the compilation database — targets exactly the raw-ownership and stale-idiom output agents produce (https://clang.llvm.org/extra/clang-tidy/, current). `.clang-tidy` checked in.
- **Sanitizers as CI floor**: ASan+UBSan together on every PR build agents touch (~2x overhead, one build); TSan nightly (5–10x, exclusive with ASan) (https://wrocpp.github.io/toolset/sanitizers-2026/, 2026-05-03). Critical flag: `-fno-sanitize-recover=...` — UBSan prints-and-continues by default, so an agent reading exit codes misses every violation (https://clang.llvm.org/docs/UndefinedBehaviorSanitizer.html, current). ASan builds need `-fno-omit-frame-pointer -O1` for usable traces. Sanitizers only fire on exercised paths — pair with real tests.
- Warnings-as-errors scoped to first-party targets (`CMAKE_COMPILE_WARNING_AS_ERROR`, CMake ≥3.24) — global -Werror wedges loops on vendored code [low-confidence consensus].
- Single-test invocation in AGENTS.md: GoogleTest `--gtest_filter=Foo.*` + `--gtest_fail_fast`; Catch2 name/tag specs; or ctest test presets.
- Staged testing for long runs: fast tests in the loop, full suite pre-PR.

## AGENTS.md lines (documented C++ canon)

Build/test incantations verbatim; C++ standard pinned (and which C++26 features are allowed — compiler support varies); "smart pointers, no raw owning pointers; RAII for every owned resource"; sanitizer expectations ("sanitizer-clean CI mandatory"); `include/<project>/` + `src/` layout with one TU per public header; forbidden-modification list (vendored/generated); ABI rule: header-layout/vtable/exported-symbol changes need human sign-off; anti-hallucination rules: verify stdlib functions and header locations via LSP hover/definition, always compile after changes; monorepos: one agent per CMake target, no editing another target's exposed headers (https://wrocpp.github.io/toolset/ai-coding-agents-for-cpp/, 2026-05-27 [dated but authorship unclear; build advice corroborated by primary docs]).

## Navigation

Grep genuinely fails in C++ — overloads, templates, macros need compile-context (https://clangd.llvm.org/design/compile-commands, current). clangd-based tooling is the answer and everything depends on compile_commands.json: Serena MCP (C/C++ via clangd) or a clangd MCP server; known gap: deeply nested template/SFINAE instantiations stay opaque — hover concrete instantiations, and excerpt template error floods before they blow the context window. Truncated/verbose build output is itself a failure mode — keep agent-facing build commands quiet on success.

## Calibration

- Failure reports cluster around stock-harness usage; successes around invested harnesses [synthesis across sources, not a cited claim]. Set expectations accordingly in the generation report.
- Large C++ projects are setting explicit AI policies (LLVM: human review + `Assisted-by:` disclosure + NO autonomous agent contributions, https://llvm.org/docs/AIToolPolicy.html, 2026-08; Ladybird stopped public PRs entirely). For OSS C++ repos, the harness must encode the project's policy, and autonomous/ABI-touching work defaults to supervised.
- Keep agent-touchable surfaces text-based — binary asset pipelines (e.g. Unreal) are documented agent-hostile territory versus text-based ones [HN practitioner reports, anecdotal].
