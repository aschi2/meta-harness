import { afterEach, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INTEGRATION_TIMEOUT_MS } from "./constants.ts";

const root = join(import.meta.dir, "..");
const temporary: string[] = [];
afterEach(async () => {
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true });
});

test.each([
  "bunx-1000-meta-harness/node_modules/meta-harness",
  ".npm/_npx/abcdef/node_modules/meta-harness",
])(
  "real CLI from temporary %s refuses hook registration while one-off commands work",
  async (location) => {
    const directory = await mkdtemp(join(tmpdir(), "meta-harness-cache-"));
    temporary.push(directory);
    const installed = join(directory, location);
    await mkdir(installed, { recursive: true });
    await cp(join(root, "src"), join(installed, "src"), { recursive: true });
    await cp(join(root, "package.json"), join(installed, "package.json"));
    for (const name of ["node_modules", "packs"])
      await symlink(
        join(root, name),
        join(installed, name),
        process.platform === "win32" ? "junction" : "dir",
      );
    const home = join(directory, "home");
    await mkdir(home);
    const target = join(directory, "target");
    const planPath = join(directory, "plan.json");
    const plan = {
      pack: "coding",
      hooks: true,
      profile: { sizeTier: "S", languages: [], targets: ["codex"] },
      files: [],
      symlinks: [],
    };
    await Bun.write(planPath, JSON.stringify(plan));
    const cli = (args: string[]) => {
      const result = Bun.spawnSync(
        [
          process.execPath,
          "--no-env-file",
          `--config=${join(installed, "src/hook.bunfig.toml")}`,
          join(installed, "src/cli.ts"),
          ...args,
        ],
        {
          cwd: directory,
          timeout: 15000,
          env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home,
            APPDATA: join(home, "AppData"),
            META_HARNESS_OVERLAY: join(home, "empty"),
            CODEX_HOME: join(home, ".codex"),
          },
        },
      );
      return {
        code: result.exitCode,
        out: result.stdout.toString(),
        error: result.stderr.toString(),
      };
    };
    const validation = cli(["validate"]);
    expect(validation.code, validation.error).toBe(0);
    expect(validation.out).toContain("Validated 4 pack(s).");
    for (const args of [
      ["overlay", "install"],
      ["overlay", "install", "--dry-run"],
      ["init", "--pack", "coding", "--plan", planPath, "--target", target],
    ]) {
      const result = cli(args);
      expect(result.code).toBe(1);
      expect(result.error).toContain("temporary bunx/npx cache");
      expect(result.error).toContain("bun add -g meta-harness");
    }
    expect(await Bun.file(join(home, ".claude/settings.json")).exists()).toBe(
      false,
    );
    expect(await Bun.file(join(home, ".codex/hooks.json")).exists()).toBe(
      false,
    );
    expect(
      await Bun.file(join(target, ".harness/manifest.json")).exists(),
    ).toBe(false);
    await Bun.write(planPath, JSON.stringify({ ...plan, hooks: false }));
    const init = cli([
      "init",
      "--pack",
      "coding",
      "--plan",
      planPath,
      "--target",
      target,
    ]);
    expect(init.code, init.error).toBe(0);
    expect(
      (await Bun.file(join(target, ".harness/manifest.json")).json())
        .metaHarnessVersion,
    ).toBe((await Bun.file(join(root, "package.json")).json()).version);
    await Bun.write(planPath, JSON.stringify(plan));
    const update = cli(["update", "--plan", planPath, "--target", target]);
    expect(update.code).toBe(1);
    expect(update.error).toContain("temporary bunx/npx cache");
    expect(await Bun.file(join(target, ".codex/hooks.json")).exists()).toBe(
      false,
    );
  },
  INTEGRATION_TIMEOUT_MS,
);
