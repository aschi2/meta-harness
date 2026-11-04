import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { INTEGRATION_TIMEOUT_MS } from "./constants.ts";

const repositoryRoot = join(import.meta.dir, "..");

test("plugin marketplace versions match the npm package version", async () => {
  const packageManifest = await Bun.file(
    join(repositoryRoot, "package.json"),
  ).json();
  const pluginManifest = await Bun.file(
    join(repositoryRoot, ".claude-plugin/plugin.json"),
  ).json();
  const marketplace = await Bun.file(
    join(repositoryRoot, ".claude-plugin/marketplace.json"),
  ).json();

  expect(pluginManifest.version).toBe(packageManifest.version);
  expect(marketplace.version).toBe(packageManifest.version);
  expect(marketplace.plugins).toHaveLength(1);
  expect(marketplace.plugins[0].version).toBe(packageManifest.version);
});

test("npm package whitelist includes the executable with a Bun shebang", async () => {
  const packageManifest = await Bun.file(
    join(repositoryRoot, "package.json"),
  ).json();
  expect(packageManifest.private).toBeUndefined();
  expect(packageManifest.files).toEqual([
    "src/**",
    "packs/**",
    "schemas/**",
    "skills/**",
    "templates/**",
    "README.md",
    "LICENSE",
  ]);
  expect(packageManifest.engines.bun).toBe(">=1.4.2");
  expect(packageManifest.bin["meta-harness"]).toBe("src/cli.ts");
  const cli = await readFile(join(repositoryRoot, "src/cli.ts"), "utf8");
  expect(cli.split(/\r?\n/, 1)[0]).toBe("#!/usr/bin/env bun");
});

test(
  "release tag guard accepts only the package's v-prefixed version",
  async () => {
    const script = join(repositoryRoot, "scripts/check-release-tag.mjs");
    const packageManifest = await Bun.file(
      join(repositoryRoot, "package.json"),
    ).json();
    const matching = Bun.spawnSync([process.execPath, script], {
      env: { ...process.env, GITHUB_REF_NAME: `v${packageManifest.version}` },
      timeout: 15000,
    });
    const mismatching = Bun.spawnSync([process.execPath, script], {
      env: {
        ...process.env,
        GITHUB_REF_NAME: `v${packageManifest.version}-next`,
      },
    });
    expect(matching.exitCode).toBe(0);
    expect(mismatching.exitCode).toBe(1);
  },
  INTEGRATION_TIMEOUT_MS,
);
