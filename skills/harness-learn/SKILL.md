---
name: harness-learn
description: Turn a recurring correction into a tested command rule, code rule, or a prose instruction.
---

Use this when the user asks to make a correction enforceable.

1. Decide whether the correction is deterministic from a pending shell command, from source syntax, or requires judgment. Keep judgment calls in the relevant prose. Explain when no rule is appropriate.
2. Choose `command` when the shell command and harness context are enough to decide. Choose `code` when an AST pattern is enough to decide. For command rules, cover the original blocked operation and its nearest allowed neighbor in both Claude and Codex hook input shapes. For code rules, cover one matching and one nonmatching source example.
3. Scaffold the rule and fixture with `meta-harness learn new command|code <id> [--scope overlay|harness|pack:<name>]`. The default scope is the current harness when one exists, otherwise the personal overlay. Never put machine-specific rules in a shared pack.
4. Edit the generated starter rule to encode the original correction. Keep the scope narrow and preserve safe neighboring operations. Path globs in code rules are relative to the harness root.
5. Run `meta-harness learn test [--scope ...]`. Fix every failing fixture before reporting the rule complete. Never install hooks or change user settings as part of learning a rule.
6. Name the exact memory or instruction file made redundant. Do not delete it unless the user asks; retain any history the rule does not replace.

Use current ast-grep documentation through Context7 for rule syntax. Do not claim a shell hook covers direct GUI actions.

See [references/rules.md](references/rules.md) for rule module and fixture formats.
