import {
  mkdtemp,
  mkdir,
  chmod,
  readFile,
  readdir,
  rm,
  symlink,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, expect, test } from "bun:test";
import {
  hookEntries,
  hookRegistrationPaths,
  mergeHookSettings,
} from "../src/hook-registration.ts";
import { overlayInstall, overlayUninstall } from "../src/overlay-install.ts";
import { configDirectory } from "../src/config.ts";
import {
  windowsShimScript,
  type AppServerSpawner,
} from "../src/codex-hook-trust.ts";

const directories: string[] = [];
import { INTEGRATION_TIMEOUT_MS } from "./constants.ts";

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function temporaryHome(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "meta-harness-overlay-test-"));
  directories.push(path);
  return path;
}

function fakeCodex(
  calls: Record<string, unknown>[],
  sourcePath: string,
  overlay?: string,
): AppServerSpawner {
  return () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    let pending = "";
    stdin.on("data", (chunk: Buffer) => {
      pending += chunk.toString("utf8");
      while (pending.includes("\n")) {
        const boundary = pending.indexOf("\n");
        const line = pending.slice(0, boundary);
        pending = pending.slice(boundary + 1);
        if (!line) continue;
        const request = JSON.parse(line) as Record<string, unknown>;
        calls.push(request);
        if (typeof request.id !== "number") continue;
        let result: unknown = {};
        if (request.method === "hooks/list") {
          result = {
            data: [
              {
                hooks: [
                  ...hookEntries("codex", overlay).map(
                    ({ event, entry }, index) => ({
                      key: `hook-${index}`,
                      currentHash: `hash-${index}`,
                      eventName: event === "PreToolUse" ? "preToolUse" : "stop",
                      sourcePath,
                      handlerType: "command",
                      command: (
                        entry.hooks as Array<Record<string, unknown>>
                      )[0]?.command,
                      matcher: entry.matcher ?? null,
                      timeoutSec: 120,
                    }),
                  ),
                  {
                    key: "substring-only",
                    currentHash: "must-not-trust-substring",
                    eventName: "stop",
                    sourcePath,
                    handlerType: "command",
                    command: "echo meta-harness hook stop --harness codex",
                    matcher: null,
                    timeoutSec: 120,
                  },
                  {
                    key: "wrong-matcher",
                    currentHash: "must-not-trust-matcher",
                    eventName: "preToolUse",
                    sourcePath,
                    handlerType: "command",
                    command: "meta-harness hook pre-tool-use --harness codex",
                    matcher: "^Write$",
                    timeoutSec: 120,
                  },
                  {
                    key: "wrong-source",
                    currentHash: "must-not-trust-source",
                    eventName: "stop",
                    sourcePath: join(dirname(sourcePath), "other-hooks.json"),
                    handlerType: "command",
                    command: "meta-harness hook stop --harness codex",
                    matcher: null,
                    timeoutSec: 120,
                  },
                ],
              },
            ],
          };
        }
        stdout.write(`${JSON.stringify({ id: request.id, result })}\n`);
      }
    });
    return {
      stdin,
      stdout,
      kill: () => {
        stdout.end();
        return true;
      },
    };
  };
}

test("hook settings merge idempotently and target only selected harnesses", () => {
  const original = JSON.stringify({
    permissions: { allow: ["Read"] },
    hooks: { SessionStart: [] },
  });
  const installed = mergeHookSettings(original, "claude");
  expect(JSON.parse(mergeHookSettings(installed, "claude"))).toEqual(
    JSON.parse(installed),
  );
  expect(JSON.parse(installed).permissions).toEqual({ allow: ["Read"] });
  expect(JSON.parse(installed).hooks.SessionStart).toEqual([]);
  expect(hookRegistrationPaths({ targets: ["claude-code", "codex"] })).toEqual([
    ".claude/settings.json",
    ".codex/hooks.json",
  ]);
  expect(hookRegistrationPaths({ targets: ["codex"] })).toEqual([
    ".codex/hooks.json",
  ]);
  expect(hookRegistrationPaths({})).toEqual([
    ".claude/settings.json",
    ".codex/hooks.json",
  ]);
  const withOverlay = JSON.parse(
    mergeHookSettings(undefined, "codex", "./personal overlay"),
  );
  expect(withOverlay.hooks.PreToolUse[0].hooks[0].command).toContain(
    "--overlay",
  );
  expect(
    windowsShimScript(
      "C:\\Users\\user\\npm\\codex.cmd",
      '@"%~dp0%\\..\\node_modules\\@openai\\codex\\bin\\codex.js" %*',
    ),
  ).toBe("C:\\Users\\user\\node_modules\\@openai\\codex\\bin\\codex.js");
});

test(
  "overlay install follows settings symlinks, backs up, trusts only added Codex hooks, and restores exact bytes",
  async () => {
    const home = await temporaryHome();
    const claudePath = join(home, ".claude/settings.json");
    const claudeTarget = join(home, "claude-preferences.json");
    const codexPath = join(home, ".codex/hooks.json");
    const codexTarget = join(home, "codex-hooks-store.json");
    const claudeOriginal = Buffer.from(
      '{ "permissions": {"allow": ["Read"]}, "hooks": {"Stop": []} }\n',
    );
    const codexOriginal = Buffer.from('{"hooks":{"SessionStart":[]}}\n');
    await mkdir(dirname(claudePath), { recursive: true });
    await mkdir(dirname(codexPath), { recursive: true });
    await writeFile(claudeTarget, claudeOriginal);
    await writeFile(codexTarget, codexOriginal);
    await chmod(claudeTarget, 0o640);
    await chmod(codexTarget, 0o600);
    const claudeSourceMode = (await stat(claudeTarget)).mode & 0o777;
    const codexSourceMode = (await stat(codexTarget)).mode & 0o777;
    await symlink(claudeTarget, claudePath);
    await symlink(codexTarget, codexPath);
    const calls: Record<string, unknown>[] = [];
    const spawnOptions: Array<{
      shell: false;
      stdio: ["pipe", "pipe", "ignore"];
      env: NodeJS.ProcessEnv;
    }> = [];
    const codexHooksPath = codexTarget;
    const options = {
      home,
      overlay: join(home, "personal overlay"),
      codexPath: "fake-codex",
      spawnAppServer: ((
        command: string,
        args: string[],
        spawnOptionsForCall: Parameters<AppServerSpawner>[2],
      ) => {
        expect(command).toBe("fake-codex");
        expect(args).toEqual(["app-server"]);
        spawnOptions.push(spawnOptionsForCall);
        return fakeCodex(calls, codexHooksPath, join(home, "personal overlay"))(
          command,
          args,
          spawnOptionsForCall,
        );
      }) as AppServerSpawner,
      env: { PATH: "" },
    };

    const first = await overlayInstall(options);
    const claudeInstalled = await readFile(claudeTarget);
    const codexInstalled = await readFile(codexTarget);
    const codexEntry = hookEntries("codex", join(home, "personal overlay"))[0]
      ?.entry;
    const installedCommand = (
      (
        JSON.parse(codexInstalled.toString("utf8")).hooks
          .PreToolUse[0] as Record<string, unknown>
      ).hooks as Array<Record<string, unknown>>
    )[0]?.command;
    const expectedCommand = (
      codexEntry?.hooks as Array<Record<string, unknown>>
    )[0]?.command;
    expect(installedCommand).toBe(expectedCommand);
    const second = await overlayInstall(options);
    expect(await readFile(claudeTarget)).toEqual(claudeInstalled);
    expect(await readFile(codexTarget)).toEqual(codexInstalled);
    expect(
      first.some((line) => line.includes("Trusted 2 Codex hook entries")),
    ).toBe(true);
    expect(
      calls.filter((request) => request.method === "hooks/list"),
    ).toHaveLength(2);
    expect(spawnOptions[0]?.shell).toBe(false);
    const batchWrite = calls.find(
      (request) => request.method === "config/batchWrite",
    );
    expect(batchWrite).toBeDefined();
    const value = (
      batchWrite?.params as { edits: Array<{ value: Record<string, unknown> }> }
    ).edits[0]?.value;
    expect(value).toEqual({
      "hook-0": { trusted_hash: "hash-0" },
      "hook-1": { trusted_hash: "hash-1" },
    });
    expect(
      Object.keys(value ?? {}).some((key) => key.startsWith("must-not-trust")),
    ).toBe(false);
    expect(
      (await readdir(dirname(claudeTarget))).some((name) =>
        name.includes("meta-harness-backup"),
      ),
    ).toBe(true);
    expect(
      (await readdir(dirname(codexTarget))).some((name) =>
        name.includes("meta-harness-backup"),
      ),
    ).toBe(true);
    const journalPath = join(configDirectory(home, {}), "overlay-install.json");
    const journalText = await readFile(journalPath, "utf8");
    const journal = JSON.parse(journalText) as { files: unknown[] };
    if (process.platform !== "win32")
      expect(await stat(journalPath).then((value) => value.mode & 0o777)).toBe(
        0o600,
      );
    expect(journalText).not.toContain("base64");
    expect(journalText).not.toContain("API_TOKEN");
    expect(journalText).not.toContain("original");
    expect(journal.files).toHaveLength(2);
    const backupNames = await readdir(dirname(claudeTarget));
    const claudeBackup = backupNames.find((name) =>
      name.startsWith("claude-preferences.json.meta-harness-backup"),
    );
    const codexBackup = backupNames.find((name) =>
      name.startsWith("codex-hooks-store.json.meta-harness-backup"),
    );
    expect(claudeBackup).toBeDefined();
    expect(codexBackup).toBeDefined();
    expect(
      await stat(join(dirname(claudeTarget), claudeBackup!)).then(
        (value) => value.mode & 0o777,
      ),
    ).toBe(claudeSourceMode);
    expect(
      await stat(join(dirname(codexTarget), codexBackup!)).then(
        (value) => value.mode & 0o777,
      ),
    ).toBe(codexSourceMode);

    const uninstall = await overlayUninstall({ home });
    expect(
      uninstall.some((line) => line.includes("Removed meta-harness")),
    ).toBe(true);
    expect(await readFile(claudeTarget)).toEqual(claudeOriginal);
    expect(await readFile(codexTarget)).toEqual(codexOriginal);
    expect(
      (await readdir(dirname(claudeTarget))).some((name) =>
        name.includes("meta-harness-backup"),
      ),
    ).toBe(false);
    expect(
      (await readdir(dirname(codexTarget))).some((name) =>
        name.includes("meta-harness-backup"),
      ),
    ).toBe(false);
    expect(
      (await import("node:fs/promises"))
        .lstat(claudePath)
        .then((stat) => stat.isSymbolicLink()),
    ).resolves.toBe(true);
    expect(await overlayUninstall({ home })).toEqual([
      "meta-harness overlay hooks are not installed.",
    ]);
    expect(second.some((line) => line.includes("Updated"))).toBe(false);
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "uninstall removes only its entries and preserves later user settings after re-install",
  async () => {
    const home = await temporaryHome();
    const path = join(home, ".claude/settings.json");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({ permissions: { allow: ["Read"] }, hooks: { Stop: [] } }),
    );
    await overlayInstall({ home, env: { PATH: "" } });
    const current = JSON.parse(await readFile(path, "utf8"));
    current.permissions.deny = ["Bash"];
    current.hooks.Stop.push({
      hooks: [{ type: "command", command: "later user hook" }],
    });
    await writeFile(path, JSON.stringify(current));
    await overlayInstall({ home, env: { PATH: "" } });

    await overlayUninstall({ home });
    const restored = JSON.parse(await readFile(path, "utf8"));
    expect(restored.permissions).toEqual({ allow: ["Read"], deny: ["Bash"] });
    expect(restored.hooks.Stop).toEqual([
      { hooks: [{ type: "command", command: "later user hook" }] },
    ]);
    expect(restored.hooks.PreToolUse).toBeUndefined();
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "dry run and missing Codex PATH do not invoke an app-server or write outside the temporary home",
  async () => {
    const home = await temporaryHome();
    const dry = await overlayInstall({ home, dryRun: true, env: { PATH: "" } });
    expect(dry.some((line) => line.includes("Dry run"))).toBe(true);
    expect(
      await (
        await import("node:fs/promises")
      )
        .lstat(join(home, ".claude/settings.json"))
        .catch(() => undefined),
    ).toBeUndefined();

    const messages = await overlayInstall({ home, env: { PATH: "" } });
    expect(messages).toContain(
      "Codex is not on PATH; review and trust the new hooks with /hooks.",
    );
    await overlayUninstall({ home });
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "uninstall recovers an interrupted install without rewriting an untouched file",
  async () => {
    const home = await temporaryHome();
    const claude = join(home, ".claude/settings.json");
    const codex = join(home, ".codex/hooks.json");
    const original = Buffer.from('{"keep":true}\n');
    await mkdir(dirname(claude), { recursive: true });
    await mkdir(dirname(codex), { recursive: true });
    await writeFile(claude, original);
    await writeFile(codex, original);
    await overlayInstall({ home, env: { PATH: "" } });
    await writeFile(codex, original);
    await overlayUninstall({ home });
    expect(await readFile(claude)).toEqual(original);
    expect(await readFile(codex)).toEqual(original);
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "uninstall resolves settings again after they are moved behind a dotfiles symlink",
  async () => {
    const home = await temporaryHome();
    const settingsPath = join(home, ".claude/settings.json");
    const dotfilesPath = join(home, "dotfiles/claude-settings.json");
    await mkdir(dirname(settingsPath), { recursive: true });
    await mkdir(dirname(dotfilesPath), { recursive: true });
    await writeFile(settingsPath, '{"keep":true}\n');
    await overlayInstall({ home, env: { PATH: "" } });
    const installed = JSON.parse(await readFile(settingsPath, "utf8")) as {
      hooks: { PreToolUse: Array<Record<string, unknown>> };
    };
    const ownedGroup = installed.hooks.PreToolUse.find((group) =>
      Array.isArray(group.hooks),
    );
    expect(ownedGroup).toBeDefined();
    const matcher = ownedGroup?.matcher;
    (ownedGroup?.hooks as Array<Record<string, unknown>>).push({
      type: "command",
      command: "user handler in the same group",
    });
    await writeFile(settingsPath, JSON.stringify(installed));
    await (await import("node:fs/promises")).rename(settingsPath, dotfilesPath);
    await symlink(dotfilesPath, settingsPath);

    await overlayUninstall({ home });

    const resolved = JSON.parse(await readFile(dotfilesPath, "utf8")) as {
      keep?: boolean;
      hooks?: Record<string, unknown[]>;
    };
    expect(resolved.keep).toBe(true);
    expect(JSON.stringify(resolved)).not.toContain("meta-harness hook");
    const preservedGroup = resolved.hooks?.PreToolUse?.[0] as
      Record<string, unknown> | undefined;
    expect(preservedGroup?.matcher).toBe(matcher);
    expect(preservedGroup?.hooks).toEqual([
      { type: "command", command: "user handler in the same group" },
    ]);
    expect(
      (await readdir(join(home, ".claude"))).some((name) =>
        name.includes("meta-harness-backup"),
      ),
    ).toBe(false);
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "Codex app-server spawn errors are reported through the real launch path",
  async () => {
    const home = await temporaryHome();
    const codexPath = join(
      home,
      process.platform === "win32" ? "codex.exe" : "codex",
    );
    await writeFile(
      codexPath,
      process.platform === "win32"
        ? ""
        : "#!/no-such-meta-harness-interpreter\n",
    );
    if (process.platform !== "win32") await chmod(codexPath, 0o755);

    const messages = await overlayInstall({
      home,
      env: { PATH: "" },
      codexPath,
      timeoutMs: 100,
    });

    expect(
      messages.some(
        (message) =>
          message.includes("Codex hook approval failed") &&
          /ENOENT|EACCES|EINVAL|spawn/i.test(message),
      ),
    ).toBe(true);
    await overlayUninstall({ home });
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "Codex app-server stdin EPIPE is reported instead of waiting for the RPC timeout",
  async () => {
    const home = await temporaryHome();
    const stdin = new PassThrough();
    stdin.write = (() => {
      queueMicrotask(() => {
        stdin.emit(
          "error",
          Object.assign(new Error("broken pipe"), { code: "EPIPE" }),
        );
      });
      return false;
    }) as typeof stdin.write;
    const stdout = new PassThrough();

    const messages = await overlayInstall({
      home,
      env: { PATH: "" },
      codexPath: "fake-codex",
      spawnAppServer: () => ({
        stdin,
        stdout,
        kill: () => {
          stdout.end();
          return true;
        },
      }),
      timeoutMs: 1000,
    });

    expect(
      messages.some(
        (message) =>
          message.includes("Codex hook approval failed") &&
          /EPIPE|broken pipe/i.test(message),
      ),
    ).toBe(true);
    await overlayUninstall({ home });
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "install can update its hook command when the selected overlay changes",
  async () => {
    const home = await temporaryHome();
    const calls: Record<string, unknown>[] = [];
    await overlayInstall({
      home,
      overlay: join(home, "one"),
      env: { PATH: "" },
      codexPath: "fake-codex",
      spawnAppServer: fakeCodex(calls, join(home, ".codex/hooks.json")),
    });
    const updated = await overlayInstall({
      home,
      overlay: join(home, "two"),
      env: { PATH: "" },
      codexPath: "fake-codex",
      spawnAppServer: fakeCodex(calls, join(home, ".codex/hooks.json")),
    });
    expect(updated.some((message) => message.includes("Updated"))).toBe(true);
    await overlayUninstall({ home });
    for (const path of [
      join(home, ".claude/settings.json"),
      join(home, ".codex/hooks.json"),
    ]) {
      const contents = await readFile(path, "utf8").catch(() => "");
      expect(contents).not.toContain("--overlay");
    }
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "Codex approval RPC errors leave valid removable registrations and kill the app-server",
  async () => {
    const home = await temporaryHome();
    let killed = false;
    const spawnAppServer: AppServerSpawner = () => {
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      stdin.on("data", (chunk: Buffer) => {
        const request = JSON.parse(chunk.toString("utf8")) as { id?: number };
        if (request.id === undefined) return;
        stdout.write(
          `${JSON.stringify({ id: request.id, error: { message: "injected RPC error" } })}\n`,
        );
      });
      return {
        stdin,
        stdout,
        kill: () => {
          killed = true;
          stdout.end();
          return true;
        },
      };
    };

    const messages = await overlayInstall({
      home,
      env: { PATH: "" },
      codexPath: "fake-codex",
      spawnAppServer,
      timeoutMs: 100,
    });
    expect(
      messages.some((message) =>
        message.includes("Codex hook approval failed"),
      ),
    ).toBe(true);
    expect(killed).toBe(true);
    for (const path of [
      join(home, ".claude/settings.json"),
      join(home, ".codex/hooks.json"),
    ])
      expect(JSON.parse(await readFile(path, "utf8")).hooks).toBeDefined();
    expect(
      (await overlayUninstall({ home })).some((message) =>
        message.includes("Removed meta-harness"),
      ),
    ).toBe(true);
    expect(
      await readFile(join(home, ".codex/hooks.json")).catch(() => undefined),
    ).toBeUndefined();
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "Codex approval RPC timeout is reported and the app-server is killed",
  async () => {
    const home = await temporaryHome();
    let killed = false;
    const spawnAppServer: AppServerSpawner = () => {
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      return {
        stdin,
        stdout,
        kill: () => {
          killed = true;
          stdout.end();
          return true;
        },
      };
    };

    const messages = await overlayInstall({
      home,
      env: { PATH: "" },
      codexPath: "fake-codex",
      spawnAppServer,
      timeoutMs: 10,
    });
    expect(
      messages.some(
        (message) =>
          message.includes("Codex hook approval failed") &&
          message.includes("timed out"),
      ),
    ).toBe(true);
    expect(killed).toBe(true);
    for (const path of [
      join(home, ".claude/settings.json"),
      join(home, ".codex/hooks.json"),
    ])
      expect(JSON.parse(await readFile(path, "utf8")).hooks).toBeDefined();
    expect(
      (await overlayUninstall({ home })).some((message) =>
        message.includes("Removed meta-harness"),
      ),
    ).toBe(true);
  },
  INTEGRATION_TIMEOUT_MS,
);
