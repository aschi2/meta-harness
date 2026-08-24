---
topic: archetypes/mobile
reviewed: 2026-08-24
---

# Mobile archetype (Flutter, iOS, Android, React Native)

Mobile's defining traits: device-in-the-loop verification, binary toolchains agents fumble, and signing as a hard supervision boundary. First-party agent tooling matured fast in 2026 — prefer it over community MCPs.

## Platform tooling (what to wire)

- **Flutter has the most complete first-party stack**: official Dart/Flutter MCP server (analysis, format, tests, pub, and RUNTIME tools — widget tree, screenshots, taps, hot reload, error retrieval), official rules files in four sizes with a per-tool filename mapping, and an official plugin (`claude plugin install dart-flutter@dart-flutter`) (https://docs.flutter.dev/ai/mcp-server; /ai/ai-rules; /ai/get-started, 2026-08). Caveat: enabling flutter_driver for agent control disables real keyboard input — gate behind `--dart-define=ENABLE_FLUTTER_DRIVER=true`.
- **iOS**: XcodeBuildMCP (Sentry-maintained) is the consolidated build/test/simulator standard — it exists because raw `xcodebuild` invocations fumble; simulator tools need NO code signing, device tools do, so the agent loop stays on simulators (https://github.com/getsentry/XcodeBuildMCP, 2026-08). UI interaction: ios-simulator-mcp (pin ≥1.3.3 — earlier versions had command-injection vulns) or mobile-mcp.
- **Android**: Google shipped an official agent-first CLI — emulator lifecycle, `screen capture`/`layout --diff` (UI as JSON), Compose preview rendering, `docs search` and `version-lookup` against the Android Knowledge Base, skills install via `init` (https://developer.android.com/tools/agents/android-cli, 2026-08-21). Known trap: Gradle configuration cache conflicts with AI test tooling — Google's own workaround is disabling it (https://developer.android.com/studio/preview/gemini/journeys, current).
- **Expo/RN**: `create-expo-app` now generates AGENTS.md + CLAUDE.md + settings with the official Expo plugin; Expo MCP covers docs, installs, EAS builds; keep what it generates (https://docs.expo.dev/agents.md, 2026-08-12). Bare RN has no equivalent first-party story.
- Interaction model: accessibility-tree/JSON-first beats screenshots for determinism and tokens; vision only where semantics are missing [synthesis across tools].

## Verification ladder

Cheapest tier that answers the question, documented in AGENTS.md:

1. Unit/widget tests, headless (`flutter test --plain-name`, `-only-testing:Target/Class/test`, `./gradlew :module:testDebugUnitTest --tests`); single-test syntax spelled out.
2. JVM-side screenshot tests — no emulator, deterministic: Paparazzi or Roborazzi (agent-native features: deterministic UI-tree JSON dumps, ships as an agent skill) on Android; Compose Preview Screenshot Testing (official, alpha) (https://github.com/takahirom/roborazzi, current; https://developer.android.com/studio/preview/compose-screenshot-testing, 2026-06).
3. Simulator/emulator screenshot + interaction via the platform tool; Gradle Managed Devices with headless ATD images for CI (screenshot tests needing hardware rendering unsupported on ATDs).
4. Human review of user-facing UI.

Baseline discipline: iOS snapshots must be compared on the EXACT simulator that recorded them — name it in AGENTS.md (https://github.com/pointfreeco/swift-snapshot-testing, current); Git LFS for snapshot PNGs (Paparazzi's own recommendation); baseline-refresh commands named, and the agent that wrote the code doesn't solo-approve baseline updates (see testing-strategy.md).

## Build harnessing

Blessed build path per platform in AGENTS.md, never raw invocations. Stale-binary confusion is a documented failure (agent runs old build, misreads results) — Poltergeist's wait-for-fresh-build-then-launch pattern is the purpose-built fix for iOS/mixed workspaces (https://github.com/steipete/Poltergeist, current). Build-once-test-many (`--build-for-testing`/`--test-products-path`) where XcodeBuildMCP is wired.

## Docs currency (acute on mobile)

Apple's docs are JS-rendered and INVISIBLE to agents — emit the sosumi.ai pointer (URL-substitution proxy + MCP/skills) for Swift/SwiftUI work [third-party trust dependency — note it]; Android agents get `android docs search`/`version-lookup`; Flutter/Expo rules files and skills exist "instead of relying on training data alone" (https://sosumi.ai, current; sources above). AGENTS.md line: never trust training data for SDK versions or APIs — look them up.

## Hard supervision boundary

Agents do not touch: certificates, provisioning profiles, keystores, store submission, privacy manifests. fastlane match in `readonly` mode is the CI automation ceiling (prevents accidental cert creation/revocation — https://docs.fastlane.tools/actions/match/, current). Encode as AGENTS.md prohibition + settings deny rules on key material. iOS permission rule worth one line: any new protected-resource API needs its NS*UsageDescription key in the same change — a missing key is a runtime crash invisible to build+unit-test verification.

## Emission checklist

AGENTS.md (blessed builds, single-test syntax, verification ladder, baseline rules, docs pointers, signing prohibition) → platform tool wiring (Flutter plugin / XcodeBuildMCP / Android CLI init / Expo defaults) → format/lint hooks (dart format+analyze; SwiftFormat/ktlint per stack) → JVM screenshot-test scaffolding where the stack supports it → LFS config for baselines.
