---
topic: languages/python
reviewed: 2026-08-24
---

# Python playbook

## Toolchain the generator assumes

- **uv** for packages and environments; every command runs through `uv run` — never activate venvs, never bare `pip`/`python` (consensus across 2026 guides and real AGENTS.md files: openai-agents-python, Airflow; https://pydevtools.com/handbook/how-to/how-to-configure-ruff-with-claude-code/, 2026-08-19). Commit `uv.lock`; CI uses `--locked`. Existing poetry/pip repos keep their manager — swap the command prefix, don't migrate.
- **Ruff** for lint + format, configured in `pyproject.toml` under `[tool.ruff]`. AGENTS.md must say explicitly "do not call Black/flake8/isort/pylint" — older training nudges agents toward Black (https://pydevtools.com/handbook/how-to/how-to-configure-ruff-with-claude-code/, 2026-08-19).
- **Type checker: contested, so name ONE in AGENTS.md with its exact command.** Live options: pyright (official Claude plugin, ~110k installs), basedpyright (strict defaults, fails on warnings), Astral's ty (fast, beta, official plugin), mypy --strict (no LSP). Default for existing repos: keep whatever's configured; for new repos: pyright via the official plugin, noting ty as the fast-moving alternative (https://pydevtools.com/handbook/explanation/how-do-mypy-pyright-and-ty-compare/, 2026-08-19). Checkers diverge on what they flag — an unnamed checker means inconsistent agent feedback.
- All tool config in `pyproject.toml`, single source of truth.

## Hooks (the proven Python wiring)

- PostToolUse on Edit|Write: `uv run ruff check --fix --quiet` + `uv run ruff format --quiet` on the touched file.
- Stop gate: `uv run <typechecker> >&2 || exit 2` — the stderr redirect and exit 2 are load-bearing (https://pydevtools.com/handbook/how-to/how-to-write-claude-code-hooks-for-python-projects/, 2026-08-19).
- PreToolUse on Bash: block `pip install` and bare `python`, exit 2 with "use uv add / uv run" — models routinely skip venv discipline unless enforced; hooks are the current standard, PATH interceptor scripts the older fallback (https://lucumr.pocoo.org/2025/7/30/things-that-didnt-work/, 2025-07-30).
- Lockfile-only installs are also a security control: 5–22% of LLM-generated package references are hallucinated (https://arxiv.org/abs/2406.10279, rev. 2025-03; see security.md).

## AGENTS.md lines (fill from the repo, verify each)

- Single-test command front and center: `uv run pytest path/to/test.py::TestClass::test_method -xvs`; "prefer running single tests, not the whole suite" (official example guidance, https://code.claude.com/docs/en/best-practices, current).
- One-command bootstrap first (`make sync` / `uv sync`); prohibitions: never edit `pyproject.toml`/`uv.lock` by hand, never install outside uv.
- Name the checker + strictness; require type hints on public functions; ban bare `except:` and mutable default arguments (recurring agent mistakes in practitioner AGENTS.md files, https://gist.github.com/minimaxir/10b780671ee5d695b4369b987413b38f, 2026-02-23).
- Library steering lines where the repo has strong preferences (e.g. "polars, never pandas") — mentions are a strong lever (see context-files.md).

## Documented Python agent failure modes (drive the rules above)

- Installs to system Python / wrong venv; `python test.py` instead of pytest; missing `__init__.py`; applying Black to ruff projects (https://thepromptshelf.dev/blog/claude-code-python-template-guide-2026/, 2026-07-09).
- pytest fixture-injection magic produces incorrect code — prefer plain test functions, explicit `pytest.param` (https://lucumr.pocoo.org/2025/6/12/agentic-coding/, 2025-06-12). Async event-loop bugs from the same source.
- Loop speed is a real tax: interpreter startup + import time is paid on every agent invocation — keep top-level imports light in test paths, diagnose slow collection with `pytest --collect-only` (https://github.com/zupo/awesome-pytest-speedup, current).

## LSP

pyright-lsp plugin (`@claude-plugins-official`) for typed repos; ty's plugin as alternative. Enable via committed `enabledPlugins` per code-navigation.md tier rules.
