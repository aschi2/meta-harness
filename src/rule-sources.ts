import { lstat, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { readHarness } from "./apply.ts";
import { safePath } from "./files.ts";
import { overlayPacks } from "./overlay.ts";
import { localRulePaths, ruleApprovals } from "./rule-trust.ts";
import type { LoadedPack } from "./packs.ts";

export interface RuleOptions {
  overlay?: string;
  packageRoot?: string;
  harness?: "claude" | "codex";
  timeoutMs?: number;
  deadline?: number;
}
export interface RuleSource {
  root: string;
  kind: "pack" | "harness" | "overlay";
  commandRules: string[];
  codeRules: string[];
  ruleTests: string[];
}

export async function harnessRoot(cwd: string): Promise<string | undefined> {
  let directory = resolve(cwd);
  while (true) {
    if (await Bun.file(join(directory, ".harness/manifest.json")).exists())
      return await realpath(directory);
    if (dirname(directory) === directory) return undefined;
    directory = dirname(directory);
  }
}

async function packSource(
  pack: LoadedPack,
  kind: RuleSource["kind"],
): Promise<RuleSource> {
  const root = await realpath(pack.root);
  const files = async (paths: string[]) =>
    Promise.all(
      paths.map(async (path) => {
        const absolute = await safePath(root, path);
        if (!(await lstat(absolute)).isFile())
          throw new Error(`${path}: rule must be a regular file`);
        return absolute;
      }),
    );
  return {
    root,
    kind,
    commandRules: await files(pack.manifest.commandRules ?? []),
    codeRules: await files(pack.manifest.codeRules ?? []),
    ruleTests: await files(pack.manifest.ruleTests ?? []),
  };
}

export async function getRuleSources(
  cwd: string,
  options: RuleOptions = {},
  includeUnapproved = false,
) {
  const target = await harnessRoot(cwd);
  const sources: RuleSource[] = [];
  const notices: string[] = [];
  if (target) {
    const { packs } = await readHarness(target, options.packageRoot);
    for (const pack of packs) sources.push(await packSource(pack, "pack"));
    const local: RuleSource = {
      root: target,
      kind: "harness",
      commandRules: [],
      codeRules: [],
      ruleTests: [],
    };
    for (const path of await localRulePaths(target)) {
      (path.endsWith(".ts") ? local.commandRules : local.codeRules).push(path);
    }
    for await (const path of new Bun.Glob(
      ".harness/rule-tests/*.{json,yml,yaml}",
    ).scan({ cwd: target })) {
      const absolute = await safePath(target, path);
      if (!(await lstat(absolute)).isFile())
        throw new Error(`${path}: fixture must be a regular file`);
      local.ruleTests.push(absolute);
    }
    local.ruleTests.sort();
    if (!includeUnapproved) {
      const approval = await ruleApprovals(target, [
        ...local.commandRules,
        ...local.codeRules,
      ]);
      local.commandRules = local.commandRules.filter((path) =>
        approval.approved.has(path),
      );
      local.codeRules = local.codeRules.filter((path) =>
        approval.approved.has(path),
      );
      notices.push(...approval.notices);
    }
    sources.push(local);
  }
  const preferences: Record<string, unknown> = {};
  for (const pack of await overlayPacks(options.overlay)) {
    sources.push(await packSource(pack, "overlay"));
    Object.assign(preferences, pack.manifest.preferences ?? {});
  }
  return { target, sources, preferences, notices };
}
