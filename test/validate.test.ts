import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseHarnessManifest } from "../src/schema.ts";
import { INTEGRATION_TIMEOUT_MS } from "./constants.ts";

const root = join(import.meta.dir, "..");
const cli = join(root, "src/cli.ts");

function runValidate(path: string) {
  const result = Bun.spawnSync(
    [process.execPath, "run", cli, "validate", path],
    {
      cwd: root,
    },
  );
  return {
    exitCode: result.exitCode,
    output: result.stdout.toString() + result.stderr.toString(),
  };
}

describe("validate CLI", () => {
  test(
    "passes on the real repository",
    () => {
      const result = runValidate(root);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Validated 4 pack(s).");
    },
    INTEGRATION_TIMEOUT_MS,
  );

  test.each([
    ["bad-schema", "/parts: must be array"],
    ["missing-file", "referenced file does not exist: missing.md"],
    ["bad-date", "/researchTopics/0/reviewed: must match format"],
  ])(
    "rejects %s with a clear error",
    (fixture, message) => {
      const result = runValidate(join(root, "test/fixtures", fixture));
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain(message);
    },
    INTEGRATION_TIMEOUT_MS,
  );
});

test("every KB or pack path in skills, README, and AGENTS exists", async () => {
  const documents = ["README.md", "AGENTS.md"];
  for await (const file of new Bun.Glob("skills/**/SKILL.md").scan(root)) {
    documents.push(file);
  }
  let checked = 0;
  for (const document of documents) {
    const content = await Bun.file(join(root, document)).text();
    const references = content.matchAll(/\b(?:packs|kb)\/[^\s`"'(){}<>;,]+/g);
    for (const match of references) {
      const reference = match[0].replace(/[.:]+$/, "");
      const matches = await Array.fromAsync(
        new Bun.Glob(reference).scan({
          cwd: root,
          onlyFiles: false,
        }),
      );
      expect(matches.length, `${document}: ${reference}`).toBeGreaterThan(0);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(0);
});

test("harness schema preserves legacy state and validates additive fields", () => {
  const legacy = {
    metaHarnessVersion: "0.10.4",
    kbEntry: "2026-09-02 — full refresh through the steered/autonomous lens",
    generatedAt: "2026-11-02T12:00:00Z",
    profile: {
      sizeTier: "small",
      languages: ["typescript"],
      targets: ["codex"],
    },
    files: {
      "AGENTS.md": { sha256: "a".repeat(64) },
      "CLAUDE.md": { symlink: "AGENTS.md" },
    },
    machineSetup: [
      {
        what: "cache access",
        where: "~/.codex/config.toml",
        rediscover: "npm config get cache",
        appliedAt: "2026-11-02",
      },
    ],
    overlays: [{ name: "private", appliedAt: "2026-11-02" }],
  };
  expect(parseHarnessManifest(legacy)).toEqual(legacy);
  const { kbEntry, machineSetup, ...older } = legacy;
  const oldest = {
    ...older,
    kbDate: "2026-08-24",
    machineLocal: [
      {
        path: ".codex/local.toml",
        rediscover: "go env GOMODCACHE",
        generatedAt: "2026-08-28",
      },
    ],
  };
  expect(parseHarnessManifest(oldest)).toEqual(oldest);
  const extended = {
    ...legacy,
    parts: {
      context: ["AGENTS.md", "CLAUDE.md"],
      knowledge: [],
      actions: [],
      checks: [],
      loop: [],
    },
    packs: [{ name: "coding", version: "0.1.0" }],
  };
  expect(parseHarnessManifest(extended)).toEqual(extended);
  expect(() =>
    parseHarnessManifest({ ...legacy, parts: extended.parts }),
  ).toThrow("packs");
  expect(() =>
    parseHarnessManifest({
      ...extended,
      parts: { ...extended.parts, checks: ["missing"] },
    }),
  ).toThrow("absent from files");
  expect(() =>
    parseHarnessManifest({
      ...legacy,
      files: { "AGENTS.md": { sha256: "bad" } },
    }),
  ).toThrow("sha256");
});
