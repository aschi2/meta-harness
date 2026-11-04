import { lstat, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { configDirectory } from "./config.ts";
import { loadPackAt, type LoadedPack } from "./packs.ts";
import { validate } from "./validate.ts";

export function overlayDirectory(override?: string): string {
  return resolve(
    override ??
      process.env.META_HARNESS_OVERLAY ??
      join(configDirectory(), "overlay"),
  );
}

export async function overlayPacks(override?: string): Promise<LoadedPack[]> {
  const root = overlayDirectory(override);
  const exists = await lstat(root).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  });
  if (!exists) return [];
  const result = await validate(root);
  if (result.manifests.length === 0 && exists.isDirectory()) return [];
  if (result.errors.length)
    throw new Error(`Overlay invalid: ${result.errors.join("; ")}`);
  const packs: LoadedPack[] = [];
  for (const path of result.manifests) {
    const pack = await loadPackAt(await realpath(dirname(path)));
    if (pack.manifest.overlay !== true)
      throw new Error(
        `Overlay invalid: ${path}: overlay pack must declare overlay: true`,
      );
    packs.push(pack);
  }
  return packs;
}

export async function overlayPreferences(
  override?: string,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  const profile: Record<string, unknown> = {};
  for (const pack of await overlayPacks(override)) {
    const preferences = pack.manifest.preferences ?? {};
    Object.assign(result, preferences);
    const defaults = preferences.profile;
    if (
      typeof defaults === "object" &&
      defaults !== null &&
      !Array.isArray(defaults)
    )
      Object.assign(profile, defaults);
  }
  if (Object.keys(profile).length) result.profile = profile;
  return result;
}
