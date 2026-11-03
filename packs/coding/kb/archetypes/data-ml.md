---
topic: archetypes/data-ml
reviewed: 2026-08-24
---

# Data/ML archetype

Two problems define this archetype: the agent can't SEE the data, and ML verification is the most gamed verification there is (reward hacking hit 30% of runs on ML research tasks — call-stack answer lookup, disabled CUDA timers, monkey-patched evaluators; "don't cheat" instructions barely helped — https://metr.org/blog/2025-06-05-recent-reward-hacking/, 2025-06-05).

## Making data visible

- Schema/data contracts in AGENTS.md per pipeline: exact input/output columns, time boundaries, idempotency (merge/upsert) semantics — "schema assumptions" (inventing column names) is a named failure mode (https://www.astronomer.io/blog/best-practices-for-writing-airflow-dags-with-ai/, 2025-12-03).
- Profiling commands the agent can RUN instead of guessing; orchestrator/warehouse MCPs that expose real run data, lineage, and model schemas ("pull real execution data when investigating rather than making assumptions" — https://www.astronomer.io/blog/introducing-ai-agent-tooling-bringing-airflow-intelligence-to-your-local-workflow/, 2026-02-05; dbt MCP discovery/semantic-layer tools — https://docs.getdbt.com/docs/dbt-ai/about-mcp, 2026-08-19 [semantic-layer benefit is vendor-asserted, unevaluated]).
- Data-shaped verifiers where unit tests can't see: pandera schemas + statistical checks as runtime decorators (https://pandera.readthedocs.io/en/stable/, current), dbt tests, expectation suites — AI "fails quietly by being convincingly wrong" without trust signals (https://greatexpectations.io/blog/trustworthy-ai-agents-the-data-quality-pillar-of-the-ai-context-layer/, 2026-04-21).

## Pipelines

- Cheap static verify loop first: dbt Fusion parse/compile catches SQL errors before the warehouse (https://docs.getdbt.com/docs/fusion/about-fusion, current); DAG-parse tests for orchestrators; then `dbt test`/`build` via MCP.
- Version pins in AGENTS.md are unusually load-bearing here: agents "mix and match syntax" across orchestrator major versions (Airflow 1.x–3.x) — pin version, executor, providers, TaskFlow preference (https://www.astronomer.io/blog/best-practices-for-writing-airflow-dags-with-ai/, 2025-12-03).
- Golden-record example pipelines checked into the repo (e.g. `docs/ai-patterns/`) for pattern-matching — the documented alternative to agents averaging outdated idioms (same source).
- Vendor skills exist for the big orchestrators (astronomer/agents skills + `af` CLI; dagster-expert skill + Dagster+ MCP) — wire the one the repo uses (https://docs.dagster.io/getting-started/ai-tools, current).

## Notebooks

- Agents work better with notebooks stored as plain Python with defined execution semantics — marimo's whole design (git-diffable, no hidden state, `marimo check --format=json` as an agent lint loop, pytest-able) (https://marimo.io/blog/claude-code, 2025-09-07; /blog/marimo-check, 2025-09-26) [all evidence vendor-side; no independent head-to-head]. Notable design datapoint: marimo built then ABANDONED an MCP tool layer in favor of direct kernel access with a scratchpad + transactional cell edits (https://marimo.io/blog/notebooks-as-a-tool-for-agents, 2026-07-20).
- .ipynb repos: harness-native support is fine for editing (Claude Code reads cells+outputs, NotebookEdit per cell); jupyter-mcp-server for live-kernel state if needed. Encode notebook-to-module discipline (logic in modules, notebooks as thin drivers) [practitioner consensus, no strong citation].

## ML training code

- Baseline expectation: agents are WEAK here (best setup medaled in 17% of Kaggle-style tasks — https://arxiv.org/abs/2410.07095, 2025) — scope tasks tightly.
- The proven loop shape: constrain the editable surface + verify with a REAL run. The strongest documented case allowed edits only to `train.py`, verified every change with an actual training run, and read logs as feedback — ~910 experiments over 8h, measurable improvement (https://skypilot.ai/blog/scaling-autoresearch, 2026-03-18). Harness version: a smoke-train command on tiny data, fixed seeds, multi-seed evals (≥3 seeds, mean±SE — MLE-bench's own guidance).
- Tamper-resistant verification is mandatory (see reward-hacking above): held-out graders the agent can't read, read-only fixtures, verify training actually ran (wall-clock/loss curves), evidence-not-assertion.
- Experiment tracking: official MCP servers exist (W&B, MLflow — the latter currently trace/GenAI-centric) — wire only for teams already on them.

## Environment

- uv now handles CUDA-indexed PyTorch (`[tool.uv.index]` + platform markers, `--torch-backend=auto` — https://docs.astral.sh/uv/guides/integration/pytorch/, current); pixi/conda still owns non-Python native deps; never mix conda and PyPI within the torch dependency chain (https://pixi.prefix.dev/latest/python/pytorch/, current).
- State explicitly in AGENTS.md what the agent CANNOT verify locally (no GPU) and the remote-run command that substitutes (`sky launch` + `sky logs` pattern, https://skypilot.ai/blog/agent-skill, 2026-04-09) — otherwise agents assert success on code they never ran.

## Emission checklist

AGENTS.md (version pins, schema contracts, profiling commands, smoke-train + seed policy, GPU limits + remote-run command, notebook policy) → per-layer runnable checks (marimo check / Fusion parse / DAG validation / pandera suites) → golden-record examples → vendor skill/MCP wiring per stack → tamper-resistant eval fixtures for training repos.
