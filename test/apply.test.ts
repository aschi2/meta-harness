import { afterEach, expect, test } from "bun:test";
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { check } from "../src/check.ts";
import {
  compileProfileSchema,
  HarnessManifestSchema,
  PackManifestSchema,
  parseHarnessManifest,
  PlanSchema,
} from "../src/schema.ts";
import { loadPack } from "../src/packs.ts";
import { INTEGRATION_TIMEOUT_MS } from "./constants.ts";

const root = join(import.meta.dir, "..");
const cli = join(root, "src/cli.ts");
const temporaryDirectories: string[] = [];
const fixturePlan = await Bun.file(
  join(import.meta.dir, "fixtures/plan.json"),
).json();

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function workspace() {
  const directory = await mkdtemp(join(tmpdir(), "meta-harness-test-"));
  temporaryDirectories.push(directory);
  const target = join(directory, "target");
  const plan = join(directory, "plan.json");
  await Bun.write(plan, JSON.stringify(fixturePlan));
  return { directory, target, plan };
}
function run(directory: string, ...args: string[]) {
  const result = Bun.spawnSync([process.execPath, cli, ...args], {
    cwd: root,
    env: { ...process.env, CODEX_HOME: join(directory, "codex-home") },
  });
  return {
    exitCode: result.exitCode,
    output: result.stdout.toString() + result.stderr.toString(),
  };
}
async function initialize() {
  const workspace_ = await workspace();
  const result = run(
    workspace_.directory,
    "init",
    "--pack",
    "coding",
    "--plan",
    workspace_.plan,
    "--target",
    workspace_.target,
  );
  expect(result.exitCode, result.output).toBe(0);
  return workspace_;
}
async function changedPlan(
  path: string,
  change: (plan: typeof fixturePlan) => void,
) {
  const plan = structuredClone(fixturePlan);
  change(plan);
  await Bun.write(path, JSON.stringify(plan));
}
async function tree(
  directory: string,
  prefix = "",
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const name of (await readdir(directory)).sort()) {
    const path = join(directory, name);
    const relative = prefix + name;
    const info = await lstat(path);
    if (info.isSymbolicLink())
      result[relative] = { symlink: await readlink(path) };
    else if (info.isDirectory())
      Object.assign(result, await tree(path, `${relative}/`));
    else if (relative === ".harness/manifest.json") {
      const manifest = JSON.parse(await readFile(path, "utf8"));
      manifest.generatedAt = "<timestamp>";
      result[relative] = manifest;
    } else result[relative] = await readFile(path, "utf8");
  }
  return result;
}

test(
  "fixture plan produces the expected tree, baselines, hashes, and symlink",
  async () => {
    const { target } = await initialize();
    expect(await tree(target)).toMatchSnapshot();
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "update replaces unchanged files and merges user edits across repeated updates",
  async () => {
    const { target, plan, directory } = await initialize();
    const instructions = join(target, "AGENTS.md");
    await Bun.write(
      instructions,
      (await Bun.file(instructions).text()).replace(
        "Original note.",
        "User note.",
      ),
    );
    await changedPlan(plan, (plan) => {
      plan.files[0].content = plan.files[0].content.replace(
        "bun test\n",
        "bun test --bail\n",
      );
      plan.files[1].content = "# Updated guide\n";
    });
    const result = run(directory, "update", "--plan", plan, "--target", target);
    expect(result.exitCode, result.output).toBe(0);
    expect(result.output).toContain("Merged AGENTS.md");
    expect(result.output).toContain("Replaced unchanged docs/guide.md");
    expect(await Bun.file(instructions).text()).toContain("User note.");
    expect(await Bun.file(instructions).text()).toContain("bun test --bail");
    expect(await Bun.file(join(target, "docs/guide.md")).text()).toBe(
      "# Updated guide\n",
    );
    expect(run(directory, "check", "--target", target).exitCode).toBe(0);
    expect(
      run(directory, "update", "--plan", plan, "--target", target).exitCode,
    ).toBe(0);
    expect(await Bun.file(instructions).text()).toContain("User note.");
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "update reports a conflict, writes markers, and advances the generator baseline",
  async () => {
    const { target, plan, directory } = await initialize();
    const path = join(target, "AGENTS.md");
    await Bun.write(
      path,
      (await Bun.file(path).text()).replace(
        "bun test\n",
        "bun run user-tests\n",
      ),
    );
    await changedPlan(plan, (plan) => {
      plan.files[0].content = plan.files[0].content.replace(
        "bun test\n",
        "bun test --bail\n",
      );
    });
    const result = run(directory, "update", "--plan", plan, "--target", target);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Unresolved conflicts: AGENTS.md");
    const content = await Bun.file(path).text();
    expect(content).toContain("<<<<<<< current");
    expect(content).toContain("bun run user-tests");
    expect(content).toContain("bun test --bail");
    expect(
      run(directory, "update", "--plan", plan, "--target", target).exitCode,
    ).toBe(1);
    expect(await Bun.file(path).text()).toBe(content);
    expect(
      await Bun.file(join(target, ".harness/baseline/AGENTS.md")).text(),
    ).toBe(
      fixturePlan.files[0].content.replace("bun test\n", "bun test --bail\n"),
    );
    expect(run(directory, "check", "--target", target).exitCode).toBe(1);
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "user-deleted files stay deleted on subsequent updates",
  async () => {
    const { target, plan, directory } = await initialize();
    const path = join(target, "docs/guide.md");
    await rm(path);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = run(
        directory,
        "update",
        "--plan",
        plan,
        "--target",
        target,
      );
      expect(result.exitCode, result.output).toBe(0);
      expect(result.output).toContain("kept absent: docs/guide.md");
      expect(await Bun.file(path).exists()).toBe(false);
    }
    expect(run(directory, "check", "--target", target).exitCode).toBe(0);
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "init refuses existing files until explicitly adopted, without partial writes",
  async () => {
    const { target, plan, directory } = await workspace();
    await Bun.write(join(target, "AGENTS.md"), "Existing\n");
    const result = run(
      directory,
      "init",
      "--pack",
      "coding",
      "--plan",
      plan,
      "--target",
      target,
    );
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("adopted: true");
    expect(
      await Bun.file(join(target, ".harness/manifest.json")).exists(),
    ).toBe(false);
    expect(await Bun.file(join(target, "AGENTS.md")).text()).toBe("Existing\n");
    await changedPlan(plan, (plan) => {
      plan.files[0].adopted = true;
    });
    expect(
      run(
        directory,
        "init",
        "--pack",
        "coding",
        "--plan",
        plan,
        "--target",
        target,
      ).exitCode,
    ).toBe(0);
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "check detects drift and a global plus git-root-to-cwd Codex budget overflow",
  async () => {
    const { target, plan, directory } = await workspace();
    Bun.spawnSync(["git", "init", "-q", directory]);
    await Bun.write(join(directory, "AGENTS.md"), "x".repeat(16_000));
    await Bun.write(join(directory, "codex-home/AGENTS.md"), "x".repeat(1_000));
    await changedPlan(plan, (plan) => {
      plan.profile.targets = ["codex"];
      plan.files[0].content = "x".repeat(16_000);
    });
    expect(
      run(
        directory,
        "init",
        "--pack",
        "coding",
        "--plan",
        plan,
        "--target",
        target,
      ).exitCode,
    ).toBe(0);
    const budget = run(directory, "check", "--target", target);
    expect(budget.exitCode).toBe(1);
    expect(budget.output).toContain("33000/32768 bytes");
    await Bun.write(join(target, "docs/guide.md"), "User edit\n");
    expect(run(directory, "check", "--target", target).output).toContain(
      "Drift: docs/guide.md",
    );
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "check runs a failing pack checker in the target directory and reports its exit",
  async () => {
    const { target, directory } = await initialize();
    const packageRoot = join(directory, "package");
    await cp(join(root, "packs/base"), join(packageRoot, "packs/base"), {
      recursive: true,
    });
    const packRoot = join(packageRoot, "packs/coding");
    const pack = await Bun.file(join(root, "packs/coding/pack.json")).json();
    pack.checkers = ["checkers/fail.ts"];
    await Bun.write(join(packRoot, "pack.json"), JSON.stringify(pack));
    await Bun.write(
      join(packRoot, "profile.schema.json"),
      await Bun.file(join(root, "packs/coding/profile.schema.json")).text(),
    );
    const checker = join(packRoot, "checkers/fail.ts");
    await Bun.write(
      checker,
      'if (!(await Bun.file("AGENTS.md").exists())) process.exit(9); process.stdout.write("checker ran in target\\n"); process.exit(7);',
    );
    await chmod(checker, 0o755);
    const report = await check(target, packageRoot);
    expect(report.errors).toContain("Checker coding/checkers/fail.ts: exit 7");
    expect(report.messages).toContain("checker ran in target");
  },
  INTEGRATION_TIMEOUT_MS,
);

test.each(["robodono", "tummy-tales-app", "blur-splitter"])(
  "real legacy manifest %s validates without losing profile fields",
  async (name) => {
    const input = await Bun.file(
      join(import.meta.dir, "fixtures/legacy", `${name}.json`),
    ).json();
    expect(parseHarnessManifest(input)).toEqual(input);
    const pack = await loadPack("coding");
    expect(pack.profileValidator.Check(input.profile)).toBe(true);
  },
);

test("published schemas match runtime definitions", async () => {
  for (const [name, schema] of Object.entries({
    pack: PackManifestSchema,
    harness: HarnessManifestSchema,
    plan: PlanSchema,
  })) {
    expect(
      await Bun.file(join(root, "schemas", `${name}.schema.json`)).json(),
    ).toEqual(JSON.parse(JSON.stringify(schema)));
  }
  expect(() => compileProfileSchema({ type: "nonsense" })).toThrow(
    "Invalid profile JSON Schema",
  );
});

test(
  "invalid profiles, unsafe parents, and interrupted applies are rejected",
  async () => {
    const { target, plan, directory } = await workspace();
    await changedPlan(plan, (plan) => {
      plan.profile = {};
    });
    expect(
      run(
        directory,
        "init",
        "--pack",
        "coding",
        "--plan",
        plan,
        "--target",
        target,
      ).exitCode,
    ).toBe(1);
    expect(
      await Bun.file(join(target, ".harness/manifest.json")).exists(),
    ).toBe(false);
    await changedPlan(plan, () => {});
    await mkdir(target, { recursive: true });
    await symlink(directory, join(target, "docs"));
    expect(
      run(
        directory,
        "init",
        "--pack",
        "coding",
        "--plan",
        plan,
        "--target",
        target,
      ).output,
    ).toContain("symlink or non-directory parent");
    await rm(join(target, "docs"));
    await Bun.write(join(target, ".harness/pending.json"), "{}");
    expect(run(directory, "check", "--target", target).output).toContain(
      "interrupted apply detected",
    );
  },
  INTEGRATION_TIMEOUT_MS,
);
