---
topic: scheduler-recipes
reviewed: 2026-11-03
---

# Configure a maintenance schedule

The user chooses, configures, and enables the scheduler. The core generates no scheduler configuration, installs no jobs, and assumes no forge. These recipes are reference instructions, not registered schedules. Provider-specific recipes apply only when the user selects that provider.

Before scheduling, choose one role and an execution environment that satisfies its `requires`. Supply the complete role contract and body to the chosen harness. Preserve its no-op behavior, evidence, per-run limits, project tests, optional `/verify`, automated review, human review, and prohibition on auto-merge. A schedule grants no additional permission.

For command-based recipes, `run-maintenance` means a user-owned launcher, not a core command. The user supplies absolute executable and checkout paths, authentication, output capture, and overlap prevention. For Claude Code, `claude -p` is the documented non-interactive entry point; configure permitted tools for the selected job. Do not assume an interactive shell environment or that `/verify` is built in. ([Headless documentation](https://code.claude.com/docs/en/headless), accessed 2026-11-03.)

Credential handling and write restrictions below are repository policy: keep secrets out of prompts, committed configuration, command arguments, and logs. Local edits require filesystem write access; publishing requires separately authorized branch-push and review-request access on the user's chosen forge. Without publishing access, return a diff or report. GitLab calls its review request a merge request. Confirm time zones and the next run in the selected scheduler; do not copy a UTC role cadence into a local-time scheduler without conversion.

## 1. cron

- Configure: the user adds `7 3 * * * /absolute/path/run-maintenance` to their crontab. The launcher selects the checkout. Cronie supports `CRON_TZ=UTC`; other implementations' support is **UNVERIFIED** here.
- Machine-awake/cloud: use an awake local or remote host with its cron daemon running. Do not rely on wake or catch-up; those guarantees are **UNVERIFIED** for the user's installed daemon.
- Secrets: provide authentication through the scheduled user's existing credential mechanism, not crontab text. Unattended credential availability must be checked by the user.
- Repo writes: the crontab owner's identity needs write access to the isolated checkout; remote publication needs the separate forge rights described above.

Source: [Cronie upstream crontab manual](https://github.com/cronie-crond/cronie/blob/master/man/crontab.5), accessed 2026-11-03.

## 2. systemd user timer

- Configure: the user creates a matching user service and timer. The service sets `WorkingDirectory=` and an absolute launcher in `ExecStart=`. The timer uses `OnCalendar=*-*-* 03:07:00 UTC`; choose `Persistent=true` to catch a missed calendar activation after inactivity.
- Machine-awake/cloud: the host and user manager must be running. User lingering can keep the manager active after logout. A user timer does not guarantee waking the host; `WakeSystem=` generally requires the system manager's privileges.
- Secrets: use supported systemd credentials, such as `LoadCredential=`, and a launcher that consumes them. Do not put secrets in `Environment=`; installed-version support must be checked.
- Repo writes: the service user's filesystem and forge rights control editing and publication.

Sources: [timer](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html), [calendar syntax](https://www.freedesktop.org/software/systemd/man/latest/systemd.time.html), [user lingering](https://www.freedesktop.org/software/systemd/man/latest/loginctl.html), [execution and credentials](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html); accessed 2026-11-03, current manuals identify systemd 262.

## 3. launchd

- Configure: the user creates a LaunchAgent plist in `~/Library/LaunchAgents/` with a unique `Label`, absolute launcher in `ProgramArguments`, checkout `WorkingDirectory`, and `StartCalendarInterval` containing `Hour=3` and `Minute=7`. The user loads it; the core does not.
- Machine-awake/cloud: this is local, under a logged-in user's agent. Apple's archived guide says calendar jobs missed during sleep run on wake, while powered-off runs wait for the next matching time. Current hardware and macOS power-state behavior is **UNVERIFIED**; keep the Mac awake for predictable execution.
- Secrets: use the user's tested credential mechanism; unattended Keychain availability is **UNVERIFIED** here. Keep secrets out of the plist.
- Repo writes: the logged-in identity needs checkout write access and separate forge publication rights.

Sources: Apple [launch agents](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html) and [timed jobs](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/ScheduledJobs.html), archived guide updated 2016-09-13; accessed 2026-11-03.

## 4. Windows Task Scheduler (`schtasks`)

- Configure: the user can register `schtasks /create /tn "Maintenance" /tr "C:\Maintenance\run-maintenance.cmd" /sc DAILY /st 03:07 /it`. The batch launcher selects the checkout and harness. This example runs only while its user is logged in.
- Machine-awake/cloud: local Windows execution requires an available host. `WakeToRun` is a separate task setting, not enabled by this command; hardware and power-policy wake behavior is **UNVERIFIED** here.
- Secrets: authenticate the scheduled identity separately. Do not place account passwords in `/rp` arguments or agent secrets in the command or task definition.
- Repo writes: that identity needs checkout write access and authorized forge credentials for publication. Do not use `SYSTEM` merely to obtain write access.

Sources: Microsoft [schtasks create](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks-create), accessed 2026-11-03; [WakeToRun](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-waketorun), updated 2020-12-11, accessed 2026-11-03.

## 5. GitHub Actions schedule

- Configure: the user adds a workflow on the default branch with `on.schedule` and `cron: '7 3 * * *'`. UTC is the default. Check out the repository, prepare the toolchain, and invoke the chosen harness. Claude users may choose `anthropics/claude-code-action@v1` with `prompt` and `claude_args`.
- Machine-awake/cloud: GitHub-hosted execution does not need the user's laptop; a self-hosted runner must be online. The minimum schedule interval is five minutes. Scheduled runs use the default branch and can be delayed or dropped under load.
- Secrets: use Actions secrets or a documented provider identity method. Configure Claude authentication separately from forge authentication.
- Repo writes: for PR publication, authorize branch pushes and PR creation. With `GITHUB_TOKEN`, scope `contents: write` and `pull-requests: write` subject to repository and organization policy; checkout access alone is insufficient.

Sources: GitHub [schedule event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets), [token permissions](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token); Anthropic [GitHub Actions](https://code.claude.com/docs/en/github-actions) and [Action v1 README](https://github.com/anthropics/claude-code-action/blob/v1/README.md); accessed 2026-11-03.

## 6. GitLab CI scheduled pipelines

- Configure: the user prepares a valid `.gitlab-ci.yml` job that invokes their launcher, with a `rules` entry containing `if: '$CI_PIPELINE_SOURCE == "schedule"'`. In **Build > Pipeline schedules**, choose the target ref, cron interval, and displayed time zone. Instance policy limits maximum frequency.
- Machine-awake/cloud: GitLab schedules the pipeline; an eligible hosted or self-managed runner must be available. The user's laptop can be off unless it is the runner. Scheduled pipelines use the schedule owner's permissions.
- Secrets: use protected, masked or hidden CI/CD variables, or an external secret provider. Match protected-variable availability to the selected ref.
- Repo writes: authorize the checkout identity and credentials for branch push and merge-request creation. Do not assume `CI_JOB_TOKEN` can publish: repository push requires an explicit project setting, and merge-request creation needs separately verified API authorization.

Sources: GitLab [scheduled pipelines](https://docs.gitlab.com/ci/pipelines/schedules/), [job rules](https://docs.gitlab.com/ci/yaml/#rulesif), [variables](https://docs.gitlab.com/ci/variables/), [job-token push setting](https://docs.gitlab.com/ci/jobs/ci_job_token/#allow-git-push-requests-to-your-project-repository); accessed 2026-11-03.

## 7. Claude cloud `/schedule`

- Configure: the user runs `/schedule` in an authenticated local Claude Code session, supplies the role prompt, repository, environment, and cadence, then reviews the saved task. Current docs call routines scheduled tasks. Custom five-field cron uses UTC unless a `CRON_TZ=` prefix specifies otherwise; intervals shorter than hourly are rejected.
- Machine-awake/cloud: cloud tasks run on Anthropic infrastructure or a configured organization-hosted environment. No open laptop is needed; organization policy, usage limits, and permission prompts can block execution. `/schedule` itself is unavailable inside cloud sessions.
- Secrets: use the environment's documented network-secrets mechanism for API keys, and include only needed connectors. Do not paste tokens into the prompt.
- Repo writes: this product currently selects connected GitHub repositories. Authorize that identity for branch push and PR creation; local credentials and transcripts do not become cloud resources. This provider constraint is not a core forge requirement.

Source: [Claude scheduled tasks](https://code.claude.com/docs/en/routines), accessed 2026-11-03; research preview, so behavior and limits may change.

## 8. Codex automations

- Configure: the official Codex automations URL now redirects to ChatGPT **Scheduled tasks**. The user creates the task in the desktop app, selects a local project, supplies the role prompt, and chooses a cadence. Prefer the offered isolated worktree for a Git repository. The CLI has no Scheduled management interface.
- Machine-awake/cloud: local project tasks need the computer on, the desktop app running, and the project available on disk. Web tasks cannot directly use a local folder; do not treat them as an equivalent local-repository scheduler.
- Secrets: authenticate the app and provide only the job's authorized credentials through a tested runtime mechanism. An automation-specific secret-vault or injection interface is **UNVERIFIED** in the cited page; do not invent one or embed secrets in prompts.
- Repo writes: the task's sandbox must permit checkout edits. Remote publication additionally needs authorized forge tooling and credentials; scheduling alone grants neither. Preserve the user's default sandbox boundaries.

Source: official OpenAI [Codex automations URL](https://developers.openai.com/codex/app/automations/), currently redirecting to [Scheduled tasks](https://learn.chatgpt.com/docs/automations?surface=app); accessed 2026-11-03.
