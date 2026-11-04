import { lstat, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { RuleOptions, RuleSource } from "./rule-sources.ts";
import { getRuleSources } from "./rule-sources.ts";

export interface CodeScanReport {
  messages: string[];
  errors: string[];
  failures: string[];
}

const SCAN_TIMEOUT_MS = 30_000;
const require = createRequire(import.meta.url);
export function astGrepArgs(args: string[]): [string, ...string[]] {
  const suffix =
    process.platform === "win32"
      ? "-msvc"
      : process.platform === "linux"
        ? "-gnu"
        : "";
  const packageName = `@ast-grep/cli-${process.platform}-${process.arch}${suffix}`;
  const directory = dirname(
    require.resolve(`${packageName}/package.json`, {
      paths: [dirname(require.resolve("@ast-grep/cli/package.json"))],
    }),
  );
  const binary = join(
    directory,
    process.platform === "win32" ? "ast-grep.exe" : "ast-grep",
  );
  if (args[0] !== "scan") return [binary, ...args];
  return [
    binary,
    "scan",
    "--config",
    join(import.meta.dir, "ast-grep.yml"),
    ...args.slice(1),
  ];
}

export function subprocessTimeout(deadline?: number): number {
  const remaining =
    deadline === undefined ? SCAN_TIMEOUT_MS : deadline - Date.now();
  if (remaining <= 0) throw new Error("Hook deadline exceeded");
  return Math.min(SCAN_TIMEOUT_MS, remaining);
}

function git(target: string, args: string[], deadline?: number) {
  return Bun.spawnSync(["git", "-C", target, ...args], {
    timeout: subprocessTimeout(deadline),
    killSignal: "SIGKILL",
  });
}

async function gitRoot(
  target: string,
  deadline?: number,
): Promise<string | undefined> {
  const result = git(target, ["rev-parse", "--show-toplevel"], deadline);
  if (result.exitCode !== 0) return undefined;
  return realpath((result.stdout ?? Buffer.alloc(0)).toString().trim());
}

function names(result: ReturnType<typeof Bun.spawnSync>): string[] {
  if (result.exitCode !== 0)
    throw new Error(
      (result.stderr ?? Buffer.alloc(0)).toString().trim() ||
        "git path listing failed",
    );
  return (result.stdout ?? Buffer.alloc(0))
    .toString()
    .split("\0")
    .filter(Boolean);
}

/** Changed, staged, and untracked regular files, relative to the git root. */
export async function changedFiles(
  target: string,
  deadline?: number,
): Promise<string[]> {
  const root = await gitRoot(resolve(target), deadline);
  if (!root) return [];
  const head = git(root, ["rev-parse", "--verify", "HEAD"], deadline);
  const paths = new Set(
    names(
      git(root, ["ls-files", "--others", "--exclude-standard", "-z"], deadline),
    ),
  );
  const diffArguments =
    head.exitCode === 0
      ? [["diff", "HEAD", "--name-only", "--diff-filter=ACMRT", "-z"]]
      : [
          ["diff", "--cached", "--name-only", "--diff-filter=ACMRT", "-z"],
          ["diff", "--name-only", "--diff-filter=ACMRT", "-z"],
        ];
  for (const args of diffArguments)
    for (const path of names(git(root, args, deadline))) paths.add(path);

  const files: string[] = [];
  for (const path of [...paths].sort()) {
    const info = await lstat(join(root, path)).catch(() => undefined);
    if (info?.isFile()) files.push(path.split(sep).join("/"));
  }
  return files;
}

function parseDiagnostics(output: string): unknown[] {
  const start = output.indexOf("[");
  if (start < 0) throw new Error("ast-grep returned no JSON diagnostics");
  const parsed: unknown = JSON.parse(output.slice(start));
  if (!Array.isArray(parsed))
    throw new Error("ast-grep diagnostics must be an array");
  return parsed;
}

function diagnosticText(value: unknown): {
  severity: string;
  text: string;
} {
  if (typeof value !== "object" || value === null)
    throw new Error("ast-grep returned an invalid diagnostic");
  const item = value as Record<string, unknown>;
  if (
    typeof item.severity !== "string" ||
    typeof item.file !== "string" ||
    typeof item.message !== "string" ||
    typeof item.ruleId !== "string"
  )
    throw new Error("ast-grep returned an incomplete diagnostic");
  const start = (item.range as { start?: { line?: unknown } } | undefined)
    ?.start;
  const line = typeof start?.line === "number" ? `:${start.line + 1}` : "";
  return {
    severity: item.severity,
    text: `${item.file}${line}: ${item.message} [${item.ruleId}]`,
  };
}

async function appendScan(
  source: RuleSource,
  rule: string,
  target: string,
  files: string[],
  report: CodeScanReport,
  deadline?: number,
): Promise<void> {
  if (files.length === 0) return;
  const parsed = Bun.YAML.parse(await Bun.file(rule).text());
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new Error("ast-grep rule must be a mapping");
  const definition = parsed as Record<string, unknown>;
  const {
    files: includeValue,
    ignores: ignoreValue,
    ...inlineRule
  } = definition;
  const globs = (value: unknown, field: string): Bun.Glob[] | undefined => {
    if (value === undefined) return undefined;
    if (
      !Array.isArray(value) ||
      value.some((pattern) => typeof pattern !== "string")
    )
      throw new Error(`ast-grep ${field} must be an array of strings`);
    return value.map((pattern) => new Bun.Glob(pattern));
  };
  const includes = globs(includeValue, "files");
  const excludes = globs(ignoreValue, "ignores") ?? [];
  const relativeFiles = files.map((file) =>
    relative(target, file).split(sep).join("/"),
  );
  const selectedFiles = relativeFiles.filter((file) => {
    if (file === ".." || file.startsWith("../")) return false;
    const included =
      !includes || includes.some((pattern) => pattern.match(file));
    const excluded = excludes.some((pattern) => pattern.match(file));
    return included && !excluded;
  });
  if (selectedFiles.length === 0) return;
  const result = Bun.spawnSync(
    astGrepArgs([
      "scan",
      "--inline-rules",
      JSON.stringify(inlineRule),
      "--json=compact",
      "--color",
      "never",
      "--",
      ...selectedFiles,
    ]),
    {
      cwd: target,
      timeout: subprocessTimeout(deadline),
      killSignal: "SIGKILL",
    },
  );
  const output = (result.stdout ?? Buffer.alloc(0)).toString();
  const stderr = (result.stderr ?? Buffer.alloc(0)).toString().trim();
  if (result.exitCode !== 0 && result.exitCode !== 1) {
    report.failures.push(
      `${source.kind} rule ${rule}: ${stderr || `ast-grep exited ${result.exitCode}`}`,
    );
    return;
  }
  try {
    for (const item of parseDiagnostics(output)) {
      const diagnostic = diagnosticText(item);
      (diagnostic.severity === "error" ? report.errors : report.messages).push(
        diagnostic.text,
      );
    }
  } catch (error) {
    report.failures.push(
      `${source.kind} rule ${rule}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Runs each configured ast-grep rule on changed and untracked regular files. */
export async function scanCodeRules(
  targetPath: string,
  options: RuleOptions = {},
): Promise<CodeScanReport> {
  const target = resolve(targetPath);
  const report: CodeScanReport = { messages: [], errors: [], failures: [] };
  try {
    const ruleSources = await getRuleSources(target, options);
    report.messages.push(...ruleSources.notices);
    if (!ruleSources.sources.some((source) => source.codeRules.length))
      return report;
    const root = await gitRoot(target, options.deadline);
    if (!root) return report;
    const paths = await changedFiles(target, options.deadline);
    const files = paths.map((path) => join(root, path));
    const scanRoot = ruleSources.target ?? (await realpath(target));
    const sources = ruleSources.sources;
    for (const source of sources) {
      for (const rule of source.codeRules) {
        try {
          await appendScan(
            source,
            rule,
            scanRoot,
            files,
            report,
            options.deadline,
          );
        } catch (error) {
          report.failures.push(
            `${source.kind} rule ${rule}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  } catch (error) {
    report.failures.push(
      error instanceof Error ? error.message : String(error),
    );
  }
  return report;
}
