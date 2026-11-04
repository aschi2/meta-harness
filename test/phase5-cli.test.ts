import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INTEGRATION_TIMEOUT_MS } from "./constants.ts";

const root = join(import.meta.dir, "..");
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function workspace() {
  const directory = await mkdtemp(join(tmpdir(), "phase5-cli-"));
  directories.push(directory);
  return directory;
}
function cli(directory: string, args: string[], input?: string) {
  const result = Bun.spawnSync(
    [process.execPath, join(root, "src/cli.ts"), ...args],
    {
      cwd: directory,
      env: {
        ...process.env,
        HOME: directory,
        USERPROFILE: directory,
        APPDATA: join(directory, "AppData"),
        META_HARNESS_OVERLAY: join(directory, "overlay"),
        CODEX_HOME: join(directory, ".codex"),
        CLAUDE_CONFIG_DIR: join(directory, ".claude"),
      },
      ...(input === undefined
        ? {}
        : { stdin: new TextEncoder().encode(input) }),
    },
  );
  return {
    code: result.exitCode,
    out: result.stdout.toString(),
    error: result.stderr.toString(),
  };
}

test(
  "hook CLI fails open and loud on malformed stdin and accepts both event entry points",
  async () => {
    const directory = await workspace();
    for (const event of ["pre-tool-use", "stop"]) {
      const result = cli(directory, ["hook", event], "not JSON");
      expect(result.code).toBe(0);
      expect(JSON.parse(result.out)).toEqual({});
      expect(result.error).toContain(event);
    }
    const stop = cli(
      directory,
      ["hook", "stop", "--harness", "claude"],
      JSON.stringify({ stop_hook_active: true, cwd: directory }),
    );
    expect(stop.code).toBe(0);
    expect(JSON.parse(stop.out)).toEqual({});
    const pre = cli(
      directory,
      ["hook", "pre-tool-use", "--harness", "codex"],
      JSON.stringify({
        tool_name: "exec_command",
        cwd: directory,
        tool_input: { cmd: "echo ready", workdir: directory },
      }),
    );
    expect(pre.code, pre.error).toBe(0);
    expect(JSON.parse(pre.out)).toEqual({});
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "learn CLI scaffolds and tests overlay rules and rejects invalid scopes",
  async () => {
    const directory = await workspace();
    const created = cli(directory, [
      "learn",
      "new",
      "command",
      "example",
      "--scope",
      "overlay",
    ]);
    expect(created.code, created.error).toBe(0);
    expect(created.out).toContain("example.ts");
    const overlayPath = join(directory, "overlay");
    const validation = cli(directory, ["validate", "--overlay", overlayPath]);
    expect(validation.code, validation.error).toBe(0);
    expect(validation.out).toContain("Validated 1 overlay pack(s).");
    const manifestPath = join(overlayPath, "personal-rules/pack.json");
    const manifest = await Bun.file(manifestPath).json();
    await Bun.write(
      manifestPath,
      JSON.stringify({ ...manifest, overlay: false }),
    );
    const invalidOverlay = cli(directory, [
      "validate",
      "--overlay",
      overlayPath,
    ]);
    expect(invalidOverlay.code).toBe(1);
    expect(invalidOverlay.error).toContain("overlay: true");
    await Bun.write(manifestPath, JSON.stringify(manifest));
    const checked = cli(directory, ["learn", "test", "--scope", "overlay"]);
    expect(checked.code, checked.error).toBe(0);
    expect(checked.out).toContain("0 failed");
    const bad = cli(directory, ["learn", "test", "--scope", "elsewhere"]);
    expect(bad.code).toBe(1);
    expect(bad.error).toContain("scope:");
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "overlay CLI dry-run writes no user settings and doctor warnings exit zero",
  async () => {
    const directory = await workspace();
    const install = cli(directory, ["overlay", "install", "--dry-run"]);
    expect(install.code, install.error).toBe(0);
    expect(install.out).toContain("Dry run");
    expect(
      await Bun.file(join(directory, ".claude/settings.json")).exists(),
    ).toBe(false);
    expect(await Bun.file(join(directory, ".codex/hooks.json")).exists()).toBe(
      false,
    );
    const plan = join(directory, "plan.json");
    await Bun.write(
      plan,
      JSON.stringify({
        pack: "coding",
        profile: { sizeTier: "S", languages: [], targets: [] },
        files: [],
        symlinks: [],
      }),
    );
    const init = cli(directory, [
      "init",
      "--pack",
      "coding",
      "--plan",
      plan,
      "--target",
      directory,
    ]);
    expect(init.code, init.error).toBe(0);
    const report = cli(directory, [
      "doctor",
      "--target",
      directory,
      "--stale-days",
      "100000",
    ]);
    expect(report.code, report.error).toBe(0);
    expect(report.out).toContain("0 error(s)");
    expect(report.out).toContain("Fix:");
    const invalid = cli(directory, [
      "doctor",
      "--target",
      directory,
      "--stale-days",
      "NaN",
    ]);
    expect(invalid.code).toBe(1);
    expect(invalid.error).toContain("stale-days");
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "hook CLI reports an erroring rule on stderr without denying or hiding a valid rule",
  async () => {
    const directory = await workspace();
    const pack = join(directory, "overlay", "synthetic");
    await Bun.write(join(pack, "profile.schema.json"), '{"type":"object"}');
    const manifest = {
      name: "synthetic",
      version: "1.0.0",
      domain: "synthetic",
      description: "Synthetic",
      overlay: true,
      parts: ["checks"],
      knowledge: [],
      templates: [],
      checkers: [],
      profileSchema: "profile.schema.json",
      researchTopics: [],
      commandRules: ["broken.ts"],
    };
    await Bun.write(join(pack, "pack.json"), JSON.stringify(manifest));
    await Bun.write(
      join(pack, "broken.ts"),
      'export const id="broken";export const check=()=>{throw new Error("synthetic failure")};',
    );
    const event = JSON.stringify({
      tool_name: "Bash",
      cwd: directory,
      tool_input: { command: "echo ready" },
    });
    const open = cli(directory, ["hook", "pre-tool-use"], event);
    expect(open.code).toBe(0);
    expect(JSON.parse(open.out)).toEqual({});
    expect(open.error).toContain("synthetic failure");
    await Bun.write(
      join(pack, "valid.ts"),
      'export const id="valid";export const check=()=>"legitimate block";',
    );
    await Bun.write(
      join(pack, "pack.json"),
      JSON.stringify({ ...manifest, commandRules: ["broken.ts", "valid.ts"] }),
    );
    const blocked = cli(directory, ["hook", "pre-tool-use"], event);
    expect(blocked.code).toBe(0);
    expect(
      JSON.parse(blocked.out).hookSpecificOutput.permissionDecisionReason,
    ).toBe("legitimate block");
    expect(blocked.error).toContain("synthetic failure");
  },
  INTEGRATION_TIMEOUT_MS,
);
