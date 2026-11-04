import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { INTEGRATION_TIMEOUT_MS } from "./constants.ts";
import { hookEntries } from "../src/hook-registration.ts";

const EMPTY_BUNFIG = resolve(import.meta.dir, "../src/hook.bunfig.toml");
const CLI = resolve(import.meta.dir, "../src/cli.ts");

async function temporaryDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "meta-harness-hook-runtime-"));
}

async function writeOverlay(
  root: string,
  id: string,
  source: string,
): Promise<string> {
  const pack = join(root, id);
  await mkdir(join(pack, "command-rules"), { recursive: true });
  await writeFile(
    join(pack, "pack.json"),
    JSON.stringify({
      name: id,
      version: "1.0.0",
      domain: "general",
      description: "Hook runtime fixture.",
      parts: ["checks"],
      knowledge: [],
      templates: [],
      checkers: [],
      profileSchema: "profile.schema.json",
      overlay: true,
      commandRules: ["command-rules/rule.ts"],
      researchTopics: [],
    }),
  );
  await writeFile(
    join(pack, "profile.schema.json"),
    JSON.stringify({ type: "object", additionalProperties: true }),
  );
  await writeFile(join(pack, "command-rules/rule.ts"), source);
  return root;
}

async function invokeHook(
  root: string,
  options: {
    overlay?: string;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const args = [
    process.execPath,
    "--no-env-file",
    `--config=${EMPTY_BUNFIG}`,
    CLI,
    "hook",
    "pre-tool-use",
    "--harness",
    "claude",
    "--timeout-ms",
    String(options.timeoutMs ?? 5_000),
  ];
  if (options.overlay) args.push("--overlay", options.overlay);
  const child = Bun.spawn(args, {
    cwd: root,
    ...(options.env === undefined ? {} : { env: options.env }),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 15_000,
    killSignal: "SIGKILL",
  });
  child.stdin.write(
    JSON.stringify({
      cwd: root,
      tool_name: "Bash",
      tool_input: { command: "tool --danger" },
    }),
  );
  child.stdin.end();
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

async function invokeRegisteredHook(
  root: string,
  options: { timeout?: number; env?: NodeJS.ProcessEnv } = {},
) {
  const registration = hookEntries("claude").find(
    ({ event }) => event === "PreToolUse",
  )?.entry;
  const handlers = registration?.hooks as
    { command?: string; shell?: string }[] | undefined;
  const hookCommand = handlers?.[0]?.command;
  if (!hookCommand) throw new Error("registered PreToolUse command is missing");
  const args =
    process.platform === "win32"
      ? ["powershell.exe", "-NoProfile", "-Command", hookCommand]
      : ["/bin/sh", "-lc", hookCommand];
  const child = Bun.spawn(args, {
    cwd: root,
    ...(options.env === undefined ? {} : { env: options.env }),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    timeout: options.timeout ?? 15_000,
    killSignal: "SIGKILL",
  });
  child.stdin.write(
    JSON.stringify({
      cwd: root,
      tool_name: "Bash",
      tool_input: { command: "tool --danger" },
    }),
  );
  child.stdin.end();
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

test(
  "registered hook runtime ignores repository bunfig preload and dotenv overlay",
  async () => {
    const root = await temporaryDirectory();
    const home = join(root, "home");
    const emptyOverlay = join(home, ".config", "meta-harness", "overlay");
    const evilOverlay = await writeOverlay(
      join(root, "evil-overlay"),
      "evil-overlay",
      'export const id="evil"; export function check(){return "loaded dotenv overlay"}',
    );
    const marker = join(root, "preloaded");
    await mkdir(home, { recursive: true });
    await mkdir(emptyOverlay, { recursive: true });
    await writeFile(
      join(root, ".env"),
      `META_HARNESS_OVERLAY=${evilOverlay.replaceAll("\\", "/")}\n`,
    );
    await writeFile(
      join(root, "pwn.ts"),
      `await Bun.write(${JSON.stringify(marker)}, "ran")`,
    );
    await writeFile(
      join(root, "bunfig.toml"),
      `preload = ${JSON.stringify([join(root, "pwn.ts")])}\n`,
    );
    try {
      const environment: NodeJS.ProcessEnv = {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        APPDATA: join(home, "appdata"),
        XDG_CONFIG_HOME: join(home, ".config"),
        CODEX_HOME: join(home, ".codex"),
      };
      delete environment.META_HARNESS_OVERLAY;
      const result = await invokeRegisteredHook(root, { env: environment });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({});
      expect(result.stderr).not.toContain("loaded dotenv overlay");
      expect(await Bun.file(marker).exists()).toBe(false);
      const entry = hookEntries("claude").find(
        ({ event }) => event === "PreToolUse",
      )?.entry;
      const handler = (
        entry?.hooks as { command: string; shell?: string }[]
      )?.[0];
      expect(handler?.command).toContain("--no-env-file --config=");
      expect(handler?.command).toContain(process.execPath);
      if (process.platform === "win32")
        expect(handler?.shell).toBe("powershell");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "hook CLI kills a non-yielding rule at its deadline and fails open",
  async () => {
    const root = await temporaryDirectory();
    try {
      const overlay = await writeOverlay(
        join(root, "overlay"),
        "hang-rule",
        `export const id="hang"; export async function check(){await Bun.write(${JSON.stringify(join(root, "started"))}, "started"); while(true){}}`,
      );
      const result = await invokeHook(root, {
        overlay,
        timeoutMs: 2_000,
      });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({});
      expect(result.stderr).toContain("hook deadline exceeded");
      expect(await Bun.file(join(root, "started")).exists()).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "hook CLI kills a rule awaiting a promise that never resolves",
  async () => {
    const root = await temporaryDirectory();
    try {
      const overlay = await writeOverlay(
        join(root, "overlay"),
        "never-rule",
        `export const id="never"; export async function check(){await Bun.write(${JSON.stringify(join(root, "started"))}, "started"); return new Promise(()=>{})}`,
      );
      const result = await invokeHook(root, {
        overlay,
        timeoutMs: 2_000,
      });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({});
      expect(result.stderr).toContain("hook deadline exceeded");
      expect(await Bun.file(join(root, "started")).exists()).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "hook CLI sends rule console output to stderr and leaves decision JSON on stdout",
  async () => {
    const root = await temporaryDirectory();
    try {
      const overlay = await writeOverlay(
        join(root, "overlay"),
        "logging-rule",
        'export const id="logging"; export function check(){console.log("rule debug"); return null}',
      );
      const result = await invokeHook(root, { overlay });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({});
      expect(result.stdout).not.toContain("rule debug");
      expect(result.stderr).toContain("rule debug");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  INTEGRATION_TIMEOUT_MS,
);
