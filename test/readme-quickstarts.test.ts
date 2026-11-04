import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INTEGRATION_TIMEOUT_MS } from "./constants.ts";

const root = join(import.meta.dir, "..");
const readme = await Bun.file(join(root, "README.md")).text();
const plans = [...readme.matchAll(/```json\n([\s\S]+?)\n```/g)].map((match) =>
  JSON.parse(match[1]!),
);

test(
  "both README quickstarts initialize and pass check through the real CLI",
  async () => {
    expect(plans.map((plan) => plan.pack).sort()).toEqual([
      "coding",
      "knowledge-wiki",
    ]);
    const directory = await mkdtemp(join(tmpdir(), "readme-quickstarts-"));
    try {
      for (const plan of plans) {
        const target = join(directory, plan.pack);
        const planPath = join(directory, `${plan.pack}.json`);
        await Bun.write(planPath, JSON.stringify(plan));
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
