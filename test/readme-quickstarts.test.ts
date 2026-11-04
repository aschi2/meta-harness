import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { parsePlan } from "../src/schema.ts";
import { INTEGRATION_TIMEOUT_MS } from "./constants.ts";

const root = join(import.meta.dir, "..");
const planPaths = await Array.fromAsync(
  new Bun.Glob("examples/*-plan.json").scan(root),
);

test(
  "all example plans validate, initialize and pass check through the real CLI",
  async () => {
    expect(planPaths.length).toBeGreaterThan(0);
    const directory = await mkdtemp(join(tmpdir(), "readme-quickstarts-"));
    try {
      for (const path of planPaths) {
        const planPath = join(root, path);
        const plan = parsePlan(await Bun.file(planPath).json());
        const target = join(directory, basename(path, ".json"));
        for (const args of [
          ["init", "--pack", plan.pack, "--plan", planPath, "--target", target],
          ["check", "--target", target],
        ]) {
          const result = Bun.spawnSync(
            [
              process.execPath,
              "--no-env-file",
              `--config=${join(root, "src/hook.bunfig.toml")}`,
              join(root, "src/cli.ts"),
              ...args,
            ],
            {
              cwd: directory,
              timeout: 15000,
              env: {
                ...process.env,
                HOME: directory,
                USERPROFILE: directory,
                APPDATA: join(directory, "AppData"),
                CODEX_HOME: join(directory, ".codex"),
                META_HARNESS_OVERLAY: join(directory, "empty-overlay"),
              },
            },
          );
          expect(
            result.exitCode,
            result.stdout.toString() + result.stderr.toString(),
          ).toBe(0);
        }
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  INTEGRATION_TIMEOUT_MS,
);
