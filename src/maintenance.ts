import { configDirectory } from "./config.ts";
import type { spawn } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readHarness } from "./apply.ts";
import {
  applyWrites,
  BASELINE_DIRECTORY,
  hash,
  MANIFEST_PATH,
  safePath,
} from "./files.ts";
import { PACKAGE_ROOT } from "./packs.ts";
import { packRoles, renderPrompt } from "./roles.ts";
import { parseCron } from "./cron.ts";
import {
  parseMaintenance,
  parseMaintenanceUser,
  parseHarnessManifest,
  type MaintenanceConfig,
  type Role,
} from "./schema.ts";
import {
  acquireRoleLock,
  appendRecord,
  createExecute,
  errorMessage,
  processAlive,
  readRegularFile,
  writeExclusive,
  type CommandOptions,
  type CommandResult,
  type Execute,
} from "./maintenance-runtime.ts";
export {
  createExecute,
  execute,
  type CommandOptions,
  type CommandResult,
  type Execute,
} from "./maintenance-runtime.ts";

export const MAINTENANCE_CONFIG = ".harness/maintenance.json";
export const RUN_LOG = ".harness/maintenance/runs.jsonl";
export const DEFAULT_PROTECTED_PATHS = [
  ".harness",
  ".github",
  ".gitlab",
  ".gitlab-ci.yml",
  ".gitlab-ci.yaml",
  ".circleci",
  ".buildkite",
  "Jenkinsfile",
  "azure-pipelines.yml",
  "azure-pipelines.yaml",
  "bitbucket-pipelines.yml",
  ".travis.yml",
  "appveyor.yml",
];
const DEFAULT_TIMEOUT_MINUTES = 60;
const MINUTE_MS = 60_000;
const TUNING_DELAY_MS = 7 * 24 * 60 * MINUTE_MS;
const MIN_TUNING_RUNS = 5;
const MIN_MERGE_RATE = 0.3;
const OUTCOMES = ["no-changes", "branch-kept", "published", "failed"] as const;
export interface MaintenanceOptions {
  packageRoot?: string;
  execute?: Execute;
  configPath?: string | undefined;
  spawn?: typeof spawn;
}
type Options = MaintenanceOptions;
export interface RunRecord {
  event?: "finished";
  role: string;
  startedAt: string;
  finishedAt: string;
  branch: string;
  outcome: (typeof OUTCOMES)[number];
  changedLines: number;
  publish: CommandResult | null;
  verify?: CommandResult | null;
  commit?: string;
  patchId?: string;
  error?: string;
  warnings?: string[];
}
export interface StartedRunRecord {
  event: "started";
  role: string;
  startedAt: string;
  branch: string;
  pid: number;
  worktree: string;
}

async function command(
  run: Execute,
  argv: string[],
  cwd: string,
  options?: CommandOptions,
): Promise<string> {
  const result = await run(argv, cwd, options);
  if (result.exitCode !== 0)
    throw new Error(
      `${argv[0]} ${argv[1] ?? ""} failed (${result.exitCode}): ${result.stderr}`,
    );
  return result.stdout.trim();
}

async function state(targetPath: string, packageRoot = PACKAGE_ROOT) {
  const target = await realpath(resolve(targetPath));
  const { manifest, packs } = await readHarness(target, packageRoot);
  const roles = await packRoles(packs);
  const content = await readRegularFile(
    await safePath(target, MAINTENANCE_CONFIG),
  );
  const defaults: MaintenanceConfig = {
    roles: Object.fromEntries(
      roles.map((role) => [
        role.id,
        { enabled: false, cadence: role.defaultCadence },
      ]),
    ),
  };
  const config =
    content === undefined ? defaults : parseMaintenance(JSON.parse(content));
  for (const settings of Object.values(config.roles))
    parseCron(settings.cadence);
  return { target, manifest, packs, roles, config };
}

export function maintenanceUserConfigPath(configPath?: string): string {
  return configPath
    ? resolve(configPath)
    : join(configDirectory(), "maintenance.json");
}

export function expandMaintenanceArgv(
  argv: string[],
  values: Record<string, string>,
): string[] {
  return argv.map((argument) =>
    argument.replace(
      /\{(prompt_file|worktree|evidence_file|branch|title|body_file)\}/g,
      (placeholder, name: string) => values[name] ?? placeholder,
    ),
  );
}
function findRole(roles: Role[], id: string): Role {
  const role = roles.find((role) => role.id === id);
  if (!role) throw new Error(`Unknown maintenance role: ${id}`);
  return role;
}

export async function maintenanceList(
  target: string,
  options: Options = {},
): Promise<string[]> {
  const current = await state(target, options.packageRoot);
  return current.roles.map((role) => {
    const settings = current.config.roles[role.id];
    return `${role.id}\t${settings?.enabled ? "on" : "off"}\t${settings?.cadence ?? role.defaultCadence}\t${role.requires.join(", ") || "none"}`;
  });
}

export async function maintenanceToggle(
  target: string,
  id: string,
  enabled: boolean,
  cadence?: string,
  options: Options = {},
): Promise<string> {
  const current = await state(target, options.packageRoot);
  const role = findRole(current.roles, id);
  const schedule =
    cadence ?? current.config.roles[id]?.cadence ?? role.defaultCadence;
  parseCron(schedule);
  current.config.roles[id] = { enabled, cadence: schedule };
  const content = JSON.stringify(current.config, null, 2) + "\n";
  current.manifest.files[MAINTENANCE_CONFIG] = { sha256: hash(content) };
  current.manifest.parts ??= {
    context: [],
    knowledge: [],
    actions: [],
    checks: [],
    loop: [],
  };
  if (!current.manifest.parts.loop.includes(MAINTENANCE_CONFIG))
    current.manifest.parts.loop.push(MAINTENANCE_CONFIG);
  if (!current.manifest.packs) {
    const { packs } = await readHarness(current.target, options.packageRoot);
    current.manifest.packs = packs.map((pack) => ({
      name: pack.manifest.name,
      version: pack.manifest.version,
    }));
  }
  parseHarnessManifest(current.manifest);
  await applyWrites(current.target, [
    { path: MAINTENANCE_CONFIG, content },
    { path: `${BASELINE_DIRECTORY}/${MAINTENANCE_CONFIG}`, content },
    {
      path: MANIFEST_PATH,
      content: JSON.stringify(current.manifest, null, 2) + "\n",
    },
  ]);
  return `${id}: ${enabled ? "enabled" : "disabled"}; cadence ${schedule} (informational; nothing scheduled)`;
}

export async function maintenanceSchedule(
  target: string,
  id: string,
  options: Options = {},
): Promise<string[]> {
  const current = await state(target, options.packageRoot);
  const role = findRole(current.roles, id);
  const executable = Bun.which("meta-harness", {
    PATH: process.env.PATH ?? "",
  });
  const argv = executable
    ? [executable]
    : [
        process.execPath,
        join(options.packageRoot ?? PACKAGE_ROOT, "src/cli.ts"),
      ];
  argv.push("maintenance", "run", id, "--target", current.target);
  if (options.configPath) argv.push("--config", resolve(options.configPath));
  const lines = [
    `Cadence: ${current.config.roles[id]?.cadence ?? role.defaultCadence}`,
    `Command argv: ${JSON.stringify(argv)}`,
    "Installs nothing. The role must be enabled for this command to run.",
  ];
  if (!executable)
    lines.push(
      "Warning: meta-harness is not on PATH; the fallback requires this runtime and source checkout to remain installed.",
    );
  return lines;
}

async function defaultBranch(target: string, run: Execute): Promise<string> {
  const remote = await run(
    ["git", "symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
    target,
  );
  if (remote.exitCode === 0) {
    const branch = remote.stdout.trim().replace(/^refs\/remotes\/origin\//, "");
    const local = await run(
      ["git", "show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
      target,
    );
    return local.exitCode === 0 ? branch : remote.stdout.trim();
  }
  for (const branch of ["main", "master"]) {
    const result = await run(
      ["git", "show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
      target,
    );
    if (result.exitCode === 0) return branch;
  }
  return command(run, ["git", "symbolic-ref", "--short", "HEAD"], target);
}

export function changedLines(numstat: string): number {
  let total = 0;
  for (const entry of numstat.split("\0")) {
    if (!entry) continue;
    const [added, removed] = entry.split("\t");
    if (added === "-" || removed === "-")
      throw new Error("Binary changes are not allowed");
    if (!added || !removed || !/^\d+$/.test(added) || !/^\d+$/.test(removed))
      throw new Error("Invalid git numstat output");
    total += Number(added) + Number(removed);
  }
  return total;
}

export function validateEvidence(
  evidence: string,
  requiredEvidence: string[],
): void {
  const headings = new Set(
    [...evidence.matchAll(/^#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/gm)].map(
      (match) => match[1]?.trim().toLowerCase(),
    ),
  );
  const missing = requiredEvidence.filter(
    (required) => !headings.has(required.trim().toLowerCase()),
  );
  if (missing.length)
    throw new Error(
      `Missing required evidence headings: ${missing.join("; ")}`,
    );
}

export function validateChangedPaths(
  rawDiff: string,
  protectedPaths: string[] = [],
): void {
  const entries = rawDiff.split("\0");
  const protectedPatterns = [...DEFAULT_PROTECTED_PATHS, ...protectedPaths];
  for (let index = 0; index < entries.length - 1; index += 2) {
    const header = entries[index];
    const path = entries[index + 1];
    if (!header || !path) throw new Error("Invalid git raw diff output");
    const [oldMode, newMode] = header.replace(/^:/, "").split(" ");
    if (oldMode === "160000" || newMode === "160000")
      throw new Error(`Gitlink changes are not allowed: ${path}`);
    const reserved = /(?:^|\/)\.(?:git|harness)(?:\/|$)/i.test(path);
    const protectedPath = protectedPatterns.some((pattern) => {
      const normalizedPath = path.toLowerCase();
      const normalizedPattern = pattern.toLowerCase();
      const prefix = normalizedPattern.replace(/\/$/, "");
      return (
        normalizedPath === prefix ||
        normalizedPath.startsWith(prefix + "/") ||
        new Bun.Glob(normalizedPattern).match(normalizedPath)
      );
    });
    if (reserved || protectedPath)
      throw new Error(`Protected path cannot be changed: ${path}`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validRunIdentity(value: Record<string, unknown>): boolean {
  return (
    typeof value.role === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.role) &&
    typeof value.branch === "string" &&
    new RegExp(`^maintenance/${value.role}/[A-Za-z0-9-]+$`).test(
      value.branch,
    ) &&
    typeof value.startedAt === "string" &&
    Number.isFinite(Date.parse(value.startedAt))
  );
}
function isCommandResult(value: unknown): value is CommandResult {
  return (
    isObject(value) &&
    (value.exitCode === null ||
      (typeof value.exitCode === "number" &&
        Number.isInteger(value.exitCode))) &&
    typeof value.stdout === "string" &&
    typeof value.stderr === "string"
  );
}
function isRunRecord(value: unknown): value is RunRecord {
  return (
    isObject(value) &&
    validRunIdentity(value) &&
    (value.event === undefined || value.event === "finished") &&
    typeof value.finishedAt === "string" &&
    Number.isFinite(Date.parse(value.finishedAt)) &&
    OUTCOMES.some((outcome) => outcome === value.outcome) &&
    typeof value.changedLines === "number" &&
    Number.isFinite(value.changedLines) &&
    value.changedLines >= 0 &&
    (value.publish === null || isCommandResult(value.publish)) &&
    (value.verify === undefined ||
      value.verify === null ||
      isCommandResult(value.verify)) &&
    (value.commit === undefined ||
      (typeof value.commit === "string" &&
        /^[a-f0-9]{40,64}$/.test(value.commit))) &&
    (value.patchId === undefined ||
      (typeof value.patchId === "string" &&
        /^[a-f0-9]{40,64}$/.test(value.patchId))) &&
    (value.error === undefined || typeof value.error === "string") &&
    (value.warnings === undefined ||
      (Array.isArray(value.warnings) &&
        value.warnings.every((warning) => typeof warning === "string")))
  );
}
function isStartedRunRecord(value: unknown): value is StartedRunRecord {
  return (
    isObject(value) &&
    validRunIdentity(value) &&
    value.event === "started" &&
    typeof value.pid === "number" &&
    Number.isInteger(value.pid) &&
    value.pid > 0 &&
    typeof value.worktree === "string"
  );
}
export function parseRunLog(content: string): {
  records: RunRecord[];
  started: StartedRunRecord[];
  warnings: string[];
} {
  const records: RunRecord[] = [];
  const started: StartedRunRecord[] = [];
  const warnings: string[] = [];
  for (const [index, line] of content.split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (isRunRecord(value)) records.push(value);
      else if (isStartedRunRecord(value)) started.push(value);
      else throw new Error("invalid record");
    } catch {
      warnings.push(
        `Warning: invalid or truncated maintenance JSONL at line ${index + 1}; ignored.`,
      );
    }
  }
  return { records, started, warnings };
}

async function patchId(
  run: Execute,
  target: string,
  commit: string,
): Promise<string | undefined> {
  const diff = await command(
    run,
    [
      "git",
      "show",
      "--format=",
      "--no-ext-diff",
      "--no-textconv",
      "--binary",
      "--no-renames",
      commit,
    ],
    target,
  );
  const output = await command(run, ["git", "patch-id", "--stable"], target, {
    stdin: diff + "\n",
  });
  return output.split(/\s+/)[0] || undefined;
}

async function sweepStaleRuns(
  target: string,
  directory: string,
  log: ReturnType<typeof parseRunLog>,
  run: Execute,
  warnings: string[],
): Promise<void> {
  const finished = new Set(log.records.map((record) => record.branch));
  for (const record of log.started) {
    if (finished.has(record.branch) || processAlive(record.pid)) continue;
    const stamp = record.branch.split("/")[2];
    const expected = join(directory, "worktrees", `${record.role}-${stamp}`);
    if (record.worktree !== expected) {
      warnings.push(
        `Warning: stale run has an invalid worktree: ${record.branch}`,
      );
      continue;
    }
    try {
      const result = await run(
        ["git", "worktree", "remove", "--force", expected],
        target,
      );
      if (result.exitCode !== 0) {
        const exists = await Bun.file(join(expected, ".git")).exists();
        if (exists) throw new Error(result.stderr);
        await command(run, ["git", "worktree", "prune"], target);
      }
      await command(
        run,
        ["git", "update-ref", "-d", `refs/heads/${record.branch}`],
        target,
      );
    } catch (error) {
      warnings.push(
        `Warning: stale run cleanup failed for ${record.branch}: ${errorMessage(error)}`,
      );
    }
  }
}

export async function maintenanceRun(
  target: string,
  id: string,
  force = false,
  options: Options = {},
): Promise<RunRecord> {
  const current = await state(target, options.packageRoot);
  const role = findRole(current.roles, id);
  if (!force && !current.config.roles[id]?.enabled)
    throw new Error(`${id} is disabled; enable it or use --force`);
  const configPath = maintenanceUserConfigPath(options.configPath);
  const content = await readRegularFile(configPath);
  if (content === undefined)
    throw new Error(`Maintenance owner config is required: ${configPath}`);
  const config = parseMaintenanceUser(JSON.parse(content));
  const rawRun = options.execute ?? createExecute(options.spawn);
  const controller = new AbortController();
  const run: Execute = (argv, cwd, commandOptions) => {
    controller.signal.throwIfAborted();
    return rawRun(argv, cwd, { ...commandOptions, signal: controller.signal });
  };
  const startedAt = new Date().toISOString();
  const stamp =
    startedAt.replace(/[-:.]/g, "") + "-" + randomUUID().slice(0, 8);
  const branch = `maintenance/${id}/${stamp}`;
  const directory = join(current.target, ".harness", "maintenance");
  const worktree = join(directory, "worktrees", `${id}-${stamp}`);
  const logFile = await safePath(current.target, RUN_LOG);
  const lockFile = await safePath(
    current.target,
    `.harness/maintenance/locks/${id}.lock`,
  );
  await mkdir(join(directory, "locks"), { recursive: true });
  const release = await acquireRoleLock(lockFile);
  const warnings: string[] = [];
  const record: RunRecord = {
    event: "finished",
    role: id,
    startedAt,
    finishedAt: startedAt,
    branch,
    outcome: "failed",
    changedLines: 0,
    publish: null,
    verify: null,
  };
  let runDirectory: string | undefined;
  let created = false;
  let keepBranch = false;
  const cancel = (reason: string) => controller.abort(new Error(reason));
  const onInterrupt = () => cancel("Maintenance interrupted by SIGINT");
  const onTerminate = () => cancel("Maintenance interrupted by SIGTERM");
  const timeout = setTimeout(
    () => cancel("Maintenance timed out"),
    (config.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES) * MINUTE_MS,
  );
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  try {
    const log = parseRunLog((await readRegularFile(logFile)) ?? "");
    warnings.push(...log.warnings);
    await sweepStaleRuns(current.target, directory, log, run, warnings);
    runDirectory = await mkdtemp(
      join(await realpath(tmpdir()), "meta-harness-maintenance-"),
    );
    const promptFile = join(runDirectory, "prompt.md");
    const evidenceFile = join(runDirectory, "evidence.md");
    const bodyFile = join(runDirectory, "body.md");
    const title = `Maintenance: ${role.title}`;
    const values = {
      prompt_file: promptFile,
      evidence_file: evidenceFile,
      body_file: bodyFile,
      worktree,
      branch,
      title,
    };
    await writeExclusive(promptFile, renderPrompt(role, evidenceFile));
    await writeExclusive(evidenceFile, "");
    const base = await defaultBranch(current.target, run);
    const baseCommit = await command(
      run,
      ["git", "rev-parse", `${base}^{commit}`],
      current.target,
    );
    await appendRecord(logFile, {
      event: "started",
      role: id,
      startedAt,
      branch,
      pid: process.pid,
      worktree,
    } satisfies StartedRunRecord);
    await command(
      run,
      ["git", "worktree", "add", "-b", branch, worktree, baseCommit],
      current.target,
    );
    created = true;
    const gitDirectory = await command(
      run,
      ["git", "rev-parse", "--absolute-git-dir"],
      worktree,
    );
    const agent = await run(
      expandMaintenanceArgv(config.agent, values),
      worktree,
    );
    await writeExclusive(
      join(runDirectory, "agent.log"),
      agent.stdout + agent.stderr,
    );
    const prompt = await readRegularFile(promptFile);
    if (prompt === undefined) throw new Error("Agent removed the run prompt");
    const evidence = await readRegularFile(evidenceFile);
    if (evidence === undefined)
      throw new Error("Agent removed the review evidence file");
    if (agent.exitCode !== 0) {
      record.outcome = "failed";
      record.error = `Agent exited ${agent.exitCode}`;
      return record;
    }
    if (config.verify) {
      record.verify = await run(
        expandMaintenanceArgv(config.verify, values),
        worktree,
      );
      if (record.verify.exitCode !== 0) {
        record.outcome = "failed";
        record.error = `Verification exited ${record.verify.exitCode}`;
        return record;
      }
    }
    await readRegularFile(promptFile);
    const verifiedEvidence = await readRegularFile(evidenceFile);
    if (verifiedEvidence === undefined)
      throw new Error("Review evidence is missing");
    const git = ["git", `--git-dir=${gitDirectory}`, `--work-tree=${worktree}`];
    const indexOptions = {
      env: { GIT_INDEX_FILE: join(runDirectory, "index") },
    };
    await command(
      run,
      [...git, "read-tree", baseCommit],
      current.target,
      indexOptions,
    );
    await command(
      run,
      [...git, "add", "-A", "--", "."],
      worktree,
      indexOptions,
    );
    const tree = await command(
      run,
      [...git, "write-tree"],
      current.target,
      indexOptions,
    );
    record.commit = await command(
      run,
      ["git", "commit-tree", tree, "-p", baseCommit, "-m", title],
      current.target,
    );
    const previous = await command(
      run,
      ["git", "rev-parse", `refs/heads/${branch}`],
      current.target,
    );
    await command(
      run,
      ["git", "update-ref", `refs/heads/${branch}`, record.commit, previous],
      current.target,
    );
    const rawDiff = await command(
      run,
      [
        "git",
        "diff",
        "--raw",
        "--no-renames",
        "--no-abbrev",
        "-z",
        baseCommit,
        record.commit,
      ],
      current.target,
    );
    validateChangedPaths(rawDiff, [
      ...(config.protectedPaths ?? []),
      ...current.packs.flatMap((pack) => pack.manifest.ownerPaths ?? []),
      ...Object.entries(current.manifest.files)
        .filter(([, record]) => record.mode === "owner")
        .map(([path]) => path),
    ]);
    const numstat = await command(
      run,
      [
        "git",
        "diff",
        "--numstat",
        "--no-renames",
        "--no-ext-diff",
        "--no-textconv",
        "-z",
        baseCommit,
        record.commit,
      ],
      current.target,
    );
    record.changedLines = changedLines(numstat);
    if (!rawDiff) {
      record.outcome = "no-changes";
      return record;
    }
    if (record.changedLines > role.perRun.maxChangedLines)
      throw new Error(
        `Changed-line limit exceeded: ${record.changedLines} > ${role.perRun.maxChangedLines}`,
      );
    validateEvidence(verifiedEvidence, role.requiredEvidence);
    let body = verifiedEvidence;
    if (record.verify)
      body += `\n\n## Owner verification\n\nExit code: ${record.verify.exitCode}\n\nStdout:\n\n${record.verify.stdout}\n\nStderr:\n\n${record.verify.stderr}\n`;
    await writeExclusive(bodyFile, body);
    await readRegularFile(bodyFile);
    const acceptedPatchId = await patchId(run, current.target, record.commit);
    if (acceptedPatchId) record.patchId = acceptedPatchId;
    keepBranch = true;
    record.outcome = "branch-kept";
    if (config.publish && role.perRun.maxPullRequests > 0) {
      await command(run, [...git, "checkout", "--force", branch], worktree);
      await readRegularFile(promptFile);
      await readRegularFile(evidenceFile);
      await readRegularFile(bodyFile);
      record.publish = await run(
        expandMaintenanceArgv(config.publish, values),
        worktree,
      );
      record.outcome = record.publish.exitCode === 0 ? "published" : "failed";
    }
  } catch (error) {
    record.error = errorMessage(error);
    record.outcome = "failed";
  } finally {
    clearTimeout(timeout);
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
    if (created) {
      try {
        await command(
          rawRun,
          ["git", "worktree", "remove", "--force", worktree],
          current.target,
        );
      } catch (error) {
        warnings.push(
          `Warning: worktree cleanup failed: ${errorMessage(error)}`,
        );
      }
    }
    if (!keepBranch) {
      try {
        await command(
          rawRun,
          ["git", "update-ref", "-d", `refs/heads/${branch}`],
          current.target,
        );
      } catch (error) {
        warnings.push(`Warning: branch cleanup failed: ${errorMessage(error)}`);
      }
    }
    if (runDirectory) {
      try {
        await rm(runDirectory, { recursive: true, force: true });
      } catch (error) {
        warnings.push(
          `Warning: run-file cleanup failed: ${errorMessage(error)}`,
        );
      }
    }
    record.finishedAt = new Date().toISOString();
    if (warnings.length) record.warnings = warnings;
    try {
      await appendRecord(logFile, record);
    } catch (error) {
      warnings.push(`Warning: run log write failed: ${errorMessage(error)}`);
      record.warnings = warnings;
    }
    try {
      await release();
    } catch (error) {
      warnings.push(`Warning: lock cleanup failed: ${errorMessage(error)}`);
      record.warnings = warnings;
    }
  }
  return record;
}

export async function maintenanceStatus(
  target: string,
  options: Options = {},
): Promise<string[]> {
  const current = await state(target, options.packageRoot);
  const log = parseRunLog(
    (await readRegularFile(await safePath(current.target, RUN_LOG))) ?? "",
  );
  const run = options.execute ?? createExecute(options.spawn);
  const cutoff = Date.now() - TUNING_DELAY_MS;
  const published = [
    ...new Map(
      log.records
        .filter(
          (record) =>
            record.outcome === "published" &&
            Date.parse(record.finishedAt) <= cutoff,
        )
        .map((record) => [record.branch, record]),
    ).values(),
  ];
  const base = published.length
    ? await defaultBranch(current.target, run)
    : undefined;
  const defaultPatches = new Set<string>();
  if (base) {
    const commits = await command(
      run,
      ["git", "rev-list", "--no-merges", base],
      current.target,
    );
    for (const commit of commits.split("\n").filter(Boolean)) {
      const id = await patchId(run, current.target, commit);
      if (id) defaultPatches.add(id);
    }
  }
  const lines: string[] = [...log.warnings];
  for (const role of current.roles) {
    if (!current.config.roles[role.id]?.enabled) continue;
    const runs = published.filter((record) => record.role === role.id);
    let merged = 0;
    for (const record of runs) {
      let id = record.patchId;
      if (!id) {
        const exists = await run(
          [
            "git",
            "rev-parse",
            "--verify",
            record.commit ?? `refs/heads/${record.branch}`,
          ],
          current.target,
        );
        if (exists.exitCode !== 0) continue;
        id = await patchId(run, current.target, exists.stdout.trim());
      }
      if (id && defaultPatches.has(id)) merged++;
    }
    const rate = runs.length ? merged / runs.length : 0;
    const tuning =
      runs.length >= MIN_TUNING_RUNS && rate < MIN_MERGE_RATE
        ? " NEEDS TUNING"
        : "";
    lines.push(
      `${role.id}: ${runs.length} published, ${merged} merged (${Math.round(rate * 100)}%)${tuning}`,
    );
  }
  if (!lines.length) lines.push("No enabled roles");
  return lines;
}
