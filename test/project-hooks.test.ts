import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init, readHarness, update } from "../src/apply.ts";
import { check } from "../src/check.ts";
import { INTEGRATION_TIMEOUT_MS } from "./constants.ts";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function workspace() {
  const directory = await mkdtemp(join(tmpdir(), "project-hook-test-"));
  directories.push(directory);
  const target = join(directory, "target");
  const planPath = join(directory, "plan.json");
  const plan = {
    pack: "coding",
    hooks: true,
    profile: {
      sizeTier: "S",
      languages: [],
      targets: ["claude-code", "codex"],
    },
    files: [
      { path: "AGENTS.md", parts: ["context"], content: "# Synthetic\n" },
    ],
    symlinks: [] as { path: string; target: string; parts: string[] }[],
  };
  await Bun.write(planPath, JSON.stringify(plan));
  return {
    directory,
    target,
    planPath,
    plan,
    packName: "coding",
    overlay: join(directory, "none"),
  };
}

test(
  "opt-in init and update manage both harness hook files while preserving unrelated hooks",
  async () => {
    const current = await workspace();
    await init(current);
    const codexPath = join(current.target, ".codex/hooks.json");
    const claudePath = join(current.target, ".claude/settings.json");
    const codex = await Bun.file(codexPath).json();
    const claude = await Bun.file(claudePath).json();
    expect(codex.hooks.PreToolUse).toHaveLength(1);
    expect(claude.hooks.Stop).toHaveLength(1);
    expect(codex.hooks.Stop[0].hooks[0].command).toContain("--harness codex");
    expect(claude.hooks.Stop[0].hooks[0].command).toContain("--harness claude");
    claude.permissions = { allow: ["Read"] };
    claude.hooks.Stop.push({
      hooks: [{ type: "command", command: "existing-user-hook" }],
    });
    await Bun.write(claudePath, JSON.stringify(claude, null, 2) + "\n");
    expect(
      (await check(current.target, undefined, { overlay: current.overlay }))
        .errors,
    ).toEqual([]);
    await update(current);
    await update(current);
    const updated = await Bun.file(claudePath).json();
    expect(updated.permissions).toEqual(claude.permissions);
    expect(updated.hooks.Stop).toHaveLength(2);
    const { manifest } = await readHarness(current.target);
    for (const path of [".claude/settings.json", ".codex/hooks.json"]) {
      expect(manifest.files[path]).toHaveProperty("sha256");
      expect(manifest.parts?.checks).toContain(path);
      expect(manifest.parts?.loop).toContain(path);
      expect(
        await Bun.file(
          join(current.target, ".harness/baseline", path),
        ).exists(),
      ).toBe(true);
    }
  },
  INTEGRATION_TIMEOUT_MS,
);

test("hook registration never overwrites existing settings without explicit adoption", async () => {
  const current = await workspace();
  const path = join(current.target, ".claude/settings.json");
  await Bun.write(path, '{"existing":true}');
  await expect(init(current)).rejects.toThrow("adopted: true");
  expect(await Bun.file(path).text()).toBe('{"existing":true}');
  await Bun.write(
    current.planPath,
    JSON.stringify({
      ...current.plan,
      files: [
        ...current.plan.files,
        {
          path: ".claude/settings.json",
          content: '{"existing":true}',
          adopted: true,
          parts: ["checks"],
        },
      ],
    }),
  );
  await init(current);
  expect((await Bun.file(path).json()).existing).toBe(true);
});

test.each(["seed", "owner"])(
  "hook registration refuses %s mode",
  async (mode) => {
    const current = await workspace();
    await Bun.write(
      current.planPath,
      JSON.stringify({
        ...current.plan,
        files: [
          ...current.plan.files,
          {
            path: ".claude/settings.json",
            content: "{}",
            mode,
            parts: ["checks"],
          },
        ],
      }),
    );
    await expect(init(current)).rejects.toThrow("managed mode");
  },
);

test("hook registration refuses symlink and case-colliding plan entries", async () => {
  const current = await workspace();
  await Bun.write(
    current.planPath,
    JSON.stringify({
      ...current.plan,
      symlinks: [
        {
          path: ".codex/hooks.json",
          target: "../AGENTS.md",
          parts: ["checks"],
        },
      ],
    }),
  );
  await expect(init(current)).rejects.toThrow("planned symlink");
  await Bun.write(
    current.planPath,
    JSON.stringify({
      ...current.plan,
      files: [
        ...current.plan.files,
        { path: ".CLAUDE/settings.json", content: "{}", parts: ["checks"] },
      ],
    }),
  );
  await expect(init(current)).rejects.toThrow("conflicts with");
  await Bun.write(current.planPath, JSON.stringify(current.plan));
  const outside = join(current.directory, "outside.json");
  await Bun.write(outside, "{}");
  await Bun.write(join(current.target, ".claude/placeholder"), "");
  await symlink(outside, join(current.target, ".claude/settings.json"));
  await expect(init(current)).rejects.toThrow("regular file");
  expect(await Bun.file(outside).text()).toBe("{}");
});
