import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import {
  applyWrites,
  assertReady,
  BASELINE_DIRECTORY,
  diskFile,
  hash,
  hasConflictMarkers,
  MANIFEST_PATH,
  safePath,
  symlinkDestination,
  type DiskFile,
  type Write,
} from "./files.ts";
import {
  knowledgeEntry,
  loadPack,
  loadPlan,
  PACKAGE_ROOT,
  type LoadedPack,
} from "./packs.ts";
import {
  HARNESS_PARTS,
  parseHarnessManifest,
  type FileRecord,
  type HarnessManifest,
  type HarnessParts,
  type Plan,
} from "./schema.ts";

interface ApplyOptions {
  planPath: string;
  target: string;
  packageRoot?: string;
}
interface PreparedFile {
  path: string;
  content: string;
  adopted: boolean;
  parts: Plan["files"][number]["parts"];
}
interface PreparedLink {
  path: string;
  target: string;
  adopted: boolean;
  parts: Plan["symlinks"][number]["parts"];
}
export interface ApplyReport {
  messages: string[];
  conflicts: string[];
}

export async function readHarness(target: string, packageRoot = PACKAGE_ROOT) {
  await assertReady(target);
  const path = await safePath(target, MANIFEST_PATH);
  const state = await diskFile(path);
  if (state.kind !== "file")
    throw new Error(`${MANIFEST_PATH}: expected a regular manifest file`);
  const manifest = parseHarnessManifest(JSON.parse(state.content));
  const sources = manifest.packs ?? [{ name: "coding", version: "legacy" }];
  const packs = await Promise.all(
    sources.map((source) => loadPack(source.name, packageRoot)),
  );
  return { manifest, packs };
}

async function prepare(plan: Plan, pack: LoadedPack, target: string) {
  const files: PreparedFile[] = [];
  for (const file of plan.files) {
    await safePath(target, file.path);
    if ("content" in file) {
      files.push({ ...file, adopted: file.adopted ?? false });
      continue;
    }
    if (!pack.manifest.templates.includes(file.template))
      throw new Error(`${file.template}: template is not declared by pack`);
    const template = await Bun.file(join(pack.root, file.template)).text();
    const isJson = extname(file.path).toLowerCase() === ".json";
    const content = template.replace(
      /{{([^{}]*)}}/g,
      (_, placeholder: string) => {
        const name = placeholder.trim();
        if (!Object.hasOwn(file.variables, name))
          throw new Error(`${file.path}: missing template variable ${name}`);
        const value = file.variables[name] ?? "";
        return isJson ? JSON.stringify(value).slice(1, -1) : value;
      },
    );
    files.push({
      path: file.path,
      content,
      parts: file.parts,
      adopted: file.adopted ?? false,
    });
  }
  const symlinks: PreparedLink[] = [];
  for (const link of plan.symlinks) {
    await safePath(target, link.path);
    symlinkDestination(target, link.path, link.target);
    symlinks.push({ ...link, adopted: link.adopted ?? false });
  }
  const linkMap = new Map(symlinks.map((link) => [link.path, link]));
  const filePaths = new Set(files.map((file) => file.path));
  for (const link of symlinks) {
    const visited = new Set([link.path]);
    let destination = symlinkDestination(target, link.path, link.target);
    let next = linkMap.get(destination);
    while (next) {
      if (visited.has(destination))
        throw new Error(`${link.path}: symlink cycle`);
      visited.add(destination);
      destination = symlinkDestination(target, next.path, next.target);
      next = linkMap.get(destination);
    }
    if (filePaths.has(destination)) continue;
    const state = await diskFile(await safePath(target, destination));
    if (state.kind !== "file")
      throw new Error(
        `${link.path}: symlink target must be a planned or existing regular file`,
      );
  }
  return { files, symlinks };
}

export function matches(state: DiskFile, record: FileRecord): boolean {
  if ("sha256" in record)
    return state.kind === "file" && hash(state.content) === record.sha256;
  return state.kind === "symlink" && state.target === record.symlink;
}

async function newManifest(
  pack: LoadedPack,
  plan: Plan,
  packageRoot: string,
  old?: HarnessManifest,
): Promise<HarnessManifest> {
  const plugin: unknown = await Bun.file(
    join(packageRoot, ".claude-plugin/plugin.json"),
  ).json();
  if (
    typeof plugin !== "object" ||
    plugin === null ||
    !("version" in plugin) ||
    typeof plugin.version !== "string"
  )
    throw new Error("Invalid plugin version");
  const versions = new Map(
    (old?.packs ?? []).map((source) => [source.name, source]),
  );
  versions.set(pack.manifest.name, {
    name: pack.manifest.name,
    version: pack.manifest.version,
  });
  return {
    ...old,
    metaHarnessVersion: plugin.version,
    kbEntry: await knowledgeEntry(pack),
    generatedAt: new Date().toISOString(),
    profile: plan.profile,
    files: old?.files ?? {},
    parts: old?.parts ?? {
      context: [],
      knowledge: [],
      actions: [],
      checks: [],
      loop: [],
    },
    packs: [...versions.values()],
  };
}

function setParts(
  mapping: HarnessParts,
  path: string,
  parts: Plan["files"][number]["parts"],
): void {
  for (const part of HARNESS_PARTS) {
    mapping[part] = mapping[part].filter((entry) => entry !== path);
    if (parts.some((value) => value === part)) mapping[part].push(path);
  }
}

export async function init(
  options: ApplyOptions & { packName: string },
): Promise<ApplyReport> {
  const target = resolve(options.target);
  const packageRoot = options.packageRoot ?? PACKAGE_ROOT;
  await assertReady(target);
  if ((await diskFile(join(target, MANIFEST_PATH))).kind !== "missing")
    throw new Error("Harness already initialized; use update");
  const { plan, pack } = await loadPlan(
    options.planPath,
    packageRoot,
    options.packName,
  );
  const prepared = await prepare(plan, pack, target);
  for (const entry of [...prepared.files, ...prepared.symlinks]) {
    const current = await diskFile(join(target, entry.path));
    if (current.kind !== "missing" && !entry.adopted)
      throw new Error(
        `${entry.path}: refusing to overwrite an existing file without adopted: true`,
      );
  }
  const manifest = await newManifest(pack, plan, packageRoot);
  const records = new Map<string, FileRecord>();
  const parts = manifest.parts;
  if (!parts) throw new Error("Missing parts mapping");
  const writes: Write[] = [];
  const messages: string[] = [];
  for (const file of prepared.files) {
    writes.push(
      { path: file.path, content: file.content },
      { path: `${BASELINE_DIRECTORY}/${file.path}`, content: file.content },
    );
    records.set(file.path, { sha256: hash(file.content) });
    setParts(parts, file.path, file.parts);
    messages.push(`Wrote ${file.path}`);
  }
  for (const link of prepared.symlinks) {
    writes.push({ path: link.path, symlink: link.target });
    records.set(link.path, { symlink: link.target });
    setParts(parts, link.path, link.parts);
    messages.push(`Linked ${link.path} -> ${link.target}`);
  }
  manifest.files = Object.fromEntries(records);
  parseHarnessManifest(manifest);
  writes.push({
    path: MANIFEST_PATH,
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  });
  await applyWrites(target, writes);
  return { messages, conflicts: [] };
}

async function merge(base: string, current: string, next: string) {
  const directory = await mkdtemp(join(tmpdir(), "meta-harness-merge-"));
  try {
    const paths = ["current", "base", "new"].map((name) =>
      join(directory, name),
    );
    await Promise.all(
      [current, base, next].map((content, index) =>
        writeFile(paths[index] ?? "", content),
      ),
    );
    const result = Bun.spawnSync([
      "git",
      "merge-file",
      "-p",
      "-L",
      "current",
      "-L",
      "baseline",
      "-L",
      "new",
      ...paths,
    ]);
    const validExit =
      result.exitCode !== null &&
      Number.isInteger(result.exitCode) &&
      result.exitCode >= 0 &&
      result.exitCode <= 127 &&
      !result.signalCode;
    if (!validExit)
      throw new Error(
        `git merge-file failed (exit ${result.exitCode}, signal ${result.signalCode ?? "none"}): ${result.stderr.toString()}`,
      );
    return {
      content: result.stdout.toString(),
      conflict: result.exitCode !== 0,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

type EntryChange =
  | { kind: "applied"; writes: Write[]; record: FileRecord; message: string }
  | { kind: "conflict"; writes: Write[]; message: string };

function regularChange(
  entry: PreparedFile,
  content: string,
  message: string,
): EntryChange {
  return {
    kind: "applied",
    message,
    record: { sha256: hash(content) },
    writes: [
      { path: entry.path, content },
      { path: `${BASELINE_DIRECTORY}/${entry.path}`, content: entry.content },
    ],
  };
}

async function entryChange(
  entry: PreparedFile | PreparedLink,
  current: DiskFile,
  previous: FileRecord | undefined,
  target: string,
): Promise<EntryChange> {
  const typeConflict: EntryChange = {
    kind: "conflict",
    writes: [],
    message: `Conflict: ${entry.path} changed type or symlink target; left untouched`,
  };
  if ("target" in entry) {
    if (previous && !matches(current, previous)) return typeConflict;
    return {
      kind: "applied",
      writes: [{ path: entry.path, symlink: entry.target }],
      record: { symlink: entry.target },
      message: `Linked ${entry.path} -> ${entry.target}`,
    };
  }
  if (!previous)
    return regularChange(entry, entry.content, `Wrote ${entry.path}`);
  if (!("sha256" in previous)) {
    if (!matches(current, previous)) return typeConflict;
    return regularChange(
      entry,
      entry.content,
      `Replaced unchanged ${entry.path}`,
    );
  }
  if (current.kind !== "file") return typeConflict;
  const baseline = await diskFile(
    await safePath(target, `${BASELINE_DIRECTORY}/${entry.path}`),
  );
  if (baseline.kind !== "file") {
    if (matches(current, previous))
      return regularChange(
        entry,
        entry.content,
        `Replaced unchanged ${entry.path} (baseline recreated)`,
      );
    return {
      kind: "conflict",
      writes: [],
      message: `Conflict: ${entry.path} has user edits and no regular baseline; left untouched`,
    };
  }
  if (current.content === baseline.content)
    return regularChange(
      entry,
      entry.content,
      `Replaced unchanged ${entry.path}`,
    );
  if (hasConflictMarkers(current.content)) {
    return {
      kind: "conflict",
      writes: [],
      message: `Conflict: ${entry.path} still has unresolved markers; left untouched`,
    };
  }
  const result = await merge(baseline.content, current.content, entry.content);
  if (result.conflict)
    return {
      kind: "conflict",
      writes: [
        { path: entry.path, content: result.content },
        { path: `${BASELINE_DIRECTORY}/${entry.path}`, content: entry.content },
      ],
      message: `Conflict: ${entry.path} (conflict markers written; generator baseline advanced)`,
    };
  return regularChange(entry, result.content, `Merged ${entry.path}`);
}

export async function update(options: ApplyOptions): Promise<ApplyReport> {
  const target = resolve(options.target);
  const packageRoot = options.packageRoot ?? PACKAGE_ROOT;
  const { manifest: old } = await readHarness(target, packageRoot);
  const { plan, pack } = await loadPlan(options.planPath, packageRoot);
  const prepared = await prepare(plan, pack, target);
  const manifest = await newManifest(pack, plan, packageRoot, old);
  const records = new Map(Object.entries(old.files));
  const parts = manifest.parts;
  if (!parts) throw new Error("Missing parts mapping");
  const deleted = new Set(old.deleted ?? []);
  const writes: Write[] = [];
  const messages: string[] = [];
  const conflicts: string[] = [];
  const plannedPaths = new Set(
    [...prepared.files, ...prepared.symlinks].map((entry) => entry.path),
  );
  for (const path of records.keys()) {
    if (plannedPaths.has(path)) continue;
    const current = await diskFile(await safePath(target, path));
    if (current.kind !== "missing") continue;
    records.delete(path);
    deleted.add(path);
    setParts(parts, path, []);
    messages.push(`Deleted by user; kept absent: ${path}`);
  }
  for (const entry of [...prepared.files, ...prepared.symlinks]) {
    const current = await diskFile(await safePath(target, entry.path));
    const previous = records.get(entry.path);
    if ((previous || deleted.has(entry.path)) && current.kind === "missing") {
      deleted.add(entry.path);
      records.delete(entry.path);
      setParts(parts, entry.path, []);
      messages.push(`Deleted by user; kept absent: ${entry.path}`);
      continue;
    }
    if (!previous && current.kind !== "missing" && !entry.adopted)
      throw new Error(
        `${entry.path}: existing untracked file requires adopted: true`,
      );
    deleted.delete(entry.path);
    const change = await entryChange(entry, current, previous, target);
    writes.push(...change.writes);
    messages.push(change.message);
    if (change.kind === "conflict") {
      conflicts.push(entry.path);
      continue;
    }
    records.set(entry.path, change.record);
    setParts(parts, entry.path, entry.parts);
  }
  manifest.files = Object.fromEntries(records);
  manifest.deleted = [...deleted].sort();
  parseHarnessManifest(manifest);
  writes.push({
    path: MANIFEST_PATH,
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  });
  await applyWrites(target, writes);
  return { messages, conflicts };
}
