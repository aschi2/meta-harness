import { afterEach, expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init, readHarness } from "../src/apply.ts";
import { check } from "../src/check.ts";
import { packRoles } from "../src/roles.ts";
import { validate } from "../src/validate.ts";
import { planCheck } from "../packs/coaching/checkers/plan-check.ts";
import {
  ProfileSchema,
  LibrarySchema,
  PlanSchema,
} from "../packs/coaching/formats.ts";

import { INTEGRATION_TIMEOUT_MS } from "./constants.ts";
const root = join(import.meta.dir, "..");
const fixtures = join(import.meta.dir, "fixtures/coaching");
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function workspace(plan = "passing") {
  const target = await mkdtemp(join(tmpdir(), "coaching-test-"));
  directories.push(target);
  for (const file of ["profile.json", "library.json"])
    await cp(join(fixtures, file), join(target, file));
  await cp(join(fixtures, `${plan}.json`), join(target, "plan.json"));
  return target;
}

test("coaching checker accepts an owner-controlled synthetic one-week plan", async () => {
  expect(await planCheck(await workspace())).toEqual([]);
});
test.each([
  "unknown-item",
  "equipment",
  "excluded-tag",
  "session-duration",
  "weekly-count",
  "input",
])(
  "coaching checker rejects the %s fixture",
  async (rule) => {
    const target = await workspace(rule);
    const findings = await planCheck(target);
    expect(findings.map((finding) => finding.rule)).toContain(rule);
    const result = Bun.spawnSync([
      process.execPath,
      join(root, "packs/coaching/checkers/plan-check.ts"),
      target,
    ]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout.toString()).counts[rule]).toBeGreaterThan(
      0,
    );
  },
  INTEGRATION_TIMEOUT_MS,
);

test("plan tags cannot override the owner's excluded library tags", async () => {
  const target = await workspace("excluded-tag");
  const plan = await Bun.file(join(target, "plan.json")).json();
  plan.sessions[0].items[0].tags = [];
  await Bun.write(join(target, "plan.json"), JSON.stringify(plan));
  expect(await planCheck(target)).toEqual([
    { rule: "input", path: "plan.json" },
  ]);
});

test("coaching rejects malformed inputs, duplicate library IDs, unknown locations and out-of-week dates", async () => {
  const target = await workspace();
  const library = await Bun.file(join(target, "library.json")).json();
  library.items.push(library.items[0]);
  await Bun.write(join(target, "library.json"), JSON.stringify(library));
  expect(await planCheck(target)).toEqual([
    { rule: "input", path: "library.json" },
  ]);
  await cp(join(fixtures, "library.json"), join(target, "library.json"));
  const plan = await Bun.file(join(target, "plan.json")).json();
  plan.sessions[0].location = "unknown";
  await Bun.write(join(target, "plan.json"), JSON.stringify(plan));
  expect((await planCheck(target)).map((finding) => finding.rule)).toContain(
    "equipment",
  );
  plan.sessions[0].location = "toString";
  await Bun.write(join(target, "plan.json"), JSON.stringify(plan));
  expect((await planCheck(target)).map((finding) => finding.rule)).toContain(
    "equipment",
  );
  plan.sessions[0].date = "2026-12-01";
  await Bun.write(join(target, "plan.json"), JSON.stringify(plan));
  expect(await planCheck(target)).toEqual([
    { rule: "input", path: "plan.json" },
  ]);
  await Bun.write(join(target, "profile.json"), "{}");
  expect(await planCheck(target)).toEqual([
    { rule: "input", path: "profile.json" },
  ]);
});

test("precaution prose without owner-approved excluded tags fails closed", async () => {
  const target = await workspace();
  const profile = await Bun.file(join(target, "profile.json")).json();
  profile.precautions[0].excludedTags = [];
  await Bun.write(join(target, "profile.json"), JSON.stringify(profile));
  expect(await planCheck(target)).toEqual([
    { rule: "input", path: "profile.json" },
  ]);
});

test("coaching schemas are generated from the runtime TypeBox source", async () => {
  for (const [name, schema] of Object.entries({
    profile: ProfileSchema,
    library: LibrarySchema,
    plan: PlanSchema,
  }))
    expect(
      await Bun.file(join(root, `packs/coaching/${name}.schema.json`)).json(),
    ).toEqual(schema);
});

test(
  "init builds a full coaching harness and its maintenance role validates",
  async () => {
    const target = await mkdtemp(join(tmpdir(), "coaching-init-"));
    directories.push(target);
    await init({
      packName: "coaching",
      target,
      planPath: join(fixtures, "harness-plan.json"),
    });
    const { manifest, packs } = await readHarness(target);
    expect(manifest.packs?.map((pack) => pack.name)).toEqual([
      "base",
      "coaching",
    ]);
    for (const paths of Object.values(manifest.parts ?? {}))
      expect(paths.length).toBeGreaterThan(0);
    expect((await check(target)).errors).toEqual([]);
    expect(
      (await packRoles(packs)).some(
        (role) => role.id === "weekly-progress-review",
      ),
    ).toBe(true);
    expect((await validate(join(root, "packs/coaching"))).errors).toEqual([]);
  },
  INTEGRATION_TIMEOUT_MS,
);

test.each(["Impact", "impact ", " impact", "high_impact"])(
  "noncanonical tag %s fails in library, profile and inline plan",
  async (tag) => {
    const target = await workspace();
    const library = await Bun.file(join(target, "library.json")).json();
    library.items[2].tags = [tag];
    await Bun.write(join(target, "library.json"), JSON.stringify(library));
    expect(await planCheck(target)).toEqual([
      { rule: "input", path: "library.json" },
    ]);
    await cp(join(fixtures, "library.json"), join(target, "library.json"));
    const profile = await Bun.file(join(target, "profile.json")).json();
    profile.precautions[0].excludedTags = [tag];
    await Bun.write(join(target, "profile.json"), JSON.stringify(profile));
    expect(await planCheck(target)).toEqual([
      { rule: "input", path: "profile.json" },
    ]);
    await cp(join(fixtures, "profile.json"), join(target, "profile.json"));
    const plan = await Bun.file(join(target, "plan.json")).json();
    plan.sessions[0].items[0].tags = [tag];
    await Bun.write(join(target, "plan.json"), JSON.stringify(plan));
    expect(await planCheck(target)).toEqual([
      { rule: "input", path: "plan.json" },
    ]);
  },
);

test("unknown excluded tag fails even when the plan uses no excluded items", async () => {
  const target = await workspace();
  const profile = await Bun.file(join(target, "profile.json")).json();
  profile.precautions[0].excludedTags = ["impakt"];
  await Bun.write(join(target, "profile.json"), JSON.stringify(profile));
  expect(await planCheck(target)).toContainEqual({
    rule: "unknown-excluded-tag",
    path: "profile.json",
  });
});

test(
  "untagged library items warn without failing the plan or CLI",
  async () => {
    const target = await workspace();
    const library = await Bun.file(join(target, "library.json")).json();
    library.items[0].tags = [];
    await Bun.write(join(target, "library.json"), JSON.stringify(library));
    const warnings: import("../packs/coaching/checkers/plan-check.ts").PlanWarning[] =
      [];
    expect(await planCheck(target, warnings)).toEqual([]);
    expect(warnings).toEqual([{ rule: "untagged-item", path: "library.json" }]);
    const result = Bun.spawnSync([
      process.execPath,
      join(root, "packs/coaching/checkers/plan-check.ts"),
      target,
    ]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.toString()).warnings[0].message).toContain(
      "exclusions cannot apply",
    );
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "workflow seeds can change normally while stripped owner library tags require explicit approval",
  async () => {
    const target = await mkdtemp(join(tmpdir(), "coaching-owner-modes-"));
    directories.push(target);
    await init({
      packName: "coaching",
      target,
      planPath: join(fixtures, "harness-plan.json"),
    });
    const plan = await Bun.file(join(target, "plan.json")).json();
    plan.sessions[0].items[0].durationMinutes = 9;
    await Bun.write(join(target, "plan.json"), JSON.stringify(plan));
    await Bun.write(
      join(target, "logs/sessions.json"),
      '[{"date":"2026-11-02","minutes":9}]\n',
    );
    expect((await check(target)).errors).toEqual([]);
    const library = await Bun.file(join(target, "library.json")).json();
    library.items[0].tags = [];
    await Bun.write(join(target, "library.json"), JSON.stringify(library));
    expect(
      (await check(target)).errors.some((error) =>
        error.startsWith("Drift: library.json"),
      ),
    ).toBe(true);
    const result = Bun.spawnSync([
      process.execPath,
      join(root, "src/cli.ts"),
      "approve",
      "library.json",
      "--target",
      target,
    ]);
    expect(result.exitCode).toBe(0);
    expect((await check(target)).errors).toEqual([]);
  },
  INTEGRATION_TIMEOUT_MS,
);
