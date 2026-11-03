import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init, readHarness, update } from "../src/apply.ts";
import { check } from "../src/check.ts";
import { parseMaintenance, parseRole } from "../src/schema.ts";
import { packRoles } from "../src/roles.ts";
import { validate } from "../src/validate.ts";
import {
  maintenanceList,
  maintenanceToggle,
  maintenanceRun,
  maintenanceStatus,
  maintenanceSchedule,
  RUN_LOG,
  MAINTENANCE_CONFIG,
} from "../src/maintenance.ts";

const INTEGRATION_TIMEOUT_MS = 30_000;
setDefaultTimeout(INTEGRATION_TIMEOUT_MS);
const root = join(import.meta.dir, "..");
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
function git(target: string, ...argv: string[]) {
  const result = Bun.spawnSync(["git", ...argv], { cwd: target });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}
async function workspace(mode = "change", publish = true) {
  const directory = await mkdtemp(join(tmpdir(), "maintenance-test-"));
  directories.push(directory);
  git(directory, "init", "-b", "main");
  git(directory, "config", "user.name", "Fixture");
  git(directory, "config", "user.email", "fixture@example.invalid");
  git(directory, "config", "core.autocrlf", "false");
  git(directory, "config", "commit.gpgsign", "false");
  git(directory, "config", "core.hooksPath", join(directory, "no-hooks"));
  await Bun.write(join(directory, "sample.txt"), "original\n");
  git(directory, "add", "sample.txt");
  git(directory, "commit", "-m", "Fixture");
  await init({
    packName: "coding",
    planPath: join(root, "test/fixtures/plan.json"),
    target: directory,
  });
  const agent = join(directory, "fake agent.ts");
  const publisher = join(directory, "fake publish.ts");
  await cp(join(import.meta.dir, "fixtures/maintenance-agent.ts"), agent);
  await cp(join(import.meta.dir, "fixtures/maintenance-publish.ts"), publisher);
  const resultPath = join(directory, ".harness/publish-result.json");
  const config = {
    agent: [
      process.execPath,
      agent,
      "{prompt_file}",
      "{worktree}",
      "{evidence_file}",
      mode,
    ],
    ...(publish
      ? {
          publish: [
            process.execPath,
            publisher,
            "{branch}",
            "{title}",
            "{body_file}",
            resultPath,
          ],
        }
      : {}),
  };
  const configPath = join(
    directory,
    "..",
    `${directory.split(/[\\/]/).pop()}-owner.json`,
  );
  directories.push(configPath);
  await Bun.write(configPath, JSON.stringify(config));
  await Bun.write(
    join(directory, MAINTENANCE_CONFIG),
    JSON.stringify({
      roles: { "dead-code-remover": { enabled: true, cadence: "7 3 * * *" } },
    }),
  );
  return { directory, config, configPath, resultPath };
}
async function records(target: string) {
  return (await Bun.file(join(target, RUN_LOG)).text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}
function onlyMainWorktree(target: string) {
  expect(
    git(target, "worktree", "list", "--porcelain").match(/^worktree /gm)
      ?.length,
  ).toBe(1);
}

test("all shipped roles validate, base is implicit, and a bad fixture fails", async () => {
  const { directory } = await workspace();
  const { packs, manifest } = await readHarness(directory);
  const roles = await packRoles(packs);
  expect(roles.length).toBe(15);
  expect(manifest.packs?.some((pack) => pack.name === "base")).toBe(true);
  for (const role of roles) {
    expect(parseRole(role)).toEqual(role);
    expect(() => parseRole({ ...role, autoMerge: true })).toThrow();
  }
  const invalid = await validate(join(root, "test/fixtures/bad-role"));
  expect(invalid.errors.join("\n")).toContain("maxPullRequests");
});

test("run uses a fresh worktree, publishes once, logs, and cleans up", async () => {
  const { directory, resultPath, configPath } = await workspace();
  const result = await maintenanceRun(directory, "dead-code-remover", false, {
    configPath,
  });
  expect(result.outcome, result.error).toBe("published");
  expect(await Bun.file(join(directory, "sample.txt")).text()).toBe(
    "original\n",
  );
  expect(git(directory, "show", `${result.branch}:sample.txt`)).toBe("change");
  const calls = (await Bun.file(resultPath).text()).trim().split("\n");
  expect(calls).toHaveLength(1);
  const published = JSON.parse(calls[0]!);
  expect(published.branch).toBe(result.branch);
  expect(published.body).toContain("Before");
  expect((await records(directory)).at(-1)).toEqual(result);
  onlyMainWorktree(directory);
});

test("line cap discards the branch and logs without publishing", async () => {
  const { directory, resultPath, configPath } = await workspace("over-limit");
  const result = await maintenanceRun(directory, "dead-code-remover", false, {
    configPath,
  });
  expect(result.outcome).toBe("failed");
  expect(git(directory, "branch", "--list", result.branch)).toBe("");
  expect(await Bun.file(resultPath).exists()).toBe(false);
  expect((await records(directory)).at(-1).outcome).toBe("failed");
  onlyMainWorktree(directory);
});

test("disabled role refuses unless forced", async () => {
  const { directory, configPath } = await workspace();
  await maintenanceToggle(directory, "dead-code-remover", false);
  await expect(
    maintenanceRun(directory, "dead-code-remover", false, { configPath }),
  ).rejects.toThrow("disabled");
  expect(await Bun.file(join(directory, RUN_LOG)).exists()).toBe(false);
  expect(
    (await maintenanceRun(directory, "dead-code-remover", true, { configPath }))
      .outcome,
  ).toBe("published");
  expect(
    (await maintenanceList(directory)).find((line) =>
      line.startsWith("dead-code-remover"),
    ),
  ).toContain("\toff\t");
});

test("agent failure is logged and its worktree and branch are cleaned up", async () => {
  const { directory, resultPath, configPath } = await workspace("fail");
  const result = await maintenanceRun(directory, "dead-code-remover", false, {
    configPath,
  });
  expect(result.outcome).toBe("failed");
  expect(result.error).toContain("7");
  expect(await Bun.file(resultPath).exists()).toBe(false);
  expect((await records(directory)).at(-1).outcome).toBe("failed");
  expect(git(directory, "branch", "--list", result.branch)).toBe("");
  onlyMainWorktree(directory);
});

test("no changes opens nothing and no forge keeps the accepted branch", async () => {
  const empty = await workspace("no-change");
  expect(
    (
      await maintenanceRun(empty.directory, "dead-code-remover", false, {
        configPath: empty.configPath,
      })
    ).outcome,
  ).toBe("no-changes");
  expect(await Bun.file(empty.resultPath).exists()).toBe(false);
  onlyMainWorktree(empty.directory);
  const local = await workspace("local-only", false);
  const result = await maintenanceRun(
    local.directory,
    "dead-code-remover",
    false,
    { configPath: local.configPath },
  );
  expect(result.outcome).toBe("branch-kept");
  expect(git(local.directory, "show", `${result.branch}:sample.txt`)).toBe(
    "local-only",
  );
  onlyMainWorktree(local.directory);
});

test("enable and disable only edit managed maintenance config; update and check preserve it", async () => {
  const { directory, configPath } = await workspace();
  await maintenanceToggle(directory, "dead-code-remover", true, "0 4 * * 1");
  const manifest = (await readHarness(directory)).manifest;
  expect(manifest.parts?.loop).toContain(MAINTENANCE_CONFIG);
  expect(manifest.files[MAINTENANCE_CONFIG]).toHaveProperty("sha256");
  expect((await check(directory)).errors).toEqual([]);
  await update({
    planPath: join(root, "test/fixtures/plan.json"),
    target: directory,
  });
  expect((await check(directory)).errors).toEqual([]);
  await maintenanceToggle(directory, "dead-code-remover", false);
  expect(
    parseMaintenance(await Bun.file(join(directory, MAINTENANCE_CONFIG)).json())
      .roles["dead-code-remover"]?.enabled,
  ).toBe(false);
  expect(
    await Bun.file(
      join(directory, ".github/workflows/maintenance-dead-code-remover.yml"),
    ).exists(),
  ).toBe(false);
});

test("schedule prints absolute argv and cadence without installing anything", async () => {
  const { directory } = await workspace();
  const before = await Bun.file(join(directory, MAINTENANCE_CONFIG)).text();
  const lines = await maintenanceSchedule(directory, "dead-code-remover");
  expect(lines[0]).toBe("Cadence: 7 3 * * *");
  expect(lines.join("\n")).toMatch(/meta-harness|cli\.ts/);
  expect(lines[1]).toContain("maintenance");
  expect(await Bun.file(join(directory, MAINTENANCE_CONFIG)).text()).toBe(
    before,
  );
});

async function configured(mode = "change") {
  const fixture = await workspace(mode);
  return {
    ...fixture,
    run: () =>
      maintenanceRun(fixture.directory, "dead-code-remover", false, {
        configPath: fixture.configPath,
      }),
  };
}

test("repository cannot select executables; owner config is required and strictly separate", async () => {
  const fixture = await workspace();
  await Bun.write(
    join(fixture.directory, MAINTENANCE_CONFIG),
    JSON.stringify({ ...fixture.config, roles: {} }),
  );
  await expect(
    maintenanceRun(fixture.directory, "dead-code-remover", true, {
      configPath: fixture.configPath,
    }),
  ).rejects.toThrow();
  expect(await Bun.file(fixture.resultPath).exists()).toBe(false);
  expect(() => parseMaintenance({ agent: ["evil"], roles: {} })).toThrow();
});

test("owner verification must pass and its actual output enters the publication body", async () => {
  const fixture = await workspace();
  const verify = [
    process.execPath,
    "-e",
    "console.log('CORE VERIFIED');console.error('REAL STDERR')",
  ];
  await Bun.write(
    fixture.configPath,
    JSON.stringify({ ...fixture.config, verify }),
  );
  expect(
    (
      await maintenanceRun(fixture.directory, "dead-code-remover", false, {
        configPath: fixture.configPath,
      })
    ).outcome,
  ).toBe("published");
  const published = JSON.parse(
    (await Bun.file(fixture.resultPath).text()).trim(),
  );
  expect(published.body).toContain("CORE VERIFIED");
  expect(published.body).toContain("REAL STDERR");
  await rm(fixture.resultPath);
  await Bun.write(
    fixture.configPath,
    JSON.stringify({
      ...fixture.config,
      verify: [
        process.execPath,
        "-e",
        "console.error('verification failed');process.exit(9)",
      ],
    }),
  );
  const failure = await maintenanceRun(
    fixture.directory,
    "dead-code-remover",
    false,
    { configPath: fixture.configPath },
  );
  expect(failure.outcome).not.toBe("published");
  expect(failure.error).toContain("9");
  expect(await Bun.file(fixture.resultPath).exists()).toBe(false);
  onlyMainWorktree(fixture.directory);
});

test.each([
  "missing-evidence",
  "bad-evidence",
  "symlink-evidence",
  "symlink-prompt",
])("external fresh run files reject %s and never publish", async (mode) => {
  const fixture = await workspace(mode);
  const victim = join(fixture.directory, "victim.txt");
  await Bun.write(victim, "PRECIOUS\n");
  fixture.config.agent.push(victim);
  await Bun.write(fixture.configPath, JSON.stringify(fixture.config));
  const result = await maintenanceRun(
    fixture.directory,
    "dead-code-remover",
    false,
    { configPath: fixture.configPath },
  );
  expect(result.outcome).not.toBe("published");
  expect(await Bun.file(fixture.resultPath).exists()).toBe(false);
  expect(await Bun.file(victim).text()).toBe("PRECIOUS\n");
  onlyMainWorktree(fixture.directory);
});

test.each(["self-commit", "history"])(
  "core builds one base-parent commit despite agent %s and detached HEAD",
  async (mode) => {
    const fixture = await configured(mode);
    const base = git(fixture.directory, "rev-parse", "main");
    const result = await fixture.run();
    expect(result.outcome, result.error).toBe("published");
    expect(
      git(fixture.directory, "rev-list", "--count", `main..${result.branch}`),
    ).toBe("1");
    expect(git(fixture.directory, "rev-parse", `${result.branch}^`)).toBe(base);
    expect(git(fixture.directory, "show", `${result.branch}:sample.txt`)).toBe(
      mode,
    );
    onlyMainWorktree(fixture.directory);
  },
);

test.each([
  "binary",
  "submodule",
  "protected",
  "protected-case",
  "custom-protected",
])("single-commit policy rejects %s", async (mode) => {
  const fixture = await configured(mode);
  await Bun.write(
    fixture.configPath,
    JSON.stringify({ ...fixture.config, protectedPaths: ["sensitive.txt"] }),
  );
  const result = await fixture.run();
  expect(result.outcome).not.toBe("published");
  expect(result.error).toMatch(/binary|gitlink|submodule|protected/i);
  expect(await Bun.file(fixture.resultPath).exists()).toBe(false);
  expect(git(fixture.directory, "branch", "--list", result.branch)).toBe("");
  onlyMainWorktree(fixture.directory);
});

test.each(["untracked", "rename"])(
  "single core commit includes %s changes",
  async (mode) => {
    const fixture = await configured(mode);
    const result = await fixture.run();
    expect(result.outcome, result.error).toBe("published");
    const path = mode === "untracked" ? "new.txt" : "renamed.txt";
    expect(git(fixture.directory, "show", `${result.branch}:${path}`)).toBe(
      mode === "rename" ? "original" : "untracked",
    );
  },
);

test("publish failure is logged once and always cleans the worktree", async () => {
  const fixture = await workspace();
  fixture.config.publish!.push("fail");
  await Bun.write(fixture.configPath, JSON.stringify(fixture.config));
  const result = await maintenanceRun(
    fixture.directory,
    "dead-code-remover",
    false,
    { configPath: fixture.configPath },
  );
  expect(result.outcome).not.toBe("published");
  expect(result.publish?.exitCode).toBe(8);
  expect(
    (await Bun.file(fixture.resultPath).text()).trim().split("\n"),
  ).toHaveLength(1);
  expect((await records(fixture.directory)).at(-1)?.outcome).toBe(
    result.outcome,
  );
  onlyMainWorktree(fixture.directory);
});

test("unknown braces stay literal while known placeholders expand in one pass", async () => {
  const fixture = await workspace();
  fixture.config.agent.push('{"a":1}', "{unknown}");
  await Bun.write(fixture.configPath, JSON.stringify(fixture.config));
  expect(
    (
      await maintenanceRun(fixture.directory, "dead-code-remover", false, {
        configPath: fixture.configPath,
      })
    ).outcome,
  ).toBe("published");
});

test("status detects squash merge by patch-id after branch deletion and ignores young runs", async () => {
  const fixture = await configured();
  const result = await fixture.run();
  expect(result.outcome).toBe("published");
  expect((await maintenanceStatus(fixture.directory)).join("\n")).toContain(
    "0 published",
  );
  git(fixture.directory, "merge", "--squash", result.branch);
  git(fixture.directory, "commit", "-m", "Squashed review");
  git(fixture.directory, "branch", "-D", result.branch);
  const old = new Date(Date.now() - 8 * 86400_000).toISOString();
  const entries = await records(fixture.directory);
  await Bun.write(
    join(fixture.directory, RUN_LOG),
    entries
      .map((entry) =>
        JSON.stringify({
          ...entry,
          startedAt: old,
          finishedAt: old,
          publishedAt: old,
        }),
      )
      .join("\n") + "\n{truncated\nnull\n",
  );
  const status = (await maintenanceStatus(fixture.directory)).join("\n");
  expect(status).toContain("1 published, 1 merged (100%)");
  expect(status).toMatch(/warning|invalid|skipp/i);
});

test("cleanup failure after successful publication stays published with a warning", async () => {
  const fixture = await workspace();
  const { execute } = await import("../src/maintenance.ts");
  const result = await maintenanceRun(
    fixture.directory,
    "dead-code-remover",
    false,
    {
      configPath: fixture.configPath,
      execute: async (argv, cwd, options) =>
        argv[0] === "git" && argv[1] === "worktree" && argv[2] === "remove"
          ? { exitCode: 1, stdout: "", stderr: "fixture cleanup locked" }
          : execute(argv, cwd, options),
    },
  );
  expect(result.outcome).toBe("published");
  expect(JSON.stringify(result)).toContain("fixture cleanup locked");
  expect((await records(fixture.directory)).at(-1)?.outcome).toBe("published");
  const paths = git(fixture.directory, "worktree", "list", "--porcelain")
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice(9));
  for (const path of paths.slice(1))
    git(fixture.directory, "worktree", "remove", "--force", path);
});

async function waitForFile(path: string) {
  const deadline = Date.now() + 10_000;
  while (!(await Bun.file(path).exists())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${path}`);
    await Bun.sleep(25);
  }
}
function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function waitForDeath(pid: number) {
  const deadline = Date.now() + 5_000;
  while (alive(pid)) {
    if (Date.now() > deadline)
      throw new Error(`Process ${pid} survived termination`);
    await Bun.sleep(25);
  }
}

test("timeout kills agent and descendant processes and records failure", async () => {
  const fixture = await workspace("tree");
  const pids = join(fixture.directory, "agent-pids.json");
  fixture.config.agent.push(pids);
  await Bun.write(
    fixture.configPath,
    JSON.stringify({ ...fixture.config, timeoutMinutes: 0.02 }),
  );
  const result = await maintenanceRun(
    fixture.directory,
    "dead-code-remover",
    false,
    { configPath: fixture.configPath },
  );
  expect(result.outcome).not.toBe("published");
  expect(result.error).toMatch(/timeout|timed out/i);
  const processes = await Bun.file(pids).json();
  await waitForDeath(processes.pid);
  await waitForDeath(processes.child);
  expect((await records(fixture.directory))[0]?.event).toBe("started");
  expect((await records(fixture.directory)).at(-1)?.outcome).toBe(
    result.outcome,
  );
  onlyMainWorktree(fixture.directory);
});

test("two concurrent runs of the same role cannot both start", async () => {
  const fixture = await workspace("wait");
  const pids = join(fixture.directory, "agent-pids.json");
  fixture.config.agent.push(pids);
  await Bun.write(
    fixture.configPath,
    JSON.stringify({ ...fixture.config, timeoutMinutes: 0.04 }),
  );
  const first = maintenanceRun(fixture.directory, "dead-code-remover", false, {
    configPath: fixture.configPath,
  });
  await waitForFile(pids);
  try {
    await expect(
      maintenanceRun(fixture.directory, "dead-code-remover", false, {
        configPath: fixture.configPath,
      }),
    ).rejects.toThrow(/lock|running/i);
  } finally {
    await first;
  }
  expect(
    (await records(fixture.directory)).filter(
      (record) => record.event === "started",
    ),
  ).toHaveLength(1);
  onlyMainWorktree(fixture.directory);
});

test.skipIf(process.platform === "win32").each(["SIGINT", "SIGTERM"] as const)(
  "%s kills agent tree and cleans worktree",
  async (signal) => {
    const fixture = await workspace("tree");
    const pids = join(fixture.directory, "agent-pids.json");
    fixture.config.agent.push(pids);
    await Bun.write(fixture.configPath, JSON.stringify(fixture.config));
    const child = Bun.spawn(
      [
        process.execPath,
        join(root, "src/cli.ts"),
        "maintenance",
        "run",
        "dead-code-remover",
        "--target",
        fixture.directory,
        "--config",
        fixture.configPath,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    await waitForFile(pids);
    child.kill(signal);
    await child.exited;
    const processes = await Bun.file(pids).json();
    await waitForDeath(processes.pid);
    await waitForDeath(processes.child);
    onlyMainWorktree(fixture.directory);
    expect((await records(fixture.directory)).at(-1)?.outcome).not.toBe(
      "started",
    );
  },
);

test.skipIf(process.platform === "win32")(
  "startup reclaims a dead PID lock and sweeps a killed run's worktree and branch",
  async () => {
    const fixture = await workspace("wait");
    const pids = join(fixture.directory, "agent-pids.json");
    fixture.config.agent.push(pids);
    await Bun.write(fixture.configPath, JSON.stringify(fixture.config));
    const child = Bun.spawn(
      [
        process.execPath,
        join(root, "src/cli.ts"),
        "maintenance",
        "run",
        "dead-code-remover",
        "--target",
        fixture.directory,
        "--config",
        fixture.configPath,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    await waitForFile(pids);
    const started = (await records(fixture.directory)).find(
      (record) => record.event === "started",
    );
    expect(started).toBeDefined();
    child.kill("SIGKILL");
    await child.exited;
    const agent = await Bun.file(pids).json();
    try {
      process.kill(agent.pid, "SIGKILL");
    } catch {}
    fixture.config.agent[fixture.config.agent.length - 2] = "change";
    await Bun.write(fixture.configPath, JSON.stringify(fixture.config));
    const result = await maintenanceRun(
      fixture.directory,
      "dead-code-remover",
      false,
      { configPath: fixture.configPath },
    );
    expect(result.outcome, result.error).toBe("published");
    expect(git(fixture.directory, "branch", "--list", started.branch)).toBe("");
    onlyMainWorktree(fixture.directory);
  },
);

test("process API receives literal argv with shell disabled", async () => {
  const { spawn } = await import("node:child_process");
  const { spyOn } = await import("bun:test");
  const { createExecute } = await import("../src/maintenance-runtime.ts");
  const api = { spawn };
  const spy = spyOn(api, "spawn");
  try {
    const run = createExecute(api.spawn);
    const literal = '{"a":1}; echo $HOME & {unknown}';
    const result = await run(
      [
        process.execPath,
        "-e",
        "process.stdout.write(process.argv[1])",
        literal,
      ],
      root,
    );
    expect(result.stdout).toBe(literal);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[1]).toEqual([
      "-e",
      "process.stdout.write(process.argv[1])",
      literal,
    ]);
    expect(spy.mock.calls[0]?.[2]).toHaveProperty("shell", false);
  } finally {
    spy.mockRestore();
  }
});

test("owner argv schema requires agent prompt/worktree placeholders but permits shell names and JSON literals", async () => {
  const { parseMaintenanceUser } = await import("../src/schema.ts");
  expect(() => parseMaintenanceUser({ agent: ["true"] })).toThrow();
  const config = {
    agent: ["sh", "-c", 'echo {"a":1} {unknown} {prompt_file} {worktree}'],
    publish: ["sh", "-c", "owner choice"],
  };
  expect(parseMaintenanceUser(config)).toEqual(config);
});

test("cron validates ranges and steps without expanded schedules", async () => {
  const { parseCron } = await import("../src/cron.ts");
  expect(parseCron("*/15 3 1-10 * 0,7")).toBeUndefined();
  for (const value of [
    "60 3 * * *",
    "0 24 * * *",
    "*/0 * * * *",
    "0 3 10-1 * *",
    "0 3 * *",
  ])
    expect(() => parseCron(value)).toThrow();
});

test("line cap measures the complete core commit even when the agent already committed it", async () => {
  const fixture = await configured("committed-over-limit");
  const result = await fixture.run();
  expect(result.outcome).toBe("failed");
  expect(result.error).toMatch(/limit|120/i);
  expect(await Bun.file(fixture.resultPath).exists()).toBe(false);
  expect(git(fixture.directory, "branch", "--list", result.branch)).toBe("");
});

test("status flags low merge rates only after five aged publications", async () => {
  const fixture = await configured();
  const result = await fixture.run();
  const old = new Date(Date.now() - 8 * 86400_000).toISOString();
  const entries = Array.from({ length: 5 }, (_, index) => ({
    ...result,
    branch: `maintenance/dead-code-remover/aged-${index}`,
    startedAt: old,
    finishedAt: old,
    patchId: "f".repeat(40),
  }));
  await Bun.write(
    join(fixture.directory, RUN_LOG),
    entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
  );
  expect((await maintenanceStatus(fixture.directory)).join("\n")).toContain(
    "5 published, 0 merged (0%) NEEDS TUNING",
  );
});

test("schedule uses the installed executable on PATH, otherwise warns about its fallback", async () => {
  const fixture = await workspace();
  const { mkdir } = await import("node:fs/promises");
  const { delimiter } = await import("node:path");
  const bin = join(fixture.directory, "bin");
  await mkdir(bin);
  const executable = join(
    bin,
    process.platform === "win32" ? "meta-harness.exe" : "meta-harness",
  );
  await Bun.write(executable, "fixture");
  const { chmod } = await import("node:fs/promises");
  await chmod(executable, 0o755);
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = bin + delimiter + (originalPath ?? "");
    let lines = await maintenanceSchedule(
      fixture.directory,
      "dead-code-remover",
      { configPath: fixture.configPath },
    );
    expect(lines[1]).toContain(executable.replaceAll("\\", "\\\\"));
    expect(lines[1]).toContain("--config");
    process.env.PATH = "";
    lines = await maintenanceSchedule(fixture.directory, "dead-code-remover");
    expect(lines.join("\n")).toMatch(/Warning.*PATH/);
    expect(lines[1]).toContain(process.execPath.replaceAll("\\", "\\\\"));
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
  }
});

test("placeholder substitution is a single pass and owner config defaults are platform-specific", async () => {
  const { expandMaintenanceArgv, maintenanceUserConfigPath } =
    await import("../src/maintenance.ts");
  const { homedir } = await import("node:os");
  const ownerDirectory =
    process.platform === "win32"
      ? (process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"))
      : join(homedir(), ".config");
  expect(maintenanceUserConfigPath()).toBe(
    join(ownerDirectory, "meta-harness", "maintenance.json"),
  );
  expect(
    expandMaintenanceArgv(["{prompt_file}", '{"a":1}', "{other}"], {
      prompt_file: "{worktree}",
      worktree: "must not expand",
    }),
  ).toEqual(["{worktree}", '{"a":1}', "{other}"]);
});
