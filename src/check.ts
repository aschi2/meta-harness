import { lstat, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { isOwnerPath, matches, readHarness } from "./apply.ts";
import { diskFile, hasConflictMarkers, safePath } from "./files.ts";
import { PACKAGE_ROOT, loadPack } from "./packs.ts";
import { harnessRoot, type RuleOptions } from "./rule-sources.ts";
import { overlayPreferences } from "./overlay.ts";
import {
  changedFiles,
  scanCodeRules,
  subprocessTimeout,
} from "./code-rules.ts";
import { parseMaintenance, type InstructionBudget } from "./schema.ts";

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
  deadline?: number,
): Promise<string[]> {
  const result = Bun.spawnSync(
    ["git", "-C", target, "rev-parse", "--show-toplevel"],
    { timeout: subprocessTimeout(deadline), killSignal: "SIGKILL" },
  );
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

async function measureBudgets(
  target: string,
  budgets: InstructionBudget[],
  files: string[],
  changed?: Set<string>,
  deadline?: number,
): Promise<CheckReport> {
  const messages: string[] = [];
  const errors: string[] = [];
  for (const budget of budgets) {
    if (budget.scope === "chain") {
      const paths = await instructionChain(target, budget, deadline);
      if (changed && !paths.some((path) => changed.has(resolve(path))))
        continue;
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
      ...files.map((path) => join(target, dirname(path))),
    ]);
    for (const directory of directories) {
      for (const path of await existingInstructions(
        directory,
        budget.paths,
        false,
      )) {
        if (changed && !changed.has(resolve(path))) continue;
        const size = await measure(path, budget.unit);
        if (size > budget.maximum)
          errors.push(
            `Over budget: ${budget.target} ${relative(target, path)} ${size}/${budget.maximum} ${budget.unit}; ${budget.description}`,
          );
      }
    }
  }
  return { messages, errors };
}

export async function instructionBudgetReport(
  cwd: string,
  packageRoot = PACKAGE_ROOT,
  options: {
    changedOnly?: boolean;
    harness?: "claude" | "codex";
    overlay?: string;
    deadline?: number;
  } = {},
): Promise<CheckReport> {
  const target = await realpath(cwd);
  const root = await harnessRoot(target);
  if (options.changedOnly) {
    let codexTarget = false;
    if (root) {
      const { manifest, packs } = await readHarness(root, packageRoot);
      codexTarget = packs.some((pack) => {
        const targets = manifest.profile[pack.manifest.targetsField ?? ""];
        return Array.isArray(targets) && targets.includes("codex");
      });
    }
    try {
      const preferences = await overlayPreferences(options.overlay);
      codexTarget ||= preferences.instructionBudget === true;
    } catch {
      // Overlay diagnostics are reported separately; a broken overlay cannot disable a harness budget.
    }
    if (!codexTarget) return { messages: [], errors: [] };
    const git = Bun.spawnSync(
      ["git", "-C", target, "rev-parse", "--show-toplevel"],
      {
        timeout: subprocessTimeout(options.deadline),
        killSignal: "SIGKILL",
      },
    );
    if (git.exitCode !== 0) return { messages: [], errors: [] };
    const gitRoot = await realpath(git.stdout.toString().trim());
    const changed = new Set(
      (await changedFiles(gitRoot, options.deadline)).map((path) =>
        resolve(gitRoot, path),
      ),
    );
    const coding = await loadPack("coding", packageRoot);
    const budget = coding.manifest.instructionBudgets?.find(
      (budget) => budget.target === "codex" && budget.scope === "chain",
    );
    if (!budget) return { messages: [], errors: [] };
    return measureBudgets(target, [budget], [], changed, options.deadline);
  }
  if (!root) return { messages: [], errors: [] };
  const { manifest, packs } = await readHarness(root, packageRoot);
  const messages: string[] = [];
  const budgets: InstructionBudget[] = [];
  for (const pack of packs) {
    const selected = manifest.profile[pack.manifest.targetsField ?? ""];
    const targets: unknown[] = Array.isArray(selected) ? selected : [];
    for (const target of targets) {
      if (
        !(pack.manifest.instructionBudgets ?? []).some(
          (budget) => budget.target === target,
        )
      )
        messages.push(`${target}: no numeric instruction budget declared`);
    }
    budgets.push(
      ...(pack.manifest.instructionBudgets ?? []).filter((budget) =>
        targets.includes(budget.target),
      ),
    );
  }
  const report = await measureBudgets(
    target,
    budgets,
    Object.keys(manifest.files),
  );
  return { messages: [...messages, ...report.messages], errors: report.errors };
}

export async function check(
  targetPath: string,
  packageRoot = PACKAGE_ROOT,
  options: RuleOptions = {},
): Promise<CheckReport> {
  const target = resolve(targetPath);
  const messages: string[] = [];
  const errors: string[] = [];
  try {
    const { manifest, packs } = await readHarness(target, packageRoot);
    messages.push("Manifest valid");
    for (const [path, record] of Object.entries(manifest.files)) {
      const current = await diskFile(await safePath(target, path));
      if (!matches(current, record)) {
        const owner = record.mode === "owner" || isOwnerPath(path, packs);
        const report = owner ? errors : messages;
        report.push(
          `Drift: ${path} (${current.kind === "missing" ? "deleted" : "changed"})${owner ? "; owner approval required" : "; managed file"}`,
        );
      }
      if (current.kind !== "file") continue;
      if (hasConflictMarkers(current.content))
        errors.push(`Unresolved conflict markers: ${path}`);
      if (extname(path).toLowerCase() !== ".json") continue;
      try {
        const input: unknown = JSON.parse(current.content);
        if (path === ".harness/maintenance.json") parseMaintenance(input);
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
      for (const checker of pack.manifest.checkers) {
        try {
          const command = await safePath(await realpath(pack.root), checker);
          if (!(await lstat(command)).isFile())
            throw new Error("checker must be a regular file, not a symlink");
          const argv = [".ts", ".js", ".mjs", ".cjs", ".mts", ".tsx"].includes(
            extname(command).toLowerCase(),
          )
            ? [process.execPath, command]
            : [command];
          const result = Bun.spawnSync(argv, {
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
    const budget = await instructionBudgetReport(target, packageRoot);
    messages.push(...budget.messages);
    errors.push(...budget.errors);
    const scan = await scanCodeRules(target, { ...options, packageRoot });
    messages.push(...scan.messages);
    errors.push(...scan.errors, ...scan.failures);
    if (errors.length === 0) messages.push("Check passed");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return { messages, errors };
}
