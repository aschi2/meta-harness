import { spawn as nodeSpawn } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, resolve, win32 } from "node:path";
import type { Readable, Writable } from "node:stream";
import { hookEntries } from "./hook-registration.ts";

type EventName = "PreToolUse" | "Stop";

interface AppServerProcess {
  stdin: Writable;
  stdout: Readable;
  kill(): unknown;
  on?(event: "error", listener: (error: Error) => void): unknown;
  off?(event: "error", listener: (error: Error) => void): unknown;
}

export type AppServerSpawner = (
  command: string,
  args: string[],
  options: {
    shell: false;
    stdio: ["pipe", "pipe", "ignore"];
    env: NodeJS.ProcessEnv;
  },
) => AppServerProcess;

export function windowsShimScript(
  commandPath: string,
  contents: string,
): string | undefined {
  const entry = /%~?dp0%[\\/]([^"\r\n]*?codex\.js)/i.exec(contents)?.[1];
  return entry ? win32.resolve(win32.dirname(commandPath), entry) : undefined;
}

export interface CodexTrustOptions {
  home: string;
  overlay?: string;
  sourcePaths: string[];
  addedEvents: Array<"PreToolUse" | "Stop">;
  env?: NodeJS.ProcessEnv;
  codexPath?: string;
  spawnAppServer?: AppServerSpawner;
  timeoutMs?: number;
}

const RPC_TIMEOUT_MS = 10_000;

async function appServerLaunch(
  codexPath: string,
  env: NodeJS.ProcessEnv,
): Promise<{ command: string; args: string[] } | undefined> {
  if (process.platform !== "win32" || !/\.(?:cmd|bat)$/i.test(codexPath))
    return { command: codexPath, args: ["app-server"] };
  const shim = await readFile(codexPath, "utf8");
  const script = windowsShimScript(codexPath, shim);
  const node = Bun.which("node", { PATH: env.PATH ?? "" }) ?? undefined;
  if (!script || !node) return undefined;
  return { command: node, args: [script, "app-server"] };
}

async function readResponse(
  process: AppServerProcess,
  lines: AsyncIterator<string>,
  requestId: number,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onError = (error: Error): void => {
    rejectChild(error);
  };
  let rejectChild: (error: Error) => void = () => undefined;
  try {
    const childError = new Promise<never>((_, reject) => {
      rejectChild = reject;
      process.on?.("error", onError);
      process.stdin.on("error", onError);
    });
    return await Promise.race([
      (async () => {
        while (true) {
          const next = await lines.next();
          if (next.done)
            throw new Error("Codex app-server closed before replying");
          const line = next.value;
          let message: unknown;
          try {
            message = JSON.parse(line);
          } catch {
            continue;
          }
          if (
            typeof message === "object" &&
            message !== null &&
            "id" in message &&
            message.id === requestId
          ) {
            if ("error" in message)
              throw new Error(
                `Codex app-server RPC failed: ${JSON.stringify(message.error)}`,
              );
            return message as Record<string, unknown>;
          }
        }
      })(),
      childError,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Codex app-server RPC timed out")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    process.off?.("error", onError);
    process.stdin.off("error", onError);
  }
}

async function rpc(
  process: AppServerProcess,
  lines: AsyncIterator<string>,
  id: number,
  method: string,
  params?: unknown,
  timeoutMs = RPC_TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  const response = readResponse(process, lines, id, timeoutMs);
  try {
    process.stdin.write(
      `${JSON.stringify({ method, id, ...(params === undefined ? {} : { params }) })}\n`,
    );
  } catch (error) {
    await response.catch(() => undefined);
    throw error;
  }
  return response;
}

async function requestedEvents(
  result: Record<string, unknown>,
  addedEvents: Array<"PreToolUse" | "Stop">,
  overlay?: string,
  sourcePaths: string[] = [],
) {
  const data = (result.result as Record<string, unknown> | undefined)?.data;
  if (!Array.isArray(data))
    throw new Error("Codex hooks/list returned no hook data");
  const registrations = hookEntries("codex", overlay).filter(({ event }) =>
    addedEvents.includes(event),
  );
  const canonicalSources = await Promise.all(
    sourcePaths.map(
      async (path) => await realpath(path).catch(() => resolve(path)),
    ),
  );
  const candidates = new Map<string, Array<{ key: string; hash: string }>>();
  for (const entry of data) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !Array.isArray((entry as Record<string, unknown>).hooks)
    )
      continue;
    for (const hook of (entry as Record<string, unknown>).hooks as unknown[]) {
      if (typeof hook !== "object" || hook === null) continue;
      const metadata = hook as Record<string, unknown>;
      const sourcePath =
        typeof metadata.sourcePath === "string"
          ? await realpath(metadata.sourcePath).catch(() =>
              resolve(metadata.sourcePath as string),
            )
          : undefined;
      const registration = registrations.find(({ event, entry: value }) => {
        const command = (value.hooks as Array<Record<string, unknown>>)[0]
          ?.command;
        const expectedEvent = event === "PreToolUse" ? "preToolUse" : "stop";
        const expectedMatcher =
          event === "PreToolUse"
            ? "^(Bash|shell|local_shell|run_command|exec_command)$"
            : null;
        const expectedTimeout = 120;
        const knownSource = canonicalSources.some((candidate) =>
          process.platform === "win32"
            ? resolve(candidate).toLowerCase() === sourcePath?.toLowerCase()
            : resolve(candidate) === sourcePath,
        );
        return (
          metadata.handlerType === "command" &&
          metadata.command === command &&
          metadata.eventName === expectedEvent &&
          (event === "PreToolUse"
            ? metadata.matcher === expectedMatcher
            : metadata.matcher == null) &&
          metadata.timeoutSec === expectedTimeout &&
          knownSource
        );
      });
      if (!registration) continue;
      if (
        typeof metadata.key !== "string" ||
        typeof metadata.currentHash !== "string"
      )
        throw new Error(
          "Codex hooks/list entry is missing its key or currentHash",
        );
      const entries = candidates.get(registration.event) ?? [];
      entries.push({ key: metadata.key, hash: metadata.currentHash });
      candidates.set(registration.event, entries);
    }
  }
  const updates: Record<string, { trusted_hash: string }> = {};
  const ambiguous: EventName[] = [];
  for (const event of addedEvents) {
    const entries = candidates.get(event) ?? [];
    if (entries.length !== 1) {
      ambiguous.push(event);
      continue;
    }
    const entry = entries[0];
    if (entry) updates[entry.key] = { trusted_hash: entry.hash };
  }
  return { updates, ambiguous };
}

export async function approveAddedCodexHooks(
  options: CodexTrustOptions,
): Promise<string[]> {
  if (options.addedEvents.length === 0) return [];
  const environment = options.env ?? process.env;
  const command =
    options.codexPath ??
    Bun.which("codex", { PATH: environment.PATH ?? "" }) ??
    undefined;
  if (!command)
    return [
      "Codex is not on PATH; review and trust the new hooks with /hooks.",
    ];
  const launch = await appServerLaunch(command, environment);
  if (!launch)
    return [
      "Codex was found as a Windows command shim but its JavaScript launcher or Node runtime could not be resolved; review hooks with /hooks.",
    ];
  const server = (
    options.spawnAppServer ??
    ((executable, args, spawnOptions) =>
      nodeSpawn(executable, args, {
        ...spawnOptions,
      }) as AppServerProcess)
  )(launch.command, launch.args, {
    shell: false,
    stdio: ["pipe", "pipe", "ignore"],
    env: environment,
  });
  const lineInterface = createInterface({ input: server.stdout });
  const lines = lineInterface[Symbol.asyncIterator]();
  const timeoutMs = options.timeoutMs ?? RPC_TIMEOUT_MS;
  try {
    await rpc(
      server,
      lines,
      0,
      "initialize",
      {
        clientInfo: { name: "meta-harness-hook-trust", version: "0" },
      },
      timeoutMs,
    );
    server.stdin.write(`${JSON.stringify({ method: "initialized" })}\n`);
    const listing = await rpc(
      server,
      lines,
      1,
      "hooks/list",
      { cwds: [options.home] },
      timeoutMs,
    );
    const { updates, ambiguous } = await requestedEvents(
      listing,
      options.addedEvents,
      options.overlay,
      options.sourcePaths,
    );
    if (Object.keys(updates).length) {
      await rpc(
        server,
        lines,
        2,
        "config/batchWrite",
        {
          edits: [
            {
              keyPath: "hooks.state",
              value: updates,
              mergeStrategy: "upsert",
            },
          ],
          filePath: null,
          expectedVersion: null,
          reloadUserConfig: true,
        },
        timeoutMs,
      );
    }
    const messages = Object.keys(updates).length
      ? [
          `Trusted ${Object.keys(updates).length} Codex hook entr${Object.keys(updates).length === 1 ? "y" : "ies"}.`,
        ]
      : [];
    if (ambiguous.length)
      messages.push(
        `Could not uniquely identify added Codex hook(s): ${ambiguous.join(", ")}; review them with /hooks.`,
      );
    return messages.length
      ? messages
      : [
          "Codex did not report the newly added hooks; open /hooks to review them.",
        ];
  } finally {
    lineInterface.close();
    server.kill();
  }
}
