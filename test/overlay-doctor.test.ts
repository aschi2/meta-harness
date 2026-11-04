import { afterEach, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { init, update } from "../src/apply.ts";
import { doctor } from "../src/doctor.ts";
import { getRuleSources, harnessRoot } from "../src/rule-sources.ts";
import {
  overlayDirectory,
  overlayPacks,
  overlayPreferences,
} from "../src/overlay.ts";
import { validate } from "../src/validate.ts";
import { INTEGRATION_TIMEOUT_MS } from "./constants.ts";

const root = join(import.meta.dir, "..");
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function workspace() {
  const directory = await mkdtemp(join(tmpdir(), "meta-overlay-doctor-"));
  directories.push(directory);
  return directory;
}
async function overlay(directory: string, name = "preferences") {
  const packRoot = join(directory, name);
  await Bun.write(join(packRoot, "profile.schema.json"), '{"type":"object"}');
  await Bun.write(
    join(packRoot, "pack.json"),
    JSON.stringify({
      name,
      version: "1.0.0",
      domain: "generic",
      description: "Synthetic overlay",
      overlay: true,
      parts: ["checks"],
      knowledge: [],
      templates: [],
      checkers: [],
      researchTopics: [],
      profileSchema: "profile.schema.json",
      preferences: { profile: { targets: ["codex"] } },
      commandRules: ["command/noop.ts"],
      ruleTests: ["rule-tests/noop.json"],
    }),
  );
  await Bun.write(
    join(packRoot, "command/noop.ts"),
    'export const id="noop"; export function check(){return null;}',
  );
  await Bun.write(join(packRoot, "rule-tests/noop.json"), "[]");
  return packRoot;
}
async function plan(
  path: string,
  profile: Record<string, unknown> = {
    sizeTier: "S",
    languages: [],
    targets: [],
  },
) {
  await Bun.write(
    path,
    JSON.stringify({
      pack: "coding",
      profile,
      files: [
        { path: "AGENTS.md", content: "# Synthetic\n", parts: ["context"] },
      ],
      symlinks: [],
    }),
  );
}

test("overlay overrides environment and supplies validated defaults without copying personal files", async () => {
  const directory = await workspace();
  const overlays = join(directory, "overlay");
  await overlay(overlays);
  expect(overlayDirectory(overlays)).toBe(overlays);
  expect((await overlayPacks(overlays)).length).toBe(1);
  expect(await overlayPreferences(overlays)).toEqual({
    profile: { targets: ["codex"] },
  });
  expect((await validate(overlays)).errors).toEqual([]);
  const planPath = join(directory, "plan.json");
  await plan(planPath, { sizeTier: "S", languages: [] });
  const target = join(directory, "harness");
  await init({ planPath, packName: "coding", target, overlay: overlays });
  const manifest = await Bun.file(
    join(target, ".harness/manifest.json"),
  ).json();
  expect(manifest.profile.targets).toEqual(["codex"]);
  expect(
    manifest.packs.some(
      (pack: { name: string }) => pack.name === "preferences",
    ),
  ).toBe(false);
  expect(await Bun.file(join(target, "command/noop.ts")).exists()).toBe(false);
  await plan(planPath, { sizeTier: "S", languages: [], targets: [] });
  await update({ planPath, target, overlay: overlays });
  expect(
    (await Bun.file(join(target, ".harness/manifest.json")).json()).profile
      .targets,
  ).toEqual([]);
});

test("rules load overlay and manifest packs but skip unapproved local rules", async () => {
  const directory = await workspace();
  const overlays = join(directory, "overlay");
  await overlay(overlays);
  const outside = await getRuleSources(directory, { overlay: overlays });
  expect(outside.target).toBeUndefined();
  expect(outside.sources.map((source) => source.kind)).toEqual(["overlay"]);
  expect(outside.sources[0]?.commandRules[0]).toEndWith(
    join("command", "noop.ts"),
  );
  const target = join(directory, "harness");
  const planPath = join(directory, "plan.json");
  await plan(planPath);
  await init({ planPath, packName: "coding", target, overlay: overlays });
  await Bun.write(
    join(target, ".harness/rules/command/local.ts"),
    'export const id="local"; export const check=()=>null;',
  );
  await mkdir(join(target, "nested"));
  const inside = await getRuleSources(join(target, "nested"), {
    overlay: overlays,
  });
  expect(inside.target).toBe(await harnessRoot(target));
  expect(inside.sources.filter((source) => source.kind === "pack").length).toBe(
    2,
  );
  expect(
    inside.sources.find((source) => source.kind === "harness")?.commandRules,
  ).toEqual([]);
  expect(inside.notices).toContainEqual(
    expect.stringContaining("Unapproved local rule skipped"),
  );
});

test("an empty overlay directory is a valid no-rules configuration", async () => {
  const directory = await workspace();
  expect(await overlayPacks(directory)).toEqual([]);
  expect(
    (await getRuleSources(directory, { overlay: directory })).sources,
  ).toEqual([]);
});

test("overlay rejects unflagged packs and missing declared rule files", async () => {
  const directory = await workspace();
  const packRoot = await overlay(directory);
  const path = join(packRoot, "pack.json");
  const manifest = await Bun.file(path).json();
  await Bun.write(path, JSON.stringify({ ...manifest, overlay: false }));
  await expect(overlayPacks(directory)).rejects.toThrow("overlay: true");
  await Bun.write(
    path,
    JSON.stringify({ ...manifest, commandRules: ["missing.ts"] }),
  );
  await expect(overlayPacks(directory)).rejects.toThrow("missing.ts");
});

test("overlay selection honors environment fallback and defaults remain user-level", () => {
  const original = process.env.META_HARNESS_OVERLAY;
  try {
    process.env.META_HARNESS_OVERLAY = join(tmpdir(), "synthetic-overlay");
    expect(overlayDirectory()).toBe(join(tmpdir(), "synthetic-overlay"));
    expect(overlayDirectory(join(tmpdir(), "override-overlay"))).toBe(
      join(tmpdir(), "override-overlay"),
    );
  } finally {
    if (original === undefined) delete process.env.META_HARNESS_OVERLAY;
    else process.env.META_HARNESS_OVERLAY = original;
  }
});

test("overlay packs cannot be used to generate repository files and rule symlinks fail validation", async () => {
  const directory = await workspace();
  const packRoot = await overlay(
    join(directory, "package", "packs"),
    "synthetic",
  );
  const planPath = join(directory, "plan.json");
  await Bun.write(
    planPath,
    JSON.stringify({ pack: "synthetic", profile: {}, files: [], symlinks: [] }),
  );
  await expect(
    init({
      packName: "synthetic",
      planPath,
      target: join(directory, "target"),
      packageRoot: join(directory, "package"),
      overlay: join(directory, "none"),
    }),
  ).rejects.toThrow("Overlay packs cannot generate");
  const module = join(packRoot, "command/noop.ts");
  await rm(module);
  const outside = join(directory, "outside.ts");
  await Bun.write(
    outside,
    "export const id='noop';export const check=()=>null;",
  );
  await symlink(outside, module);
  expect((await validate(packRoot)).errors.join("\n")).toContain(
    "referenced rule is not a regular file",
  );
});

export async function doctorFixture(directory: string) {
  const packageRoot = join(directory, "package");
  await cp(join(root, "packs"), join(packageRoot, "packs"), {
    recursive: true,
  });
  await cp(join(root, "package.json"), join(packageRoot, "package.json"), {
    recursive: true,
  });
  const target = join(directory, "harness");
  const planPath = join(directory, "plan.json");
  await Bun.write(
    planPath,
    JSON.stringify({
      pack: "coding",
      profile: { sizeTier: "S", languages: [], targets: ["codex"] },
      files: [
        { path: "AGENTS.md", parts: ["context"], content: "short\n" },
        {
          path: "constraints.json",
          parts: ["context"],
          content: "{}",
          mode: "owner",
        },
      ],
      symlinks: [],
    }),
  );
  await init({
    planPath,
    target,
    packName: "coding",
    packageRoot,
    overlay: join(directory, "none"),
  });
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], { cwd: target });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  };
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "core.hooksPath", join(directory, "no-hooks"));
  await Bun.write(join(target, "tracked.txt"), "base\n");
  git("add", "tracked.txt");
  git("commit", "-m", "Base");
  const manifestPath = join(target, ".harness/manifest.json");
  const manifest = await Bun.file(manifestPath).json();
  manifest.packs[1].version = "0.0.1";
  await Bun.write(manifestPath, JSON.stringify(manifest));
  await Bun.write(join(target, "AGENTS.md"), "x".repeat(32769));
  await Bun.write(join(target, "constraints.json"), '{"changed":true}');
  const packPath = join(packageRoot, "packs/coding/pack.json");
  const pack = await Bun.file(packPath).json();
  pack.researchTopics = [{ path: "kb/stale.md", reviewed: "2000-01-01" }];
  pack.checkers = ["checkers/missing.ts"];
  await Bun.write(packPath, JSON.stringify(pack));
  await Bun.write(
    join(dirname(packPath), "kb/stale.md"),
    "---\nreviewed: 2000-01-01\n---\nSynthetic\n",
  );
  await Bun.write(
    join(target, ".harness/maintenance.json"),
    JSON.stringify({
      roles: { "dead-code-remover": { enabled: true, cadence: "0 3 * * *" } },
    }),
  );
  const old = "2000-01-01T00:00:00.000Z";
  await Bun.write(
    join(target, ".harness/maintenance/runs.jsonl"),
    Array.from({ length: 5 }, (_, index) =>
      JSON.stringify({
        role: "dead-code-remover",
        startedAt: old,
        finishedAt: old,
        branch: `maintenance/dead-code-remover/old-${index}`,
        outcome: "published",
        changedLines: 1,
        publish: { exitCode: 0, stdout: "", stderr: "" },
        patchId: "f".repeat(40),
      }),
    ).join("\n") + "\n",
  );
  const configPath = join(directory, "owner.json");
  await Bun.write(
    configPath,
    JSON.stringify({
      agent: [
        "missing-meta-harness-fixture-agent",
        "{prompt_file}",
        "{worktree}",
      ],
    }),
  );
  const overlays = join(directory, "overlay");
  const overlayPack = await overlay(overlays);
  const overlayPath = join(overlayPack, "pack.json");
  const invalid = await Bun.file(overlayPath).json();
  await Bun.write(overlayPath, JSON.stringify({ ...invalid, overlay: false }));
  return { target, packageRoot, configPath, overlay: overlays };
}

test(
  "doctor composes pack versions, stale topics, owner approval, tuning, budgets and environment with fixes",
  async () => {
    const directory = await workspace();
    const fixture = await doctorFixture(directory);
    const report = await doctor(fixture.target, fixture);
    const codes = report.findings.map((finding) => finding.code);
    for (const code of [
      "pack-version",
      "research",
      "owner",
      "maintenance",
      "budget",
      "agent",
      "checker",
      "overlay",
    ])
      expect(codes).toContain(code);
    expect(report.errors.length).toBeGreaterThan(0);
    for (const finding of report.findings.filter(
      (finding) => finding.level !== "info",
    ))
      expect(finding.fix.length).toBeGreaterThan(0);
    expect(
      report.findings.find((finding) => finding.code === "owner")?.fix,
    ).toContain("approve");
    expect(
      report.findings.find((finding) => finding.code === "maintenance")?.fix,
    ).toContain("disable");
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "doctor research threshold is configurable and warnings do not count as errors",
  async () => {
    const directory = await workspace();
    const target = join(directory, "harness");
    const planPath = join(directory, "plan.json");
    await plan(planPath);
    await init({
      planPath,
      target,
      packName: "coding",
      overlay: join(directory, "none"),
    });
    const report = await doctor(target, {
      staleDays: 100000,
      overlay: join(directory, "none"),
      configPath: join(directory, "unconfigured.json"),
    });
    expect(report.errors).toEqual([]);
    expect(report.findings.some((finding) => finding.code === "research")).toBe(
      false,
    );
    expect(
      report.findings.find((finding) => finding.code === "agent")?.level,
    ).toBe("info");
    expect(
      report.findings.find((finding) => finding.code === "agent")?.fix,
    ).toBe("");
    await Bun.write(
      join(target, ".harness/maintenance.json"),
      JSON.stringify({
        roles: { "dead-code-remover": { enabled: true, cadence: "0 3 * * *" } },
      }),
    );
    const enabledReport = await doctor(target, {
      staleDays: 100000,
      overlay: join(directory, "none"),
      configPath: join(directory, "unconfigured.json"),
    });
    expect(
      enabledReport.findings.find((finding) => finding.code === "agent"),
    ).toMatchObject({
      level: "warning",
      fix: expect.stringContaining("<editor>"),
    });
    await Bun.write(
      join(target, ".harness/maintenance.json"),
      JSON.stringify({
        roles: {
          "dead-code-remover": { enabled: false, cadence: "0 3 * * *" },
        },
      }),
    );
    const disabledReport = await doctor(target, {
      staleDays: 100000,
      overlay: join(directory, "none"),
      configPath: join(directory, "unconfigured.json"),
    });
    expect(
      disabledReport.findings.find((finding) => finding.code === "agent"),
    ).toMatchObject({ level: "info", fix: "" });
    await expect(doctor(target, { staleDays: -1 })).rejects.toThrow(
      "stale-days",
    );
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "doctor reports missing git as an error while a resolvable configured agent passes",
  async () => {
    const { spyOn } = await import("bun:test");
    const directory = await workspace();
    const target = join(directory, "harness");
    const planPath = join(directory, "plan.json");
    await plan(planPath);
    await init({
      planPath,
      target,
      packName: "coding",
      overlay: join(directory, "none"),
    });
    const configPath = join(directory, "agent.json");
    await Bun.write(
      configPath,
      JSON.stringify({
        agent: [process.execPath, "{prompt_file}", "{worktree}"],
      }),
    );
    const lookup = Bun.which.bind(Bun);
    const spy = spyOn(Bun, "which").mockImplementation((command, options) =>
      command === "git" ? null : lookup(command, options),
    );
    try {
      const report = await doctor(target, {
        configPath,
        staleDays: 100000,
        overlay: join(directory, "none"),
      });
      expect(report.errors.map((finding) => finding.code)).toEqual(["git"]);
      expect(report.findings.some((finding) => finding.code === "agent")).toBe(
        false,
      );
    } finally {
      spy.mockRestore();
    }
  },
  INTEGRATION_TIMEOUT_MS,
);

test("overlay defaults cannot turn an invalid plan profile into a valid object", async () => {
  const directory = await workspace();
  const overlays = join(directory, "overlay");
  const packRoot = await overlay(overlays);
  const manifestPath = join(packRoot, "pack.json");
  const pack = await Bun.file(manifestPath).json();
  pack.preferences.profile = { sizeTier: "S", languages: [], targets: [] };
  await Bun.write(manifestPath, JSON.stringify(pack));
  const planPath = join(directory, "plan.json");
  await Bun.write(
    planPath,
    JSON.stringify({ pack: "coding", profile: [], files: [], symlinks: [] }),
  );
  await expect(
    init({
      planPath,
      packName: "coding",
      target: join(directory, "target"),
      overlay: overlays,
    }),
  ).rejects.toThrow("profile");
});
