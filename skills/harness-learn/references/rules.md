# Rule formats

Read this when creating or reviewing a rule with `meta-harness learn`.

## Command rules

A TypeScript module exports a stable `id` and `check(context)`. The context has the normalized command, original command text, cwd taken only from the hook event's `cwd`, harness (`claude` or `codex`), raw `entrypoint`, parsed shell invocations, and an `inRepo(root)` helper. `isDelegate` is `true` only for Claude's `sdk` entrypoint, `false` for other Claude entrypoints, and `"unknown"` for Codex. Rules that need stricter delegate detection can inspect `entrypoint`. Return a short block message when the command is unsafe; return `null` when it is allowed. A rule exception is reported to stderr and does not deny the command.

Shell parsing follows heredoc boundaries, ignores here-string payloads, and inspects commands inside backticks. If parsing fails, safety rules should inspect `rawCommand` as a fallback so malformed quoting cannot hide an unsafe command.

Each JSON fixture names its `ruleId` and lists raw hook inputs. Include both Claude's `Bash` / `tool_input.command` shape and Codex's shell tool / `tool_input.cmd` shape, with a blocked case and its nearest allowed neighbor in each shape:

```json
{
  "ruleId": "sample-rule",
  "cases": [
    {
      "event": "pre-tool-use",
      "inputShape": "claude",
      "input": { "tool_name": "Bash", "tool_input": { "command": "unsafe" } },
      "expected": "block"
    },
    {
      "event": "pre-tool-use",
      "inputShape": "claude",
      "input": { "tool_name": "Bash", "tool_input": { "command": "safe" } },
      "expected": null
    },
    {
      "event": "pre-tool-use",
      "inputShape": "codex",
      "input": {
        "tool_name": "exec_command",
        "tool_input": { "cmd": "unsafe" }
      },
      "expected": "block"
    },
    {
      "event": "pre-tool-use",
      "inputShape": "codex",
      "input": { "tool_name": "exec_command", "tool_input": { "cmd": "safe" } },
      "expected": null
    }
  ]
}
```

## Code rules

Use ast-grep YAML rules with an id, language, severity (`error` or `warning`), message, optional file globs, and an AST pattern. Globs are relative to the harness root. Checks run on tracked changes and untracked, nonignored files. Errors block the Stop hook and fail `check`; warnings are reported.

Fixture YAML lists source snippets expected not to match under `valid` and expected to match under `invalid`:

```yaml
id: sample-rule
valid:
  - const value = 1
invalid:
  - const value = TODO
```

`meta-harness learn test` runs every rule fixture in the selected scope. A declared command or code rule without a matching fixture is a test failure.

## Sources and defaults

Pack manifests declare `commandRules`, `codeRules`, and `ruleTests` as pack-relative paths. Harness-local rules live under `.harness/rules/command/` and `.harness/rules/code/`, with fixtures under `.harness/rule-tests/`. The owner must approve their current hashes with `meta-harness approve --rules --target <repo>` before hooks or check run them; `learn test` deliberately tests unapproved rules so they can be reviewed first. Without a harness, only overlay rules run.

Overlay packs declare `overlay: true`. Their default location is the platform configuration directory's `meta-harness/overlay/`; `--overlay` overrides `META_HARNESS_OVERLAY`, which overrides that default. `preferences.profile` supplies missing profile fields; explicit plan values win, and the pack's profile schema remains authoritative. Overlay files and pack identities are never copied into a generated harness.

See [hook registration](hooks.md) for project and user-level setup and Codex trust requirements. Rule fixtures use the published `schemas/command-rule-tests.schema.json` definition.

The scanner resolves the executable in `@ast-grep/cli-<platform>-<arch>` (with the platform ABI suffix) directly. Its package files include `ast-grep` or `ast-grep.exe`; it does not depend on the JavaScript shim or postinstall. It passes a packaged empty config and explicit rule definitions, never the repository’s `sgconfig.yml`. Package layout verified against the installed `@ast-grep/cli@0.51.1` `package.json` and `postinstall.js` ([npm distribution](https://www.npmjs.com/package/@ast-grep/cli/v/0.51.1)), 2026-11-03.
