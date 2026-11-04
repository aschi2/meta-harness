import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INTEGRATION_TIMEOUT_MS } from "./constants.ts";

const temporary: string[] = [];
afterEach(async () => {
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true });
});
async function workspace() {
  const home = await mkdtemp(join(tmpdir(), "rule-trust-"));
  temporary.push(home);
  const target = join(home, "repo");
  await mkdir(target);
  return { home, target };
}
function cli(home: string, args: string[], input?: object) {
  const result = Bun.spawnSync(
    [
      process.execPath,
      "--no-env-file",
      `--config=${join(import.meta.dir, "../src/hook.bunfig.toml")}`,
      join(import.meta.dir, "../src/cli.ts"),
      ...args,
    ],
    {
      cwd: home,
      timeout: 15000,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        APPDATA: join(home, "AppData"),
        META_HARNESS_OVERLAY: join(home, "empty-overlay"),
        CODEX_HOME: join(home, ".codex"),
      },
      ...(input ? { stdin: Buffer.from(JSON.stringify(input)) } : {}),
    },
  );
  return {
    code: result.exitCode,
    out: result.stdout.toString(),
    error: result.stderr.toString(),
  };
}
async function harness(home: string, target: string) {
  const plan = join(home, "plan.json");
  await Bun.write(
    plan,
    JSON.stringify({
      pack: "coding",
      profile: { sizeTier: "S", languages: [], targets: [] },
      files: [],
      symlinks: [],
    }),
  );
  const result = cli(home, [
    "init",
    "--pack",
    "coding",
    "--plan",
    plan,
    "--target",
    target,
  ]);
  expect(result.code, result.error).toBe(0);
}

test(
  "CLI skips unapproved TS and YAML rules, approves by external realpath/hash, and revokes changed rules",
  async () => {
    const { home, target } = await workspace();
    await harness(home, target);
    const command = join(target, ".harness/rules/command/local.ts");
    const marker = join(home, "executed");
    await Bun.write(
      command,
      `export const id="local";export function check(){Bun.write(${JSON.stringify(marker)},"ran");return "approved block"}`,
    );
    await Bun.write(
      join(target, ".harness/rules/code/local.yml"),
      "id: local-code\nlanguage: TypeScript\nseverity: error\nmessage: local-code\nrule:\n  pattern: BANNED\n",
    );
    // A repo-owned imitation of the trust store cannot approve anything.
    await Bun.write(
      join(target, ".harness/rule-trust.json"),
      '{"version":1,"repos":{}}',
    );
    const event = {
      cwd: target,
      tool_name: "Bash",
      tool_input: { command: "echo ready" },
    };
    let result = cli(home, ["hook", "pre-tool-use"], event);
    expect(JSON.parse(result.out)).toEqual({});
    expect(result.error).toContain("Unapproved local rule skipped");
    expect(await Bun.file(marker).exists()).toBe(false);
    const stop = cli(home, ["hook", "stop"], { cwd: target });
    expect(stop.error).toContain("local.yml");
    const doctor = cli(home, [
      "doctor",
      "--target",
      target,
      "--stale-days",
      "100000",
    ]);
    expect(doctor.out).toContain("[rules]");
    expect(doctor.out).toContain("approve --rules");
    const approval = cli(home, ["approve", "--rules", "--target", target]);
    expect(approval.code, approval.error).toBe(0);
    expect(approval.out).toContain("Approved 2");
    expect(Bun.spawnSync(["git", "-C", target, "init", "-q"]).exitCode).toBe(0);
    await Bun.write(join(target, "source.ts"), "const BANNED = true;");
    expect(
      JSON.parse(cli(home, ["hook", "stop"], { cwd: target }).out),
    ).toMatchObject({ decision: "block" });
    const other = join(home, "other-repo");
    await mkdir(other);
    await harness(home, other);
    await Bun.write(
      join(other, ".harness/rules/command/local.ts"),
      await Bun.file(command).text(),
    );
    expect(
      JSON.parse(
        cli(home, ["hook", "pre-tool-use"], { ...event, cwd: other }).out,
      ),
    ).toEqual({});
    result = cli(home, ["hook", "pre-tool-use"], event);
    expect(JSON.parse(result.out).hookSpecificOutput.permissionDecision).toBe(
      "deny",
    );
    expect(await Bun.file(marker).exists()).toBe(true);
    const alias = join(home, "alias");
    await symlink(
      target,
      alias,
      process.platform === "win32" ? "junction" : "dir",
    );
    expect(
      JSON.parse(
        cli(home, ["hook", "pre-tool-use"], { ...event, cwd: alias }).out,
      ).hookSpecificOutput.permissionDecision,
    ).toBe("deny");
    await Bun.write(
      command,
      'export const id="local";export const check=()=>"changed rule";',
    );
    result = cli(home, ["hook", "pre-tool-use"], event);
    expect(JSON.parse(result.out)).toEqual({});
    expect(result.error).toContain("Unapproved local rule skipped");
    await Bun.write(
      join(target, ".harness/rules/code/local.yml"),
      "id: changed\nlanguage: TypeScript\nseverity: error\nmessage: changed\nrule:\n  pattern: BANNED\n",
    );
    const changedCode = cli(home, ["hook", "stop"], { cwd: target });
    expect(JSON.parse(changedCode.out)).toEqual({});
    expect(changedCode.error).toContain("local.yml");
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "CLI Stop ignores repository sgconfig even when an overlay code rule runs; native binary needs no postinstall",
  async () => {
    const { home, target } = await workspace();
    const git = Bun.spawnSync(["git", "-C", target, "init", "-q"]);
    expect(git.exitCode).toBe(0);
    await Bun.write(join(target, "a.ts"), "const BANNED = true;");
    await Bun.write(join(target, "sgconfig.yml"), "not: [valid yaml\n");
    const overlay = join(home, "overlay");
    await Bun.write(join(overlay, "profile.json"), '{"type":"object"}');
    await Bun.write(
      join(overlay, "pack.json"),
      JSON.stringify({
        name: "test",
        version: "1.0.0",
        domain: "test",
        description: "test",
        overlay: true,
        parts: ["checks"],
        knowledge: [],
        templates: [],
        checkers: [],
        profileSchema: "profile.json",
        researchTopics: [],
        codeRules: ["rule.yml"],
      }),
    );
    await Bun.write(
      join(overlay, "rule.yml"),
      "id: test-rule\nlanguage: TypeScript\nseverity: error\nmessage: banned\nrule:\n  pattern: BANNED\n",
    );
    const result = cli(home, ["hook", "stop", "--overlay", overlay], {
      cwd: target,
    });
    expect(result.code, result.error).toBe(0);
    expect(JSON.parse(result.out)).toMatchObject({ decision: "block" });
    expect(result.error).not.toContain("postinstall");
    expect(result.error).not.toContain("sgconfig");
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "CLI Stop gates Codex's real global budget on harness targets or overlay opt-in and changed AGENTS only",
  async () => {
    const { home, target } = await workspace();
    expect(Bun.spawnSync(["git", "-C", target, "init", "-q"]).exitCode).toBe(0);
    await Bun.write(join(target, "AGENTS.md"), "x".repeat(32769));
    let result = cli(home, ["hook", "stop"], { cwd: target });
    expect(JSON.parse(result.out)).toEqual({}); // plain repo is not a harness
    await harness(home, target);
    result = cli(home, ["hook", "stop", "--harness", "claude"], {
      cwd: target,
    });
    expect(JSON.parse(result.out)).toEqual({}); // no Codex target
    const manifestPath = join(target, ".harness/manifest.json");
    const manifest = await Bun.file(manifestPath).json();
    manifest.profile.targets = ["claude-code"];
    await Bun.write(manifestPath, JSON.stringify(manifest));
    result = cli(home, ["hook", "stop", "--harness", "claude"], {
      cwd: target,
    });
    expect(JSON.parse(result.out)).toEqual({});
    manifest.profile.targets = ["codex"];
    await Bun.write(manifestPath, JSON.stringify(manifest));
    await Bun.write(join(home, ".codex/AGENTS.md"), "ignored".repeat(10000));
    await Bun.write(join(home, ".codex/AGENTS.override.md"), "g".repeat(20000));
    await Bun.write(join(home, ".claude/CLAUDE.md"), "claude".repeat(10000));
    await Bun.write(join(target, "AGENTS.md"), "x".repeat(12769));
    result = cli(home, ["hook", "stop", "--harness", "claude"], {
      cwd: target,
    });
    expect(JSON.parse(result.out)).toMatchObject({ decision: "block" });
    expect(result.out).toContain("32769/32768");
    for (const args of [
      ["add", "."],
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-qm",
        "baseline",
      ],
    ])
      expect(Bun.spawnSync(["git", "-C", target, ...args]).exitCode).toBe(0);
    await Bun.write(join(target, "CLAUDE.md"), "c".repeat(40000));
    result = cli(home, ["hook", "stop", "--harness", "claude"], {
      cwd: target,
    });
    expect(JSON.parse(result.out)).toEqual({}); // unchanged AGENTS; Claude-only edits do not trigger
    const overlay = join(home, "opt-in");
    await Bun.write(join(overlay, "profile.json"), '{"type":"object"}');
    await Bun.write(
      join(overlay, "pack.json"),
      JSON.stringify({
        name: "opt-in",
        version: "1.0.0",
        domain: "test",
        description: "test",
        overlay: true,
        parts: ["checks"],
        knowledge: [],
        templates: [],
        checkers: [],
        profileSchema: "profile.json",
        researchTopics: [],
        preferences: { instructionBudget: true },
      }),
    );
    await rm(join(target, ".harness"), { recursive: true });
    await Bun.write(join(target, "AGENTS.md"), "y".repeat(12769));
    result = cli(home, ["hook", "stop", "--overlay", overlay], { cwd: target });
    expect(JSON.parse(result.out)).toMatchObject({ decision: "block" });
  },
  INTEGRATION_TIMEOUT_MS,
);

test("ast-grep invokes the platform package binary directly without a postinstall shim or warnings", async () => {
  const { astGrepArgs } = await import("../src/code-rules.ts");
  const argv = astGrepArgs(["--version"]);
  expect(argv[0]).not.toBe(process.execPath);
  expect(argv[0].replaceAll("\\", "/")).toContain(
    `@ast-grep/cli-${process.platform}-${process.arch}`,
  );
  const result = Bun.spawnSync(argv, { timeout: 10000 });
  expect(result.exitCode).toBe(0);
  expect(result.stderr.toString()).toBe("");
  expect(result.stdout.toString()).toContain("ast-grep");
});
