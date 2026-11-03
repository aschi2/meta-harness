import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { matches, readHarness } from "./apply.ts";
import { diskFile, hasConflictMarkers, safePath } from "./files.ts";
import { PACKAGE_ROOT } from "./packs.ts";
import type { InstructionBudget } from "./schema.ts";

const CHECKER_TIMEOUT_MS = 30_000;
export interface CheckReport {
  messages: string[];
  errors: string[];
}

async function existingInstructions(
  directory: string,
  paths: string[],
  firstOnly: boolean,
): Promise<string[]> {
  const exists = await stat(directory).then(
    () => true,
    () => false,
  );
  if (!exists) return [];
  const found: string[] = [];
  for (const pattern of paths) {
    for await (const path of new Bun.Glob(pattern).scan({
      cwd: directory,
      absolute: true,
    })) {
      if ((await Bun.file(path).size) === 0) continue;
      found.push(path);
      if (firstOnly) return found;
    }
  }
  return [...new Set(found)].sort();
}

async function instructionChain(
  target: string,
  budget: InstructionBudget,
): Promise<string[]> {
  const result = Bun.spawnSync([
    "git",
    "-C",
    target,
    "rev-parse",
    "--show-toplevel",
  ]);
  const canonicalTarget = await realpath(target);
  const root =
    result.exitCode === 0
      ? await realpath(result.stdout.toString().trim())
      : canonicalTarget;
  const directories = [canonicalTarget];
  while (directories[0] !== root) {
    const first = directories[0];
    if (!first || dirname(first) === first) break;
    directories.unshift(dirname(first));
  }
  const paths: string[] = [];
  if (budget.globalDirectory) {
    const directory =
      process.env[budget.globalEnvironment ?? ""] ??
      join(homedir(), budget.globalDirectory);
    paths.push(
      ...(await existingInstructions(
        directory,
        budget.globalPaths ?? budget.paths,
        true,
      )),
    );
  }
  for (const directory of directories)
    paths.push(...(await existingInstructions(directory, budget.paths, true)));
  return paths;
}

async function measure(
  path: string,
  unit: InstructionBudget["unit"],
): Promise<number> {
  const file = Bun.file(path);
  if (unit === "bytes") return file.size;
  const content = await file.text();
  if (!content) return 0;
  return content.split("\n").length - Number(content.endsWith("\n"));
}

export async function check(
  targetPath: string,
  packageRoot = PACKAGE_ROOT,
): Promise<CheckReport> {
  const target = resolve(targetPath);
  const messages: string[] = [];
  const errors: string[] = [];
  try {
    const { manifest, packs } = await readHarness(target, packageRoot);
    messages.push("Manifest valid");
    for (const [path, record] of Object.entries(manifest.files)) {
      const current = await diskFile(await safePath(target, path));
      if (!matches(current, record))
        errors.push(
          `Drift: ${path} (${current.kind === "missing" ? "deleted" : "changed"})`,
        );
      if (current.kind !== "file") continue;
      if (hasConflictMarkers(current.content))
        errors.push(`Unresolved conflict markers: ${path}`);
      if (extname(path).toLowerCase() !== ".json") continue;
      try {
        JSON.parse(current.content);
      } catch (error) {
        errors.push(
          `Invalid JSON: ${path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    for (const pack of packs) {
      if (!pack.profileValidator.Check(manifest.profile))
        errors.push(
          `Profile behind pack ${pack.manifest.version} (${pack.manifest.name}): run update`,
        );
      const selected = manifest.profile[pack.manifest.targetsField ?? ""];
      const targets = Array.isArray(selected) ? selected : [];
      for (const target of targets) {
        if (
          !(pack.manifest.instructionBudgets ?? []).some(
            (budget) => budget.target === target,
          )
        )
          messages.push(`${target}: no numeric instruction budget declared`);
      }
      for (const budget of pack.manifest.instructionBudgets ?? []) {
        if (!targets.includes(budget.target)) continue;
        if (budget.scope === "chain") {
          const paths = await instructionChain(target, budget);
          const sizes = await Promise.all(
            paths.map((path) => measure(path, budget.unit)),
          );
          const size = sizes.reduce((sum, size) => sum + size, 0);
          const summary = `${budget.target}: ${size}/${budget.maximum} ${budget.unit} (global + instruction chain)`;
          messages.push(summary);
          if (size > budget.maximum)
            errors.push(`Over budget: ${summary}; ${paths.join(", ")}`);
          continue;
        }
        const directories = new Set([
          target,
          ...Object.keys(manifest.files).map((path) =>
            join(target, dirname(path)),
          ),
        ]);
        for (const directory of directories) {
          for (const path of await existingInstructions(
            directory,
            budget.paths,
            false,
          )) {
            const size = await measure(path, budget.unit);
            if (size > budget.maximum)
              errors.push(
                `Over budget: ${budget.target} ${relative(target, path)} ${size}/${budget.maximum} ${budget.unit}; ${budget.description}`,
              );
          }
        }
      }
      for (const checker of pack.manifest.checkers) {
        const command = join(pack.root, checker);
        try {
          const result = Bun.spawnSync([command], {
            cwd: target,
            timeout: CHECKER_TIMEOUT_MS,
          });
          const summary = `Checker ${pack.manifest.name}/${checker}: exit ${result.exitCode}`;
          messages.push(summary);
          const output = result.stdout.toString() + result.stderr.toString();
          if (output.trim()) messages.push(output.trim());
          if (result.exitCode !== 0) errors.push(summary);
        } catch (error) {
          errors.push(
            `Checker ${pack.manifest.name}/${checker}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    if (errors.length === 0) messages.push("Check passed");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return { messages, errors };
}
