import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  cp,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanCodeRules, changedFiles } from "../src/code-rules.ts";
import { learnNew, learnTest } from "../src/learn.ts";
import { init } from "../src/apply.ts";
import { hook } from "../src/hooks.ts";
import { approveRules } from "../src/rule-trust.ts";
import { getRuleSources } from "../src/rule-sources.ts";
import { INTEGRATION_TIMEOUT_MS } from "./constants.ts";

const root = join(import.meta.dir, "..");
const directories: string[] = [];
const plan = join(import.meta.dir, "fixtures/plan.json");

const originalHome = process.env.HOME;
const originalProfile = process.env.USERPROFILE;
const originalAppdata = process.env.APPDATA;
beforeEach(async () => {
  const home = await mkdtemp(join(tmpdir(), "code-rules-home-"));
  directories.push(home);
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.APPDATA = join(home, "AppData");
});
afterEach(async () => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalProfile;
  if (originalAppdata === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = originalAppdata;
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function git(directory: string, ...args: string[]) {
  const result = Bun.spawnSync(["git", "-C", directory, ...args]);
  expect(result.exitCode, result.stderr?.toString()).toBe(0);
}

async function workspace(withHarness = true) {
  const target = await mkdtemp(join(tmpdir(), "code-rules-test-"));
  directories.push(target);
  if (withHarness)
    await init({
      packName: "coding",
      planPath: plan,
      target,
      overlay: join(target, "empty-overlay"),
    });
  await mkdir(join(target, "src"), { recursive: true });
  await writeFile(
    join(target, "src/tracked.ts"),
    "export const original = true;\n",
  );
  git(target, "init", "-q");
  git(target, "add", ".");
  git(
    target,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    "Synthetic baseline",
  );
  await writeFile(
    join(target, "src/tracked.ts"),
    "export const BANNED = true;\n",
  );
  await writeFile(
    join(target, "src/untracked.ts"),
    "export const CAUTION = true;\n",
  );
  await writeFile(
    join(target, "src/ignored.ts"),
    "export const CAUTION = true;\n",
  );
  await mkdir(join(target, "nested"));
  return target;
}

const errorRule = `id: synthetic-error\nlanguage: TypeScript\nseverity: error\nmessage: banned identifier\nfiles:\n  - src/**/*.ts\nrule:\n  pattern: BANNED\n`;
const warningRule = `id: synthetic-warning\nlanguage: TypeScript\nseverity: warning\nmessage: caution identifier\nfiles:\n  - src/**/*.ts\nignores:\n  - src/ignored.ts\nrule:\n  pattern: CAUTION\n`;

test(
  "scans changed and untracked files with harness-root globs and separates warning from error",
  async () => {
    const target = await workspace();
    await mkdir(join(target, ".harness/rules/code"), { recursive: true });
    await writeFile(join(target, ".harness/rules/code/error.yml"), errorRule);
    await writeFile(
      join(target, ".harness/rules/code/warning.yml"),
      warningRule,
    );
    await approveRules(target);
    const options = {
      overlay: join(target, "empty-overlay"),
      packageRoot: root,
    };
    expect(
      (await getRuleSources(target, options)).sources.at(-1)?.codeRules,
    ).toHaveLength(2);
    expect(await changedFiles(join(target, "nested"))).toEqual([
      ".harness/rules/code/error.yml",
      ".harness/rules/code/warning.yml",
      "src/ignored.ts",
      "src/tracked.ts",
      "src/untracked.ts",
    ]);
    const report = await scanCodeRules(join(target, "nested"), options);
    expect(report.failures).toEqual([]);
    expect(report.errors).toEqual([
      expect.stringContaining("banned identifier [synthetic-error]"),
    ]);
    expect(report.messages).toEqual([
      expect.stringContaining("caution identifier [synthetic-warning]"),
    ]);
    await writeFile(
      join(target, ".harness/rules/code/invalid-glob.yml"),
      "id: synthetic-invalid-glob\nlanguage: TypeScript\nseverity: error\nfiles: invalid\nrule:\n  pattern: BANNED\n",
    );
    await approveRules(target);
    const invalidGlob = await scanCodeRules(target, options);
    expect(invalidGlob.failures).toContainEqual(
      expect.stringContaining("files must be an array"),
    );
    expect(invalidGlob.errors).toContainEqual(
      expect.stringContaining("synthetic-error"),
    );
    expect(invalidGlob.errors).not.toContainEqual(
      expect.stringContaining("synthetic-invalid-glob"),
    );
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "Stop reports warnings, blocks errors, and fails open while continuing after an invalid rule",
  async () => {
    const target = await workspace();
    const rules = join(target, ".harness/rules/code");
    await mkdir(rules, { recursive: true });
    await writeFile(join(rules, "error.yml"), errorRule);
    await writeFile(join(rules, "warning.yml"), warningRule);
    await approveRules(target);
    const options = {
      overlay: join(target, "empty-overlay"),
      packageRoot: root,
    };
    const event = { cwd: target };
    await writeFile(
      join(target, "src/tracked.ts"),
      "export const CAUTION = true;\n",
    );
    const warning = await hook("stop", event, options);
    expect(warning.output).toEqual({});
    expect(warning.errors).toContainEqual(expect.stringContaining("Warning:"));

    await writeFile(
      join(target, "src/tracked.ts"),
      "export const BANNED = true;\n",
    );
    const blocked = await hook("stop", event, options);
    expect(blocked.output).toMatchObject({ decision: "block" });

    await writeFile(join(rules, "broken.yml"), "not: [a valid rule\n");
    await writeFile(
      join(target, "src/tracked.ts"),
      "export const safe = true;\n",
    );
    await approveRules(target);
    const failingOpen = await hook("stop", event, options);
    expect(failingOpen.output).toEqual({});
    expect(failingOpen.errors).toContainEqual(
      expect.stringContaining("broken.yml"),
    );
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "learn scaffolds command and code rule fixtures and runs all cases in scope",
  async () => {
    const target = await workspace();
    const options = {
      scope: "harness" as const,
      target,
      overlay: join(target, "empty-overlay"),
      packageRoot: root,
    };
    const commandPaths = await learnNew("command", "sample-command", options);
    const codePaths = await learnNew("code", "sample-code", options);
    expect(commandPaths).toHaveLength(2);
    expect(codePaths).toHaveLength(2);
    expect(await Bun.file(commandPaths[1]!).json()).toMatchObject({
      ruleId: "sample-command",
      cases: [
        { inputShape: "claude", expected: "block" },
        { inputShape: "claude", expected: null },
        { inputShape: "codex", expected: "block" },
        { inputShape: "codex", expected: null },
      ],
    });
    const report = await learnTest(options);
    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(6);
    await unlink(codePaths[1]!);
    expect((await learnTest(options)).failures).toContainEqual(
      expect.stringContaining("sample-code has no fixture"),
    );
    await expect(
      learnNew("command", "sample-command", options),
    ).rejects.toThrow("refusing to overwrite");

    await writeFile(
      codePaths[1]!,
      "id: sample-code\nvalid:\n  - const ready = true\ninvalid:\n  - TODO\n",
    );
    await mkdir(join(target, ".harness/rules/code"), { recursive: true });
    await mkdir(join(target, ".harness/rule-tests"), { recursive: true });
    await writeFile(
      join(target, ".harness/rules/code/rust.yml"),
      "id: rust-sample\nlanguage: Rust\nseverity: warning\nmessage: TODO\nrule:\n  pattern: TODO\n",
    );
    await writeFile(
      join(target, ".harness/rule-tests/rust-test.yml"),
      "id: rust-sample\nvalid:\n  - fn main() {}\ninvalid:\n  - fn main() { let TODO = 1; }\n",
    );
    const rustReport = await learnTest(options);
    expect(rustReport.failures).toEqual([]);
    expect(rustReport.passed).toBe(8);
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "learn refuses to write through a symlinked harness rule directory",
  async () => {
    const target = await workspace();
    const outside = join(target, "outside-rules");
    await mkdir(outside);
    await symlink(outside, join(target, ".harness/rules"), "junction");
    await expect(
      learnNew("command", "symlink-test", {
        scope: "harness",
        target,
        overlay: join(target, "empty-overlay"),
        packageRoot: root,
      }),
    ).rejects.toThrow(/symlink or non-directory parent/);
    expect(
      await Bun.file(join(outside, "command/symlink-test.ts")).exists(),
    ).toBe(false);
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "learn creates an overlay pack and registers its command and code tests",
  async () => {
    const overlay = join(
      await mkdtemp(join(tmpdir(), "learn-overlay-")),
      "overlay",
    );
    directories.push(overlay);
    const target = await mkdtemp(join(tmpdir(), "learn-no-harness-"));
    directories.push(target);
    const options = {
      scope: "overlay" as const,
      target,
      overlay,
      packageRoot: root,
    };
    await learnNew("command", "overlay-command", options);
    await learnNew("code", "overlay-code", options);
    const report = await learnTest(options);
    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(6);
    const manifest = await Bun.file(
      join(overlay, "personal-rules/pack.json"),
    ).json();
    expect(manifest.commandRules).toEqual(["command-rules/overlay-command.ts"]);
    expect(manifest.codeRules).toEqual(["rules/overlay-code.yml"]);
    expect(manifest.ruleTests).toEqual([
      "rule-tests/overlay-command-command.json",
      "rule-tests/overlay-code-test.yml",
    ]);
    await cp(join(overlay, "personal-rules"), join(overlay, "second-rules"), {
      recursive: true,
    });
    const secondManifestPath = join(overlay, "second-rules/pack.json");
    const secondManifest = await Bun.file(secondManifestPath).json();
    secondManifest.name = "second-rules";
    await Bun.write(
      secondManifestPath,
      JSON.stringify(secondManifest, null, 2),
    );
    const allPacksReport = await learnTest(options);
    expect(allPacksReport.failures).toEqual([]);
    expect(allPacksReport.passed).toBe(12);
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "code-rule scanner uses configured overlay rules without a harness",
  async () => {
    const overlay = join(
      await mkdtemp(join(tmpdir(), "overlay-scan-")),
      "overlay",
    );
    directories.push(overlay);
    const target = await workspace(false);
    const options = {
      scope: "overlay" as const,
      target,
      overlay,
      packageRoot: root,
    };
    await learnNew("code", "overlay-scan", options);
    await writeFile(join(target, "src/tracked.ts"), "const TODO = true;\n");
    const report = await scanCodeRules(target, { overlay, packageRoot: root });
    expect(report.failures).toEqual([]);
    expect(
      report.messages.some((message) => message.includes("overlay-scan")),
    ).toBe(true);
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "learn rejects Windows device-name rule paths on every platform",
  async () => {
    const target = await workspace();
    await expect(
      learnNew("command", "con", {
        scope: "harness",
        target,
        overlay: join(target, "empty-overlay"),
        packageRoot: root,
      }),
    ).rejects.toThrow();
  },
  INTEGRATION_TIMEOUT_MS,
);

test("learn test does not create an overlay pack when the scope is empty", async () => {
  const overlay = join(
    await mkdtemp(join(tmpdir(), "empty-learn-overlay-")),
    "overlay",
  );
  directories.push(overlay);
  await mkdir(overlay, { recursive: true });
  const report = await learnTest({
    scope: "overlay",
    overlay,
    packageRoot: root,
  });
  expect(report.failures).toContain("No rule sources found in scope");
  expect(
    await Bun.file(join(overlay, "personal-rules/pack.json")).exists(),
  ).toBe(false);
});

test(
  "pack-scoped learning records the new rule and fixture in the pack manifest",
  async () => {
    const packageRoot = await mkdtemp(join(tmpdir(), "learn-package-root-"));
    directories.push(packageRoot);
    await mkdir(join(packageRoot, "packs"), { recursive: true });
    await cp(join(root, "packs/coding"), join(packageRoot, "packs/coding"), {
      recursive: true,
    });
    const target = await workspace(false);
    const paths = await learnNew("command", "pack-command", {
      scope: "pack:coding",
      target,
      overlay: join(target, "empty-overlay"),
      packageRoot,
    });
    expect(
      paths.map((path) =>
        path.replaceAll("\\", "/").split("/").slice(-2).join("/"),
      ),
    ).toEqual([
      "command-rules/pack-command.ts",
      "rule-tests/pack-command-command.json",
    ]);
    const manifest = await Bun.file(
      join(packageRoot, "packs/coding/pack.json"),
    ).json();
    expect(manifest.commandRules).toContain("command-rules/pack-command.ts");
    expect(manifest.ruleTests).toContain(
      "rule-tests/pack-command-command.json",
    );
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "changed file discovery handles unborn branches and skips deleted and symlink paths",
  async () => {
    const target = await mkdtemp(join(tmpdir(), "unborn-code-rules-"));
    directories.push(target);
    git(target, "init", "-q");
    await writeFile(join(target, "tracked.ts"), "const base = true;\n");
    git(target, "add", "tracked.ts");
    git(
      target,
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "base",
    );
    await unlink(join(target, "tracked.ts"));
    await symlink(join(target, "outside.ts"), join(target, "linked.ts"));
    await writeFile(join(target, "outside.ts"), "const outside = true;\n");
    const files = await changedFiles(target);
    expect(files).toContain("outside.ts");
    expect(files).not.toContain("tracked.ts");
    expect(files).not.toContain("linked.ts");

    const unborn = await mkdtemp(join(tmpdir(), "unborn-code-rules-"));
    directories.push(unborn);
    git(unborn, "init", "-q");
    await writeFile(join(unborn, "first.ts"), "const first = true;\n");
    expect(await changedFiles(unborn)).toContain("first.ts");
  },
  INTEGRATION_TIMEOUT_MS,
);
