import { constants } from "node:fs";
import { lstat, open, readlink } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { isOwnerPath, readHarness } from "./apply.ts";
import {
  applyWrites,
  BASELINE_DIRECTORY,
  hash,
  MANIFEST_PATH,
  safePath,
  symlinkDestination,
  type Write,
} from "./files.ts";
import { PACKAGE_ROOT } from "./packs.ts";
import { parseHarnessManifest, relativeFile } from "./schema.ts";

export async function approve(
  path: string,
  targetPath: string,
  packageRoot = PACKAGE_ROOT,
): Promise<string> {
  relativeFile(path, "approve path");
  const target = resolve(targetPath);
  const { manifest, packs } = await readHarness(target, packageRoot);
  const record = Object.hasOwn(manifest.files, path)
    ? manifest.files[path]
    : undefined;
  if (!record || (record.mode !== "owner" && !isOwnerPath(path, packs)))
    throw new Error(`${path}: only a declared owner file can be approved`);
  const filePath = await safePath(target, path);
  const info = await lstat(filePath);
  const writes: Write[] = [];
  if ("sha256" in record) {
    if (!info.isFile())
      throw new Error(`${path}: expected a regular owner file, not a symlink`);
    const file = await open(
      filePath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      if (!(await file.stat()).isFile())
        throw new Error(`${path}: expected a regular owner file`);
      const content = await file.readFile("utf8");
      manifest.files[path] = { sha256: hash(content), mode: "owner" };
      writes.push({ path: `${BASELINE_DIRECTORY}/${path}`, content });
    } finally {
      await file.close();
    }
  } else {
    if (!info.isSymbolicLink())
      throw new Error(`${path}: expected an owner symlink`);
    const destination = (await readlink(filePath)).split(sep).join("/");
    symlinkDestination(target, path, destination);
    manifest.files[path] = { symlink: destination, mode: "owner" };
  }
  parseHarnessManifest(manifest);
  writes.push({
    path: MANIFEST_PATH,
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  });
  await applyWrites(target, writes);
  return `Approved owner file: ${path}`;
}
