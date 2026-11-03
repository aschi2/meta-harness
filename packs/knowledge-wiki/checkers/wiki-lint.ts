import { lstat, readdir, readFile } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { markdown, type Reference } from "./markdown.ts";
import { frontmatter } from "../../../src/frontmatter.ts";

export type Finding = {
  rule:
    | "frontmatter"
    | "raw-reference"
    | "index-link"
    | "orphan-page"
    | "log-order"
    | "raw-immutable"
    | "unsafe-path"
    | "page-type"
    | "ambiguous-link";
  path: string;
};

const INDEX = "wiki/index.md";
const LOG = "wiki/log.md";
const GIT_TIMEOUT_MS = 10_000;
const RAW_FIELDS = new Set([
  "sources",
  "source",
  "raw",
  "files",
  "file",
  "path",
]);
type Page = { path: string; body: string; raw: string[]; needsRaw: boolean };
type Link =
  | { kind: "external" | "anchor" | "unsafe" | "ambiguous" }
  | { kind: "local"; path: string };

function portable(path: string): string {
  return path.split(sep).join("/");
}

function excluded(name: string): boolean {
  return /^(?:\.env.*|\.git|\.harness|receipts|tmp)$/i.test(name);
}

async function state(root: string, path: string) {
  const segments = path.split("/");
  if (segments.some((segment) => excluded(segment))) return "unsafe";
  let current = root;
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    const info = await lstat(current).catch(() => undefined);
    if (!info) return "missing";
    if (info.isSymbolicLink()) return "unsafe";
    if (index === segments.length - 1) {
      if (info.isFile()) return "file";
      if (info.isDirectory()) return "directory";
      return "unsafe";
    }
    if (!info.isDirectory()) return "missing";
  }
  return "missing";
}

function linkTarget(root: string, page: string, value: string): Link {
  if (/^(?:https?:|mailto:)/i.test(value)) return { kind: "external" };
  if (value.startsWith("#")) return { kind: "anchor" };
  let path: string;
  try {
    path = decodeURIComponent(value.split(/[?#]/, 1)[0] ?? "").replace(
      /\\([()])/g,
      "$1",
    );
  } catch {
    return { kind: "unsafe" };
  }
  if (!path || /[\\\u0000]/.test(path) || /^(?:\/|[a-z][\w+.-]*:)/i.test(path))
    return { kind: "unsafe" };
  const base = /^(?:raw|wiki)\//.test(path) ? root : join(root, dirname(page));
  const local = portable(relative(root, resolve(base, path)));
  if (!/^(?:raw|wiki)\//.test(local) || local.split("/").some(excluded))
    return { kind: "unsafe" };
  return { kind: "local", path: local };
}

function rawPaths(value: unknown, seen = new Set<object>()): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value))
    return value.flatMap((entry) => rawPaths(entry, seen));
  return Object.entries(value).flatMap(([key, entry]) =>
    RAW_FIELDS.has(key) ? rawPaths(entry, seen) : [],
  );
}

function parsePage(path: string, content: string): Page {
  const { metadata, body } = frontmatter(content);
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    throw new Error("frontmatter");
  const entries = Object.entries(metadata);
  const type = entries.find(([key]) => key === "type" || key === "kind")?.[1];
  const types = new Set([
    "index",
    "log",
    "overview",
    "source",
    "analysis",
    "entity",
    "concept",
    "topic",
  ]);
  for (const key of ["type", "kind"]) {
    const value = entries.find(([name]) => name === key)?.[1];
    if (value !== undefined && (typeof value !== "string" || !types.has(value)))
      throw new Error("page-type");
  }
  return {
    path,
    body,
    raw: entries.flatMap(([key, value]) =>
      RAW_FIELDS.has(key) ? rawPaths(value) : [],
    ),
    needsRaw:
      /(?:^|\/)(?:sources?|analys(?:is|es))(?:\/)/i.test(path) ||
      type === "source" ||
      type === "analysis",
  };
}

function orderedLog(headings: string[]): boolean {
  let previous = "9999-12-31";
  for (const heading of headings) {
    const date = /^\[?(\d{4}-\d{2}-\d{2})\]?(?=\s|$)/.exec(heading)?.[1];
    if (!date || date > previous) return false;
    const timestamp = Date.parse(`${date}T00:00:00Z`);
    if (
      !Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== date
    )
      return false;
    previous = date;
  }
  return true;
}

async function rawChanges(root: string): Promise<string[]> {
  let gitRoot = root;
  while (!(await lstat(join(gitRoot, ".git")).catch(() => undefined))) {
    const parent = dirname(gitRoot);
    if (parent === gitRoot) return [];
    gitRoot = parent;
  }
  const git = (arguments_: string[]) =>
    Bun.spawnSync(["git", "--no-optional-locks", "-C", root, ...arguments_], {
      timeout: GIT_TIMEOUT_MS,
    });
  const tracked = git(["ls-files", "-v", "-z", "--", "raw"]);
  if (tracked.exitCode !== 0) return ["raw"];
  const changes: string[] = [];
  for (const entry of tracked.stdout.toString().split("\0")) {
    if (!entry) continue;
    if (entry[0] === "S" || entry[0] === "s" || /^[a-z]/.test(entry))
      changes.push(portable(entry.slice(2)));
  }
  const head = git(["rev-parse", "--verify", "HEAD"]);
  if (head.exitCode !== 0) return changes;
  const result = git([
    "diff",
    "HEAD",
    "--name-status",
    "--no-renames",
    "-z",
    "--",
    "raw",
  ]);
  if (result.exitCode !== 0) return [...changes, "raw"];
  const records = result.stdout.toString().split("\0");
  for (let index = 0; index < records.length - 1; index += 2) {
    const status = records[index];
    const path = records[index + 1];
    if (!path || status === "A") continue;
    const local = portable(relative(root, join(gitRoot, path)));
    if (local === "raw" || local.startsWith("raw/")) changes.push(local);
  }
  return changes;
}

export async function wikiLint(target: string): Promise<Finding[]> {
  const root = resolve(target);
  const findings: Finding[] = [];
  const add = (rule: Finding["rule"], path: string) => {
    if (
      !findings.some(
        (finding) => finding.rule === rule && finding.path === path,
      )
    )
      findings.push({ rule, path });
  };
  const rootInfo = await lstat(root).catch(() => undefined);
  if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink())
    return [{ rule: "unsafe-path", path: "." }];
  const pages = new Map<string, Page>();
  const invalidPages = new Set<string>();
  async function walk(path: string): Promise<void> {
    const kind = await state(root, path);
    if (kind === "unsafe") {
      add("unsafe-path", path);
      return;
    }
    if (kind !== "directory") return;
    for (const entry of await readdir(join(root, path), {
      withFileTypes: true,
    })) {
      if (excluded(entry.name) || entry.name === "raw") continue;
      const child = `${path}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        add("unsafe-path", child);
        continue;
      }
      if (entry.isDirectory()) {
        await walk(child);
        continue;
      }
      if (extname(entry.name).toLowerCase() !== ".md") continue;
      if ((await state(root, child)) !== "file") {
        add("unsafe-path", child);
        continue;
      }
      const content = await readFile(join(root, child), "utf8");
      try {
        pages.set(child, parsePage(child, content));
      } catch (error) {
        add(
          error instanceof Error && error.message === "page-type"
            ? "page-type"
            : "frontmatter",
          child,
        );
        invalidPages.add(child);
        pages.set(child, {
          path: child,
          body: content,
          raw: [],
          needsRaw: false,
        });
      }
    }
  }
  await walk("wiki");
  if (!pages.has(INDEX)) add("index-link", INDEX);
  if (!pages.has(LOG)) add("log-order", LOG);
  const names = new Map<string, string[]>();
  async function catalog(directory: string): Promise<void> {
    for (const entry of await readdir(join(root, directory), {
      withFileTypes: true,
    })) {
      if (excluded(entry.name) || entry.name === "node_modules") continue;
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await catalog(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const keys = [entry.name];
      if (extname(entry.name).toLowerCase() === ".md")
        keys.push(basename(entry.name, extname(entry.name)));
      for (const key of keys) names.set(key, [...(names.get(key) ?? []), path]);
    }
  }
  await catalog("");
  async function reference(page: string, entry: Reference): Promise<Link> {
    if (!entry.wiki) return linkTarget(root, page, entry.target);
    const name = entry.target.split("#", 1)[0] ?? "";
    if (!name) return { kind: "anchor" };
    if (!name.includes("/") && !name.includes("\\") && !name.includes(":")) {
      const matches = names.get(name) ?? [];
      if (matches.length > 1) return { kind: "ambiguous" };
      if (matches[0]) return { kind: "local", path: matches[0] };
    }
    const direct = linkTarget(root, page, name);
    if (direct.kind !== "local" || (await state(root, direct.path)) === "file")
      return direct;
    return linkTarget(root, page, `${name}.md`);
  }
  const graph = new Map<string, string[]>();
  for (const page of pages.values()) {
    const edges: string[] = [];
    let hasRaw = false;
    const parsed = markdown(page.body);
    const references = [
      ...parsed.references,
      ...page.raw.map((target) => {
        if (target.startsWith("[[") && target.endsWith("]]"))
          return {
            target: target.slice(2, -2).split("|", 1)[0] ?? "",
            wiki: true,
          };
        return { target, wiki: false };
      }),
    ];
    for (const entry of references) {
      const link = await reference(page.path, entry);
      if (link.kind === "ambiguous") {
        add("ambiguous-link", page.path);
        continue;
      }
      if (link.kind === "unsafe") {
        add("unsafe-path", page.path);
        continue;
      }
      if (link.kind !== "local") continue;
      const kind = await state(root, link.path);
      if (kind === "unsafe") add("unsafe-path", page.path);
      if (kind !== "file") {
        if (page.path === INDEX) add("index-link", INDEX);
        continue;
      }
      if (link.path.startsWith("raw/")) hasRaw = true;
      if (pages.has(link.path)) edges.push(link.path);
    }
    if (page.needsRaw && !hasRaw) add("raw-reference", page.path);
    if (page.path === LOG && !orderedLog(parsed.headings))
      add("log-order", LOG);
    graph.set(page.path, edges);
  }
  const reachable = new Set<string>();
  const pending = [INDEX];
  while (pending.length) {
    const path = pending.pop();
    if (!path || reachable.has(path)) continue;
    reachable.add(path);
    pending.push(...(graph.get(path) ?? []));
  }
  for (const path of pages.keys())
    if (
      path !== INDEX &&
      path !== LOG &&
      !invalidPages.has(path) &&
      !reachable.has(path)
    )
      add("orphan-page", path);
  for (const path of await rawChanges(root)) add("raw-immutable", path);
  return findings.sort(
    (left, right) =>
      left.rule.localeCompare(right.rule) ||
      left.path.localeCompare(right.path),
  );
}

if (import.meta.main) {
  let findings: Finding[];
  try {
    findings = await wikiLint(process.argv[2] ?? process.cwd());
  } catch {
    findings = [{ rule: "unsafe-path", path: "." }];
  }
  const counts: Record<string, number> = {};
  for (const { rule } of findings) counts[rule] = (counts[rule] ?? 0) + 1;
  process.stdout.write(JSON.stringify({ counts, findings }) + "\n");
  process.exitCode = findings.length ? 1 : 0;
}
