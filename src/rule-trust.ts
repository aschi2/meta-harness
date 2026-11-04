import { lstat, mkdir, realpath, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { configDirectory } from "./config.ts";
import { hash, safePath } from "./files.ts";

interface TrustStore {
  version: 1;
  repos: Record<string, Record<string, string>>;
}
export const ruleTrustPath = () => join(configDirectory(), "rule-trust.json");

async function readTrust(): Promise<TrustStore> {
  const file = Bun.file(ruleTrustPath());
  if (!(await file.exists())) return { version: 1, repos: {} };
  const value = await file.json();
  if (
    value?.version !== 1 ||
    typeof value.repos !== "object" ||
    value.repos === null ||
    Array.isArray(value.repos)
  )
    throw new Error("Invalid user rule trust store");
  for (const rules of Object.values(value.repos)) {
    if (
      typeof rules !== "object" ||
      rules === null ||
      Array.isArray(rules) ||
      Object.values(rules).some(
        (value) => typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value),
      )
    )
      throw new Error("Invalid user rule trust store");
  }
  return value;
}

export async function localRulePaths(target: string): Promise<string[]> {
  const paths: string[] = [];
  for (const pattern of [
    ".harness/rules/command/*.ts",
    ".harness/rules/code/*.{yml,yaml}",
  ]) {
    for await (const path of new Bun.Glob(pattern).scan({ cwd: target })) {
      const absolute = await safePath(target, path);
      if (!(await lstat(absolute)).isFile())
        throw new Error(`${path}: rule must be a regular file`);
      paths.push(absolute);
    }
  }
  return paths.sort();
}

export async function ruleApprovals(target: string, paths: string[]) {
  const root = await realpath(target);
  const store = await readTrust();
  const approved = new Set<string>();
  const notices: string[] = [];
  for (const path of paths) {
    const name = relative(root, path).split(sep).join("/");
    if (store.repos[root]?.[name] === hash(await Bun.file(path).text()))
      approved.add(path);
    else
      notices.push(
        `Unapproved local rule skipped: ${name}; run meta-harness approve --rules --target ${JSON.stringify(root)}`,
      );
  }
  return { approved, notices };
}

export async function approveRules(target: string): Promise<string> {
  const root = await realpath(target);
  if (!(await Bun.file(join(root, ".harness/manifest.json")).exists()))
    throw new Error("No harness manifest found");
  const paths = await localRulePaths(root);
  const rules: Record<string, string> = {};
  for (const path of paths)
    rules[relative(root, path).split(sep).join("/")] = hash(
      await Bun.file(path).text(),
    );
  const store = await readTrust();
  store.repos[root] = rules;
  const path = ruleTrustPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(store, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  await rename(temporary, path);
  return `Approved ${paths.length} local rule(s) for ${root}`;
}
