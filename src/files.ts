import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readlink,
  rename,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { relativeFile, RESERVED_PATH_PATTERN } from "./schema.ts";

const reservedPath = new RegExp(RESERVED_PATH_PATTERN);

export type DiskFile =
  | { kind: "file"; content: string; mode: number }
  | { kind: "symlink"; target: string }
  | { kind: "missing" };
export type Write =
  { path: string; content: string } | { path: string; symlink: string };
export const MANIFEST_PATH = ".harness/manifest.json";
export const BASELINE_DIRECTORY = ".harness/baseline";
export const PENDING_PATH = ".harness/pending.json";

export function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function diskFile(path: string): Promise<DiskFile> {
  const info = await lstat(path).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  });
  if (!info) return { kind: "missing" };
  if (info.isSymbolicLink())
    return { kind: "symlink", target: await readlink(path) };
  if (info.isFile())
    return {
      kind: "file",
      content: await readFile(path, "utf8"),
      mode: info.mode,
    };
  throw new Error(`${path}: expected a regular file or symlink`);
}

export async function safePath(root: string, path: string): Promise<string> {
  const fullPath = join(root, path);
  let parent = dirname(fullPath);
  while (true) {
    const info = await lstat(parent).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return undefined;
      throw error;
    });
    if (info && (!info.isDirectory() || info.isSymbolicLink()))
      throw new Error(`${parent}: refusing a symlink or non-directory parent`);
    if (parent === root) break;
    parent = dirname(parent);
  }
  return fullPath;
}

export function symlinkDestination(
  root: string,
  path: string,
  target: string,
): string {
  const destination = resolve(root, dirname(path), target);
  const withinRoot = relative(root, destination);
  if (
    !withinRoot ||
    withinRoot === ".." ||
    withinRoot.startsWith(`..${sep}`) ||
    withinRoot.startsWith(`${sep}`)
  ) {
    throw new Error(
      `${path}: symlink target must stay inside the target directory`,
    );
  }
  relativeFile(withinRoot, `${path} symlink target`);
  if (reservedPath.test(withinRoot))
    throw new Error(`${path}: symlink target is reserved`);
  return withinRoot;
}

export function hasConflictMarkers(content: string): boolean {
  return /^(?:<{7}|>{7})(?: |$)/m.test(content);
}

function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

export async function assertReady(root: string): Promise<void> {
  await safePath(root, MANIFEST_PATH);
  if ((await diskFile(join(root, PENDING_PATH))).kind !== "missing") {
    throw new Error(
      `${PENDING_PATH}: interrupted apply detected.\n` +
        `1. Back up ${shellQuote(root)}, including .harness, before repairing it.\n` +
        "2. Restore incomplete target files and baselines from a pre-run backup or version control; verify .harness/manifest.json describes the restored files.\n" +
        "3. After restoring a consistent state, remove only the marker:\n" +
        `   rm -- ${shellQuote(join(root, PENDING_PATH))}\n` +
        "4. Rerun the original init/update command, then verify:\n" +
        `   meta-harness check --target ${shellQuote(root)}`,
    );
  }
}

async function atomicWrite(root: string, write: Write): Promise<void> {
  const destination = await safePath(root, write.path);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = join(dirname(destination), `.meta-harness-${randomUUID()}`);
  try {
    if ("symlink" in write) await symlink(write.symlink, temporary);
    else {
      const current = await diskFile(destination);
      const mode = current.kind === "file" ? current.mode : 0o644;
      await writeFile(temporary, write.content, { flag: "wx", mode });
    }
    await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return;
      throw error;
    });
  }
}

export async function applyWrites(
  root: string,
  writes: Write[],
): Promise<void> {
  for (const write of writes) await safePath(root, write.path);
  await mkdir(join(root, ".harness"), { recursive: true });
  const journal = join(root, PENDING_PATH);
  await writeFile(journal, "", { flag: "wx" });
  for (const write of writes) await atomicWrite(root, write);
  await unlink(journal);
}
