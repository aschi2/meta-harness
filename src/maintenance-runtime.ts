import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, unlink } from "node:fs/promises";

const PROCESS_TERMINATION_GRACE_MS = 250;
export interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}
export interface CommandOptions {
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
}
export type Execute = (
  argv: string[],
  cwd: string,
  options?: CommandOptions,
) => Promise<CommandResult>;

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

export function createExecute(spawnCommand: typeof spawn = spawn): Execute {
  return async (argv, cwd, options = {}) => {
    options.signal?.throwIfAborted();
    const [executable, ...arguments_] = argv;
    if (!executable) throw new Error("Command argv must not be empty");
    return new Promise<CommandResult>((resolve, reject) => {
      const child = spawnCommand(executable, arguments_, {
        cwd,
        env: { ...process.env, ...options.env },
        shell: false,
        detached: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let termination: ReturnType<typeof setTimeout> | undefined;
      const killTree = (signal: NodeJS.Signals) => {
        if (child.pid === undefined) return;
        if (process.platform === "win32") {
          const killer = spawnCommand(
            "taskkill",
            ["/PID", String(child.pid), "/T", "/F"],
            { shell: false, stdio: "ignore" },
          );
          killer.on("error", () => child.kill(signal));
          return;
        }
        try {
          process.kill(-child.pid, signal);
        } catch (error) {
          if (!hasCode(error, "ESRCH")) child.kill(signal);
        }
      };
      const abort = () => {
        killTree("SIGTERM");
        termination = setTimeout(
          () => killTree("SIGKILL"),
          PROCESS_TERMINATION_GRACE_MS,
        );
      };
      const finish = () => {
        options.signal?.removeEventListener("abort", abort);
        if (termination) {
          clearTimeout(termination);
          killTree("SIGKILL");
        }
      };
      child.stdout?.setEncoding("utf8").on("data", (data: string) => {
        stdout += data;
      });
      child.stderr?.setEncoding("utf8").on("data", (data: string) => {
        stderr += data;
      });
      child.stdin?.on("error", (error: unknown) => {
        if (!hasCode(error, "EPIPE")) reject(error);
      });
      child.on("error", (error) => {
        finish();
        reject(error);
      });
      child.on("close", (exitCode) => {
        finish();
        if (options.signal?.aborted) reject(options.signal.reason);
        else resolve({ exitCode, stdout, stderr });
      });
      options.signal?.addEventListener("abort", abort, { once: true });
      child.stdin?.end(options.stdin);
      if (options.signal?.aborted) abort();
    });
  };
}
export const execute: Execute = createExecute();

export async function readRegularFile(
  path: string,
): Promise<string | undefined> {
  const info = await lstat(path).catch((error: unknown) => {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  });
  if (!info) return undefined;
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error(`${path}: expected a regular file, not a symlink`);
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const opened = await file.stat();
    if (!opened.isFile() || opened.ino !== info.ino || opened.dev !== info.dev)
      throw new Error(`${path}: file changed while opening`);
    return await file.readFile("utf8");
  } finally {
    await file.close();
  }
}

export async function writeExclusive(
  path: string,
  content: string,
): Promise<void> {
  const file = await open(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile(content);
  } finally {
    await file.close();
  }
}

export async function appendRecord(
  path: string,
  record: unknown,
): Promise<void> {
  const info = await lstat(path).catch((error: unknown) => {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  });
  if (info && (!info.isFile() || info.isSymbolicLink()))
    throw new Error(`${path}: expected a regular run log`);
  const file = await open(
    path,
    constants.O_RDWR |
      constants.O_APPEND |
      constants.O_CREAT |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    const opened = await file.stat();
    if (
      !opened.isFile() ||
      (info && (opened.ino !== info.ino || opened.dev !== info.dev))
    )
      throw new Error(`${path}: run log changed while opening`);
    let separator = "";
    if (opened.size > 0) {
      const lastByte = Buffer.alloc(1);
      await file.read(lastByte, 0, 1, opened.size - 1);
      if (lastByte[0] !== 10) separator = "\n";
    }
    await file.writeFile(separator + JSON.stringify(record) + "\n");
  } finally {
    await file.close();
  }
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (hasCode(error, "ESRCH")) return false;
    if (hasCode(error, "EPERM")) return true;
    throw error;
  }
}

export async function acquireRoleLock(
  path: string,
): Promise<() => Promise<void>> {
  const token = JSON.stringify({
    pid: process.pid,
    token: crypto.randomUUID(),
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeExclusive(path, token);
      return async () => {
        if ((await readRegularFile(path)) === token) await unlink(path);
      };
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
      const content = await readRegularFile(path);
      if (!content) throw new Error(`Maintenance role is locked: ${path}`);
      const lock: unknown = JSON.parse(content);
      if (
        typeof lock !== "object" ||
        lock === null ||
        !("pid" in lock) ||
        typeof lock.pid !== "number" ||
        !Number.isInteger(lock.pid) ||
        lock.pid <= 0
      )
        throw new Error(`Invalid maintenance lock: ${path}`);
      if (processAlive(lock.pid))
        throw new Error(
          `Maintenance role is already running (PID ${lock.pid})`,
        );
      if ((await readRegularFile(path)) === content) await unlink(path);
    }
  }
  throw new Error(`Cannot acquire maintenance role lock: ${path}`);
}
