import { afterEach, expect, test } from "bun:test";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check } from "../src/check.ts";
import { init, update } from "../src/apply.ts";
import { applyWrites, hash, symlinkDestination } from "../src/files.ts";

import { INTEGRATION_TIMEOUT_MS } from "./constants.ts";
const root = join(import.meta.dir, "..");
const cli = join(root, "src/cli.ts");
const fixture = await Bun.file(
  join(import.meta.dir, "fixtures/plan.json"),
).json();
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function workspace() {
  const directory = await mkdtemp(join(tmpdir(), "meta-harness-review-"));
  directories.push(directory);
  const target = join(directory, "target");
  const planPath = join(directory, "plan.json");
  const plan = structuredClone(fixture);
  await Bun.write(planPath, JSON.stringify(plan));
  return { directory, target, planPath, plan };
}
async function initialized() {
  const workspace_ = await workspace();
  await init({ ...workspace_, packName: "coding" });
  return workspace_;
}
function run(
  directory: string,
  args: string[],
  environment: Record<string, string> = {},
) {
  const result = Bun.spawnSync([process.execPath, cli, ...args], {
    cwd: root,
    env: {
      ...process.env,
      CODEX_HOME: join(directory, "global"),
      ...environment,
    },
  });
  return {
    exitCode: result.exitCode,
    output: result.stdout.toString() + result.stderr.toString(),
  };
}
async function savePlan(workspace_: Awaited<ReturnType<typeof workspace>>) {
  await Bun.write(workspace_.planPath, JSON.stringify(workspace_.plan));
}
async function packageCopy(directory: string) {
  const packageRoot = join(directory, "package");
  await cp(join(root, "packs/coding"), join(packageRoot, "packs/coding"), {
    recursive: true,
  });
  await cp(join(root, "packs/base"), join(packageRoot, "packs/base"), {
    recursive: true,
  });
  await cp(join(root, ".claude-plugin"), join(packageRoot, ".claude-plugin"), {
    recursive: true,
  });
  return packageRoot;
}

test.each([
  ".GIT/config",
  ".HARNESS/baseline/AGENTS.md",
  "nested/.GiT/config",
  "nested/.HaRnEsS/manifest.json",
])(
  "reserved path segments reject %s before writing",
  async (path) => {
    const workspace_ = await workspace();
    Bun.spawnSync(["git", "init", "-q", workspace_.target]);
    const configPath = join(workspace_.target, ".git/config");
    const original = await Bun.file(configPath).text();
    workspace_.plan.files.push({
      path,
      content: "unsafe\n",
      parts: ["context"],
      adopted: true,
    });
    await savePlan(workspace_);
    await expect(init({ ...workspace_, packName: "coding" })).rejects.toThrow();
    expect(await Bun.file(configPath).text()).toBe(original);
    expect(
      await Bun.file(
        join(workspace_.target, ".harness/manifest.json"),
      ).exists(),
    ).toBe(false);
    expect(() => symlinkDestination(workspace_.target, "link", path)).toThrow(
      "reserved",
    );
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "nested symlink targets use manifest paths through init, check and update",
  async () => {
    const workspace_ = await workspace();
    workspace_.plan.files.push({
      path: "docs/AGENTS.md",
      content: "Nested instructions\n",
      parts: ["context"],
    });
    workspace_.plan.symlinks = [
      { path: "CLAUDE.md", target: "docs/AGENTS.md", parts: ["context"] },
      { path: "docs/CLAUDE.md", target: "AGENTS.md", parts: ["context"] },
      { path: "docs/linked.md", target: "../CLAUDE.md", parts: ["context"] },
    ];
    await savePlan(workspace_);
    expect(
      symlinkDestination(workspace_.target, "CLAUDE.md", "docs/AGENTS.md"),
    ).toBe("docs/AGENTS.md");
    await init({ ...workspace_, packName: "coding" });
    expect(await Bun.file(join(workspace_.target, "CLAUDE.md")).text()).toBe(
      "Nested instructions\n",
    );
    const manifest = await Bun.file(
      join(workspace_.target, ".harness/manifest.json"),
    ).json();
    expect(manifest.files["CLAUDE.md"]).toEqual({ symlink: "docs/AGENTS.md" });
    expect((await check(workspace_.target)).errors).toEqual([]);
    expect((await update(workspace_)).conflicts).toEqual([]);
    expect((await check(workspace_.target)).errors).toEqual([]);
  },
  INTEGRATION_TIMEOUT_MS,
);

test.each(['pytest -k "not slow"', "echo {{x}}", "echo C:\\tools\nnext line"])(
  "JSON templates escape and preserve literal variable %s",
  async (value) => {
    const workspace_ = await workspace();
    workspace_.plan.files[2].variables.test_command = value;
    await savePlan(workspace_);
    await init({ ...workspace_, packName: "coding" });
    const settings = await Bun.file(
      join(workspace_.target, ".claude/settings.json"),
    ).json();
    expect(settings.permissions.allow[0]).toBe(`Bash(${value}*)`);
    expect((await check(workspace_.target)).errors).toEqual([]);
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "check rejects managed invalid JSON even when its recorded hash matches",
  async () => {
    const { target } = await initialized();
    const path = ".claude/settings.json";
    const content = '{"invalid":';
    await Bun.write(join(target, path), content);
    const manifestPath = join(target, ".harness/manifest.json");
    const manifest = await Bun.file(manifestPath).json();
    manifest.files[path].sha256 = hash(content);
    await Bun.write(manifestPath, JSON.stringify(manifest));
    const report = await check(target);
    expect(
      report.errors.some((error) =>
        error.includes("Invalid JSON: .claude/settings.json"),
      ),
    ).toBe(true);
    expect(report.errors.some((error) => error.startsWith("Drift:"))).toBe(
      false,
    );
  },
  INTEGRATION_TIMEOUT_MS,
);

test.each([false, true])(
  "missing baseline is isolated when user-edited=%s",
  async (edited) => {
    const workspace_ = await initialized();
    const { target, plan } = workspace_;
    const path = join(target, "docs/guide.md");
    await rm(join(target, ".harness/baseline/docs/guide.md"));
    if (edited) await Bun.write(path, "User guide\n");
    plan.files[0].content = "New instructions\n";
    plan.files[1].content = "New guide\n";
    await savePlan(workspace_);
    const report = await update(workspace_);
    expect(await Bun.file(join(target, "AGENTS.md")).text()).toBe(
      "New instructions\n",
    );
    expect(report.conflicts).toEqual(edited ? ["docs/guide.md"] : []);
    expect(await Bun.file(path).text()).toBe(
      edited ? "User guide\n" : "New guide\n",
    );
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "resolved merge conflicts survive rerunning the same plan",
  async () => {
    const workspace_ = await initialized();
    const { target, plan } = workspace_;
    const path = join(target, "AGENTS.md");
    await Bun.write(
      path,
      fixture.files[0].content.replace("bun test\n", "bun run user-tests\n"),
    );
    plan.files[0].content = fixture.files[0].content.replace(
      "bun test\n",
      "bun test --bail\n",
    );
    await savePlan(workspace_);
    expect((await update(workspace_)).conflicts).toEqual(["AGENTS.md"]);
    expect(
      await Bun.file(join(target, ".harness/baseline/AGENTS.md")).text(),
    ).toBe(plan.files[0].content);
    const resolved = fixture.files[0].content.replace(
      "bun test\n",
      "bun run user-tests\nbun test --bail\n",
    );
    await Bun.write(path, resolved);
    expect((await update(workspace_)).conflicts).toEqual([]);
    expect(await Bun.file(path).text()).toBe(resolved);
    expect((await check(target)).errors).toEqual([]);
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "check rejects recorded conflict markers without relying on drift",
  async () => {
    const workspace_ = await workspace();
    workspace_.plan.files[0].content =
      "<<<<<<< user\nuser\n=======\nnew\n>>>>>>> generator\n";
    await savePlan(workspace_);
    await init({ ...workspace_, packName: "coding" });
    const report = await check(workspace_.target);
    expect(report.errors).toContain("Unresolved conflict markers: AGENTS.md");
    expect(report.errors.some((error) => error.startsWith("Drift:"))).toBe(
      false,
    );
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "instruction budgets stop at the real git root through a path alias",
  async () => {
    const workspace_ = await workspace();
    const alias = join(workspace_.directory, "alias");
    const storage = join(workspace_.directory, "storage");
    await mkdir(storage);
    await symlink(storage, alias);
    workspace_.target = join(alias, "repo");
    Bun.spawnSync(["git", "init", "-q", workspace_.target]);
    await Bun.write(join(storage, "AGENTS.md"), "x".repeat(30_000));
    workspace_.plan.profile.targets = ["codex"];
    await savePlan(workspace_);
    await init({ ...workspace_, packName: "coding" });
    expect(await realpath(workspace_.target)).not.toBe(workspace_.target);
    const result = run(workspace_.directory, [
      "check",
      "--target",
      workspace_.target,
    ]);
    expect(result.exitCode, result.output).toBe(0);
    expect(result.output).toContain(
      `codex: ${Buffer.byteLength(fixture.files[0].content)}/32768 bytes`,
    );
  },
  INTEGRATION_TIMEOUT_MS,
);

test.each(["agents.md", "DOCS/guide.md", "docs/child.md/nested"])(
  "plan path case collisions reject %s",
  async (path) => {
    const workspace_ = await workspace();
    if (path.endsWith("nested"))
      workspace_.plan.files.push({
        path: "DOCS/child.md",
        content: "parent",
        parts: ["context"],
      });
    workspace_.plan.files.push({
      path,
      content: "collision",
      parts: ["context"],
    });
    await savePlan(workspace_);
    await expect(init({ ...workspace_, packName: "coding" })).rejects.toThrow(
      /duplicate|overlap/,
    );
    expect(
      await Bun.file(
        join(workspace_.target, ".harness/manifest.json"),
      ).exists(),
    ).toBe(false);
  },
);

test("profile schema upgrades report behind and validate only the update plan", async () => {
  const workspace_ = await initialized();
  const packageRoot = await packageCopy(workspace_.directory);
  const packPath = join(packageRoot, "packs/coding/pack.json");
  const pack = await Bun.file(packPath).json();
  pack.version = "0.3.0";
  await Bun.write(packPath, JSON.stringify(pack));
  const schemaPath = join(packageRoot, "packs/coding/profile.schema.json");
  const schema = await Bun.file(schemaPath).json();
  schema.required.push("newRequirement");
  schema.properties.newRequirement = { type: "string" };
  await Bun.write(schemaPath, JSON.stringify(schema));
  const report = await check(workspace_.target, packageRoot);
  expect(report.errors).toContain(
    "Profile behind pack 0.3.0 (coding): run update",
  );
  await expect(update({ ...workspace_, packageRoot })).rejects.toThrow(
    "newRequirement",
  );
  workspace_.plan.profile.newRequirement = "present";
  await savePlan(workspace_);
  expect((await update({ ...workspace_, packageRoot })).conflicts).toEqual([]);
  expect((await check(workspace_.target, packageRoot)).errors).toEqual([]);
});

test.skipIf(process.platform === "win32").each(["signal", "unexpected exit"])(
  "merge %s writes no partial output",
  async (failure) => {
    const workspace_ = await initialized();
    const path = join(workspace_.target, "AGENTS.md");
    const original = fixture.files[0].content.replace(
      "Original note.",
      "User note.",
    );
    await Bun.write(path, original);
    workspace_.plan.files[0].content = fixture.files[0].content.replace(
      "bun test\n",
      "bun test --bail\n",
    );
    await savePlan(workspace_);
    const manifestPath = join(workspace_.target, ".harness/manifest.json");
    const manifestBefore = await Bun.file(manifestPath).text();
    const executable = join(workspace_.directory, "bin/git");
    await Bun.write(
      executable,
      `#!/bin/sh\nprintf 'partial merge output'\n${failure === "signal" ? "kill -TERM $$" : "exit 128"}\n`,
    );
    await chmod(executable, 0o755);
    const result = run(
      workspace_.directory,
      ["update", "--plan", workspace_.planPath, "--target", workspace_.target],
      { PATH: `${join(workspace_.directory, "bin")}:${process.env.PATH}` },
    );
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("git merge-file failed");
    expect(await Bun.file(path).text()).toBe(original);
    expect(await Bun.file(manifestPath).text()).toBe(manifestBefore);
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "checker EACCES is reported and remaining checkers still run",
  async () => {
    const workspace_ = await initialized();
    const packageRoot = await packageCopy(workspace_.directory);
    const packRoot = join(packageRoot, "packs/coding");
    const path = join(packRoot, "pack.json");
    const pack = await Bun.file(path).json();
    pack.checkers = ["checkers/noexec.sh", "checkers/next.ts"];
    await Bun.write(path, JSON.stringify(pack));
    await Bun.write(
      join(packRoot, "checkers/noexec.sh"),
      "#!/bin/sh\nexit 0\n",
    );
    const executable = join(packRoot, "checkers/next.ts");
    await Bun.write(executable, 'process.stdout.write("next checker ran\\n");');
    await chmod(executable, 0o755);
    const report = await check(workspace_.target, packageRoot);
    expect(
      report.errors.some((error) => error.includes("checkers/noexec.sh")),
    ).toBe(true);
    expect(report.messages).toContain("next checker ran");
  },
  INTEGRATION_TIMEOUT_MS,
);

test.each(["init", "update", "check"])(
  "pending marker gives recovery instructions for %s",
  async (command) => {
    const workspace_ = await initialized();
    const marker = join(workspace_.target, ".harness/pending.json");
    await Bun.write(marker, "");
    const args = [command, "--target", workspace_.target];
    if (command !== "check") args.push("--plan", workspace_.planPath);
    if (command === "init") args.push("--pack", "coding");
    const manifestPath = join(workspace_.target, ".harness/manifest.json");
    const original = await Bun.file(manifestPath).text();
    const result = run(workspace_.directory, args);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Restore");
    expect(result.output).toContain(`rm -- '${marker}'`);
    expect(result.output).toContain(
      `meta-harness check --target '${workspace_.target}'`,
    );
    expect(await Bun.file(manifestPath).text()).toBe(original);
  },
  INTEGRATION_TIMEOUT_MS,
);

test("interrupted apply leaves a plain marker", async () => {
  const { target } = await workspace();
  await mkdir(join(target, "directory"), { recursive: true });
  await expect(
    applyWrites(target, [
      { path: "directory", content: "cannot replace a directory" },
    ]),
  ).rejects.toThrow();
  expect(await Bun.file(join(target, ".harness/pending.json")).exists()).toBe(
    true,
  );
  expect(await readFile(join(target, ".harness/pending.json"), "utf8")).toBe(
    "",
  );
});
