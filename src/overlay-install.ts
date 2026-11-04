import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { configDirectory } from "./config.ts";
import {
  approveAddedCodexHooks,
  type AppServerSpawner,
} from "./codex-hook-trust.ts";
import { hookEntries, mergeHookSettings } from "./hook-registration.ts";

type EventName = "PreToolUse" | "Stop";
interface InstalledFile {
  harness: "claude" | "codex";
  added: Array<{ event: EventName; entry: Record<string, unknown> }>;
  backups: string[];
}
interface InstallJournal {
  version: 1;
  files: InstalledFile[];
}

export interface OverlayInstallOptions {
  dryRun?: boolean;
  home?: string;
  overlay?: string;
  env?: NodeJS.ProcessEnv;
  codexPath?: string;
  spawnAppServer?: AppServerSpawner;
  timeoutMs?: number;
}

const JOURNAL_NAME = "overlay-install.json";

function installationEnvironment(
  options: OverlayInstallOptions,
): NodeJS.ProcessEnv {
  const env = options.env ?? process.env;
  if (process.platform === "win32" && options.home && !options.env?.APPDATA)
    return { ...env, APPDATA: join(options.home, "AppData", "Roaming") };
  return env;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function maybeRead(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

async function canonicalPotentialPath(path: string): Promise<string> {
  let ancestor = resolve(dirname(path));
  const missing: string[] = [path.slice(ancestor.length + 1)];
  while (true) {
    try {
      const canonical = await realpath(ancestor);
      return resolve(canonical, ...missing.reverse());
    } catch (error) {
      if (!isMissing(error)) throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      missing.push(ancestor.slice(parent.length + 1));
      ancestor = parent;
    }
  }
}

async function settingsPath(
  home: string,
  relativePath: string,
): Promise<string> {
  const candidate = join(home, relativePath);
  const stat = await lstat(candidate).catch((error: unknown) => {
    if (isMissing(error)) return undefined;
    throw error;
  });
  if (stat) return await realpath(candidate);
  return canonicalPotentialPath(candidate);
}

function parseJsonObject(
  content: Buffer | undefined,
  label: string,
): Record<string, unknown> {
  if (!content) return {};
  const parsed: unknown = JSON.parse(content.toString("utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new Error(`${label}: expected a JSON object`);
  return parsed as Record<string, unknown>;
}

function equal(value: unknown, other: unknown): boolean {
  const stable = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(stable);
    if (typeof input !== "object" || input === null) return input;
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stable(entry)]),
    );
  };
  return JSON.stringify(stable(value)) === JSON.stringify(stable(other));
}

function equalSettings(
  value: Record<string, unknown>,
  other: Record<string, unknown>,
): boolean {
  const normalize = (
    input: Record<string, unknown>,
  ): Record<string, unknown> => {
    const result = structuredClone(input);
    const hooks = result.hooks;
    if (typeof hooks === "object" && hooks !== null && !Array.isArray(hooks)) {
      const groups = hooks as Record<string, unknown>;
      for (const [event, entries] of Object.entries(groups))
        if (Array.isArray(entries) && entries.length === 0)
          delete groups[event];
      if (Object.keys(groups).length === 0) delete result.hooks;
    }
    return result;
  };
  return equal(normalize(value), normalize(other));
}

function buildFile(
  harness: "claude" | "codex",
  current: Buffer | undefined,
  previous?: InstalledFile,
  overlay?: string,
): InstalledFile {
  const parsed = parseJsonObject(current, harness);
  const groups = (parsed.hooks ?? {}) as Record<string, unknown>;
  const added = [...(previous?.added ?? [])];
  for (const { event, entry } of hookEntries(harness, overlay)) {
    const prior = added.some(
      (owned) => owned.event === event && equal(owned.entry, entry),
    );
    const existing = groups[event];
    if (
      !prior &&
      (!Array.isArray(existing) ||
        !existing.some((value) => equal(value, entry)))
    ) {
      added.push({ event, entry });
    }
  }
  return { harness, added, backups: previous?.backups ?? [] };
}

async function atomicWrite(
  path: string,
  content: Buffer,
  modeOverride?: number,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.meta-harness-${randomUUID()}.tmp`);
  try {
    const existing = await lstat(path).catch((error: unknown) => {
      if (isMissing(error)) return undefined;
      throw error;
    });
    await writeFile(temporary, content, {
      flag: "wx",
      mode:
        modeOverride ?? (existing?.isFile() ? existing.mode & 0o777 : 0o666),
    });
    if (modeOverride !== undefined) await chmod(temporary, modeOverride);
    else if (existing?.isFile()) await chmod(temporary, existing.mode & 0o777);
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function saveJournal(
  path: string,
  journal: InstallJournal,
): Promise<void> {
  await atomicWrite(
    path,
    Buffer.from(`${JSON.stringify(journal, null, 2)}\n`),
    0o600,
  );
}

async function readJournal(path: string): Promise<InstallJournal | undefined> {
  const content = await maybeRead(path);
  if (!content) return undefined;
  const parsed: unknown = JSON.parse(content.toString("utf8"));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as Record<string, unknown>).version !== 1 ||
    !Array.isArray((parsed as Record<string, unknown>).files)
  )
    throw new Error(`${path}: invalid overlay install journal`);
  return parsed as InstallJournal;
}

async function backupBeforeWrite(
  path: string,
  current: Buffer | undefined,
  installed: Buffer,
  file: InstalledFile,
): Promise<InstalledFile> {
  if (!current || current.equals(installed)) return file;
  const backup = `${path}.meta-harness-backup-${randomUUID()}`;
  const mode = (await lstat(path)).mode & 0o777;
  await writeFile(backup, current, { flag: "wx", mode });
  await chmod(backup, mode);
  return { ...file, backups: [...file.backups, backup] };
}

export async function overlayInstall(
  options: OverlayInstallOptions = {},
): Promise<string[]> {
  const home = resolve(options.home ?? homedir());
  const env = installationEnvironment(options);
  const overlay = options.overlay ? resolve(options.overlay) : undefined;
  const journalPath = join(configDirectory(home, env), JOURNAL_NAME);
  const previous = await readJournal(journalPath);
  const paths = [
    {
      harness: "claude" as const,
      path: await settingsPath(home, ".claude/settings.json"),
    },
    {
      harness: "codex" as const,
      path: await settingsPath(home, ".codex/hooks.json"),
    },
  ];
  const files = paths.map(({ harness, path }) => ({
    harness,
    path,
    old: previous?.files.find((entry) => entry.harness === harness),
  }));
  const journal: InstallJournal = {
    version: 1,
    files: [],
  };
  const messages: string[] = [];
  for (const { harness, path, old } of files) {
    const current = await maybeRead(path);
    const planned = buildFile(harness, current, old, overlay);
    journal.files.push(planned);
    messages.push(
      `${options.dryRun ? "Would register" : "Register"} PreToolUse and Stop in ${path}`,
    );
    for (const { event } of planned.added)
      messages.push(
        `  ${event}: meta-harness hook ${event === "Stop" ? "stop" : "pre-tool-use"}`,
      );
  }
  if (options.dryRun) {
    messages.push(
      "Dry run: no files written; settings will be backed up before changes.",
    );
    return messages;
  }

  await saveJournal(journalPath, journal);
  for (let index = 0; index < journal.files.length; index++) {
    let file = journal.files[index];
    if (!file) continue;
    const path = paths.find((entry) => entry.harness === file?.harness)?.path;
    if (!path) continue;
    const current = await maybeRead(path);
    file = buildFile(file.harness, current, file, overlay);
    const installed = Buffer.from(
      mergeHookSettings(current?.toString("utf8"), file.harness, overlay),
    );
    const backedUp = await backupBeforeWrite(path, current, installed, file);
    journal.files[index] = backedUp;
    await saveJournal(journalPath, journal);
    if (current?.equals(installed)) continue;
    await atomicWrite(path, installed);
    messages.push(`Updated ${path}`);
    for (const backup of backedUp.backups) messages.push(`Backup ${backup}`);
  }
  const codexFile = journal.files.find((file) => file.harness === "codex");
  const addedEvents = [
    ...new Set(codexFile?.added.map(({ event }) => event) ?? []),
  ];
  try {
    messages.push(
      ...(await approveAddedCodexHooks({
        home,
        ...(overlay ? { overlay } : {}),
        sourcePaths: [
          paths.find((entry) => entry.harness === "codex")?.path ??
            resolve(home, ".codex/hooks.json"),
        ],
        addedEvents,
        env,
        ...(options.codexPath ? { codexPath: options.codexPath } : {}),
        ...(options.spawnAppServer
          ? { spawnAppServer: options.spawnAppServer }
          : {}),
        ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      })),
    );
  } catch (error) {
    messages.push(
      `Codex hook approval failed; open /hooks to review them: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return messages;
}

function removeOwnedEntries(
  content: Buffer | undefined,
  file: InstalledFile,
): Buffer | undefined {
  if (!content) return undefined;
  const parsed = parseJsonObject(content, file.harness);
  const hooks = parsed.hooks;
  if (typeof hooks !== "object" || hooks === null || Array.isArray(hooks))
    return content;
  const groups = hooks as Record<string, unknown>;
  let changed = false;
  for (const { event, entry } of file.added) {
    const ownedCommands = new Set(hookCommands(entry));
    if (ownedCommands.size === 0) continue;
    const values = groups[event];
    if (!Array.isArray(values)) continue;
    const retained = values.flatMap((value) => {
      if (typeof value !== "object" || value === null) return [value];
      const record = value as Record<string, unknown>;
      if (!Array.isArray(record.hooks)) return [value];
      const handlers = record.hooks as unknown[];
      const keptHandlers = handlers.filter((handler) => {
        const command = hookCommand(handler);
        return command === undefined || !ownedCommands.has(command);
      });
      if (keptHandlers.length === handlers.length) return [value];
      changed = true;
      if (keptHandlers.length === 0) return [];
      return [{ ...record, hooks: keptHandlers }];
    });
    if (retained.length) groups[event] = retained;
    else delete groups[event];
  }
  if (!changed) return content;
  if (Object.keys(groups).length === 0) delete parsed.hooks;
  if (Object.keys(parsed).length === 0) return undefined;
  return Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`);
}

function hookCommand(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const command = (value as Record<string, unknown>).command;
  return typeof command === "string" ? command : undefined;
}

function hookCommands(value: unknown): string[] {
  if (typeof value !== "object" || value === null) return [];
  const handlers = (value as Record<string, unknown>).hooks;
  if (!Array.isArray(handlers)) return [];
  return handlers
    .map(hookCommand)
    .filter((command): command is string => command !== undefined);
}

export async function overlayUninstall(
  options: Omit<OverlayInstallOptions, "dryRun"> = {},
): Promise<string[]> {
  const home = resolve(options.home ?? homedir());
  const env = installationEnvironment(options);
  const journalPath = join(configDirectory(home, env), JOURNAL_NAME);
  const journal = await readJournal(journalPath);
  if (!journal) return ["meta-harness overlay hooks are not installed."];
  const messages: string[] = [];
  const paths = new Map<"claude" | "codex", string>([
    ["claude", await settingsPath(home, ".claude/settings.json")],
    ["codex", await settingsPath(home, ".codex/hooks.json")],
  ]);
  for (const file of journal.files) {
    const path = paths.get(file.harness);
    if (!path) continue;
    const current = await maybeRead(path);
    let desired = removeOwnedEntries(current, file);
    let exactBackup: { content: Buffer; mode: number } | undefined;
    for (const backup of file.backups) {
      const backupContent = await maybeRead(backup);
      if (!backupContent) continue;
      const backupObject = parseJsonObject(backupContent, backup);
      const desiredObject = desired ? parseJsonObject(desired, path) : {};
      if (equalSettings(backupObject, desiredObject)) {
        exactBackup = {
          content: backupContent,
          mode: (await lstat(backup)).mode & 0o777,
        };
        break;
      }
    }
    if (exactBackup) desired = exactBackup.content;
    if (desired && current && !desired.equals(current)) {
      await atomicWrite(path, desired);
      if (exactBackup) await chmod(path, exactBackup.mode);
      messages.push(`Restored ${path}`);
    } else if (desired && !current) {
      await atomicWrite(path, desired);
      if (exactBackup) await chmod(path, exactBackup.mode);
      messages.push(`Restored ${path}`);
    } else if (!desired && current) {
      await unlink(path);
      messages.push(`Removed ${path}`);
    }
    const after = await maybeRead(path);
    const remainingCommands = file.added.flatMap(({ entry }) =>
      hookCommands(entry),
    );
    const hooks = after ? parseJsonObject(after, path).hooks : undefined;
    const stillRegistered =
      typeof hooks === "object" && hooks !== null && !Array.isArray(hooks)
        ? Object.values(hooks).some(
            (values) =>
              Array.isArray(values) &&
              values.some((entry) =>
                hookCommands(entry).some((command) =>
                  remainingCommands.includes(command),
                ),
              ),
          )
        : false;
    if (stillRegistered)
      throw new Error(`Could not verify hook removal from ${path}`);
    for (const backup of file.backups) {
      await unlink(backup).catch((error: unknown) => {
        if (!isMissing(error)) throw error;
      });
    }
  }
  await unlink(journalPath);
  messages.push("Removed meta-harness overlay hook registrations.");
  return messages;
}
