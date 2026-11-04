import { afterEach, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readlink, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { init, update } from "../src/apply.ts";
import { approve } from "../src/approve.ts";
import { check } from "../src/check.ts";
import { hash } from "../src/files.ts";
import { createExecute, maintenanceRun } from "../src/maintenance.ts";
import {
  HARNESS_PARTS,
  parseHarnessManifest,
  parsePlan,
} from "../src/schema.ts";
import { validate } from "../src/validate.ts";
import { INTEGRATION_TIMEOUT_MS } from "./constants.ts";

const root = join(import.meta.dir, "..");
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function workspace() {
  const directory = await mkdtemp(join(tmpdir(), "harness-file-modes-"));
  directories.push(directory);
  const target = join(directory, "target");
  const packageRoot = join(directory, "package");
  for (const path of ["packs/base", "packs/coding", "package.json"]) {
    await cp(join(root, path), join(packageRoot, path), { recursive: true });
  }
  const fixture = parsePlan(
    await Bun.file(join(root, "test/fixtures/plan.json")).json(),
  );
  const plan = {
    pack: "coding",
    profile: fixture.profile,
    files: [
      { path: "AGENTS.md", content: "instructions\n", parts: ["context"] },
      {
        path: "seed.txt",
        content: "seed\n",
        mode: "seed",
        parts: [...HARNESS_PARTS],
      },
      {
        path: "owner.txt",
        content: "owner\n",
        mode: "owner",
        parts: ["context"],
      },
    ],
    symlinks: [
      {
        path: "managed-link",
        target: "AGENTS.md",
        mode: "managed",
        parts: ["context"],
      },
    ],
  };
  const planPath = join(directory, "plan.json");
  const save = () => Bun.write(planPath, JSON.stringify(parsePlan(plan)));
  await save();
  return {
    directory,
    target,
    packageRoot,
    plan,
    planPath,
    save,
    packName: "coding",
  };
}
async function manifest(target: string) {
  return parseHarnessManifest(
    await Bun.file(join(target, ".harness/manifest.json")).json(),
  );
}
async function ownerPaths(
  workspace_: Awaited<ReturnType<typeof workspace>>,
  paths: string[],
) {
  const path = join(workspace_.packageRoot, "packs/coding/pack.json");
  const pack = await Bun.file(path).json();
  pack.ownerPaths = paths;
  await Bun.write(path, JSON.stringify(pack));
}

test("seed edits and deletions are untracked and never overwritten or recreated by update", async () => {
  const current = await workspace();
  await init(current);
  const first = await manifest(current.target);
  expect(first.seedFiles).toEqual(["seed.txt"]);
  expect(first.files["seed.txt"]).toBeUndefined();
  expect(
    await Bun.file(join(current.target, ".harness/baseline/seed.txt")).exists(),
  ).toBe(false);
  for (const part of HARNESS_PARTS)
    expect(first.parts?.[part]).toContain("seed.txt");
  await Bun.write(join(current.target, "seed.txt"), "user seed\n");
  expect((await check(current.target, current.packageRoot)).errors).toEqual([]);
  await update(current);
  expect(await Bun.file(join(current.target, "seed.txt")).text()).toBe(
    "user seed\n",
  );
  await rm(join(current.target, "seed.txt"));
  for (let attempt = 0; attempt < 2; attempt++) {
    await update(current);
    expect(await Bun.file(join(current.target, "seed.txt")).exists()).toBe(
      false,
    );
    expect((await check(current.target, current.packageRoot)).errors).toEqual(
      [],
    );
  }
  current.plan.files.push({
    path: "later.txt",
    content: "later",
    mode: "seed",
    parts: ["knowledge"],
  });
  await current.save();
  await update(current);
  expect(await Bun.file(join(current.target, "later.txt")).exists()).toBe(
    false,
  );
});

test("seed init refuses existing files unless adopted and preserves adopted content", async () => {
  const current = await workspace();
  await Bun.write(join(current.target, "seed.txt"), "existing\n");
  await expect(init(current)).rejects.toThrow("adopted: true");
  current.plan.files = current.plan.files.map((file) =>
    file.path === "seed.txt" ? { ...file, adopted: true } : file,
  );
  await current.save();
  await init(current);
  expect(await Bun.file(join(current.target, "seed.txt")).text()).toBe(
    "existing\n",
  );
});

test("legacy managed edits pass check and report drift while preserving merge baselines", async () => {
  const current = await workspace();
  await init(current);
  expect((await manifest(current.target)).files["AGENTS.md"]).toEqual({
    sha256: hash("instructions\n"),
  });
  await Bun.write(join(current.target, "AGENTS.md"), "owner instructions\n");
  const report = await check(current.target, current.packageRoot);
  expect(report.errors).toEqual([]);
  expect(
    report.messages.some((message) => message.startsWith("Drift: AGENTS.md")),
  ).toBe(true);
  expect(
    await Bun.file(join(current.target, ".harness/baseline/AGENTS.md")).text(),
  ).toBe("instructions\n");
});

test(
  "owner edits fail check until CLI approve records the new hash and baseline",
  async () => {
    const current = await workspace();
    await init(current);
    await Bun.write(join(current.target, "owner.txt"), "approved edit\n");
    expect(
      (await check(current.target, current.packageRoot)).errors.join("\n"),
    ).toContain("Drift: owner.txt");
    const result = Bun.spawnSync([
      process.execPath,
      join(root, "src/cli.ts"),
      "approve",
      "owner.txt",
      "--target",
      current.target,
    ]);
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect((await manifest(current.target)).files["owner.txt"]).toEqual({
      sha256: hash("approved edit\n"),
      mode: "owner",
    });
    expect(
      await Bun.file(
        join(current.target, ".harness/baseline/owner.txt"),
      ).text(),
    ).toBe("approved edit\n");
    expect((await check(current.target, current.packageRoot)).errors).toEqual(
      [],
    );
    await expect(
      approve("AGENTS.md", current.target, current.packageRoot),
    ).rejects.toThrow("only a declared owner");
    await expect(
      approve("seed.txt", current.target, current.packageRoot),
    ).rejects.toThrow("only a declared owner");
    await expect(
      approve("../owner.txt", current.target, current.packageRoot),
    ).rejects.toThrow("relative file path");
  },
  INTEGRATION_TIMEOUT_MS,
);

test.each([false, true])(
  "owner update preserves content and approval even when edited=%s and mode is downgraded",
  async (edited) => {
    const current = await workspace();
    await init(current);
    const before = (await manifest(current.target)).files["owner.txt"];
    const content = edited ? "unapproved owner\n" : "owner\n";
    await Bun.write(join(current.target, "owner.txt"), content);
    current.plan.files = current.plan.files.map((entry) =>
      entry.path === "owner.txt"
        ? {
            path: entry.path,
            content: "replacement\n",
            mode: "seed",
            parts: entry.parts,
          }
        : entry,
    );
    await current.save();
    await update(current);
    expect(await Bun.file(join(current.target, "owner.txt")).text()).toBe(
      content,
    );
    expect((await manifest(current.target)).files["owner.txt"]).toEqual(before);
    expect(
      await Bun.file(
        join(current.target, ".harness/baseline/owner.txt"),
      ).text(),
    ).toBe("owner\n");
    expect(
      (await check(current.target, current.packageRoot)).errors.length,
    ).toBe(edited ? 1 : 0);
    await rm(join(current.target, "owner.txt"));
    await update(current);
    expect(await Bun.file(join(current.target, "owner.txt")).exists()).toBe(
      false,
    );
    expect(
      (await check(current.target, current.packageRoot)).errors.join("\n"),
    ).toContain("Drift: owner.txt");
  },
);

test("approve refuses owner file symlink substitution and symlink parents without changing its manifest", async () => {
  const current = await workspace();
  current.plan.files.push({
    path: "nested/owner.txt",
    content: "nested",
    mode: "owner",
    parts: ["context"],
  });
  await current.save();
  await init(current);
  const before = await Bun.file(
    join(current.target, ".harness/manifest.json"),
  ).text();
  await rm(join(current.target, "owner.txt"));
  await symlink("AGENTS.md", join(current.target, "owner.txt"));
  await expect(
    approve("owner.txt", current.target, current.packageRoot),
  ).rejects.toThrow("regular owner file");
  await rm(join(current.target, "nested"), { recursive: true });
  await symlink(current.directory, join(current.target, "nested"));
  await expect(
    approve("nested/owner.txt", current.target, current.packageRoot),
  ).rejects.toThrow("symlink or non-directory parent");
  expect(
    await Bun.file(join(current.target, ".harness/manifest.json")).text(),
  ).toBe(before);
});

test("seed and owner symlinks obey their modes", async () => {
  const current = await workspace();
  current.plan.files.push({
    path: "nested/target.txt",
    content: "nested target",
    mode: "managed",
    parts: ["context"],
  });
  current.plan.symlinks = [
    {
      path: "seed-link",
      target: "AGENTS.md",
      mode: "seed",
      parts: ["context"],
    },
    {
      path: "owner-link",
      target: "AGENTS.md",
      mode: "owner",
      parts: ["context"],
    },
  ];
  await current.save();
  await init(current);
  for (const path of ["seed-link", "owner-link"]) {
    await rm(join(current.target, path));
    await symlink("nested/target.txt", join(current.target, path));
  }
  await update(current);
  expect(
    (await readlink(join(current.target, "seed-link"))).split(sep).join("/"),
  ).toBe("nested/target.txt");
  expect(
    (await readlink(join(current.target, "owner-link"))).split(sep).join("/"),
  ).toBe("nested/target.txt");
  expect(
    (await check(current.target, current.packageRoot)).errors,
  ).toHaveLength(1);
  await approve("owner-link", current.target, current.packageRoot);
  expect((await manifest(current.target)).files["owner-link"]).toEqual({
    symlink: "nested/target.txt",
    mode: "owner",
  });
  expect((await check(current.target, current.packageRoot)).errors).toEqual([]);
  await rm(join(current.target, "seed-link"));
  await update(current);
  expect((await manifest(current.target)).files["seed-link"]).toBeUndefined();
});

test.each(["managed", "seed"] as const)(
  "pack ownerPaths overrides attempted %s mode",
  async (mode) => {
    const current = await workspace();
    await ownerPaths(current, ["profile.json"]);
    current.plan.files.push({
      path: "profile.json",
      content: "{}\n",
      mode,
      parts: ["context"],
    });
    await current.save();
    await init(current);
    expect((await manifest(current.target)).files["profile.json"]?.mode).toBe(
      "owner",
    );
    await Bun.write(join(current.target, "profile.json"), '{"changed":true}\n');
    await update(current);
    expect(await Bun.file(join(current.target, "profile.json")).text()).toBe(
      '{"changed":true}\n',
    );
    expect(
      (await check(current.target, current.packageRoot)).errors.join("\n"),
    ).toContain("Drift: profile.json");
    await approve("profile.json", current.target, current.packageRoot);
    expect((await check(current.target, current.packageRoot)).errors).toEqual(
      [],
    );
  },
);

test("parts accept seed membership but reject overlapping or absent membership", async () => {
  const current = await workspace();
  await init(current);
  const state = await manifest(current.target);
  expect(() =>
    parseHarnessManifest({ ...state, seedFiles: ["owner.txt"] }),
  ).toThrow("both files and seedFiles");
  expect(() => parseHarnessManifest({ ...state, seedFiles: [] })).toThrow(
    "absent from files and seedFiles",
  );
});

test(
  "maintenance protects pack owner paths even under a general purpose role",
  async () => {
    const current = await workspace();
    await ownerPaths(current, ["profile.json"]);
    await init(current);
    const git = (...args: string[]) => {
      const result = Bun.spawnSync(["git", ...args], { cwd: current.target });
      if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    };
    git("init", "-b", "main");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.invalid");
    git("config", "commit.gpgsign", "false");
    git("config", "core.hooksPath", join(current.directory, "no-hooks"));
    await Bun.write(join(current.target, "profile.json"), "{}\n");
    git("add", ".");
    git("commit", "-m", "Fixture");
    const configPath = join(current.directory, "maintenance.json");
    await Bun.write(
      configPath,
      JSON.stringify({ agent: ["test-agent", "{prompt_file}", "{worktree}"] }),
    );
    const execute = createExecute();
    const result = await maintenanceRun(
      current.target,
      "dead-code-remover",
      true,
      {
        packageRoot: current.packageRoot,
        configPath,
        execute: async (argv, cwd, options) => {
          if (argv[0] !== "test-agent") return execute(argv, cwd, options);
          await Bun.write(join(cwd, "profile.json"), '{"agent":true}\n');
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      },
    );
    expect(result.outcome).toBe("failed");
    expect(result.error).toContain(
      "Protected path cannot be changed: profile.json",
    );
    expect(await Bun.file(join(current.target, "profile.json")).text()).toBe(
      "{}\n",
    );
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "cjs, mts and tsx checkers run through Bun without executable permissions",
  async () => {
    const current = await workspace();
    await init(current);
    const packRoot = join(current.packageRoot, "packs/coding");
    const path = join(packRoot, "pack.json");
    const pack = await Bun.file(path).json();
    pack.checkers = [
      "checkers/test.cjs",
      "checkers/test.mts",
      "checkers/test.tsx",
    ];
    await Bun.write(path, JSON.stringify(pack));
    for (const checker of pack.checkers)
      await Bun.write(
        join(packRoot, checker),
        `process.stdout.write(${JSON.stringify(checker)});`,
      );
    const report = await check(current.target, current.packageRoot);
    expect(report.errors).toEqual([]);
    for (const checker of pack.checkers)
      expect(report.messages).toContain(checker);
  },
  INTEGRATION_TIMEOUT_MS,
);

test.each(["final", "parent"])(
  "validate and check refuse checker %s symlinks and continue to the next checker",
  async (kind) => {
    const current = await workspace();
    await init(current);
    const packRoot = join(current.packageRoot, "packs/coding");
    const path = join(packRoot, "pack.json");
    const pack = await Bun.file(path).json();
    pack.checkers = ["unsafe/check.ts", "checkers/next.ts"];
    await Bun.write(path, JSON.stringify(pack));
    const outside = join(current.directory, "outside");
    await mkdir(outside);
    await Bun.write(
      join(outside, "check.ts"),
      'process.stdout.write("unsafe checker ran");',
    );
    await Bun.write(
      join(packRoot, "checkers/next.ts"),
      'process.stdout.write("next checker ran");',
    );
    if (kind === "parent") await symlink(outside, join(packRoot, "unsafe"));
    else {
      await mkdir(join(packRoot, "unsafe"));
      await symlink(
        join(outside, "check.ts"),
        join(packRoot, "unsafe/check.ts"),
      );
    }
    expect((await validate(packRoot)).errors.length).toBeGreaterThan(0);
    const report = await check(current.target, current.packageRoot);
    expect(
      report.errors.some((error) => error.includes("unsafe/check.ts")),
    ).toBe(true);
    expect(report.messages).not.toContain("unsafe checker ran");
    expect(report.messages).toContain("next checker ran");
  },
  INTEGRATION_TIMEOUT_MS,
);
