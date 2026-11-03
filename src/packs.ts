import { join } from "node:path";
import {
  compileProfileSchema,
  parsePackManifest,
  parsePlan,
} from "./schema.ts";

export const PACKAGE_ROOT = join(import.meta.dir, "..");

export async function loadPack(name: string, packageRoot = PACKAGE_ROOT) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
    throw new Error("Pack name must be a lowercase slug");
  const root = join(packageRoot, "packs", name);
  const manifest = parsePackManifest(
    await Bun.file(join(root, "pack.json")).json(),
  );
  if (manifest.name !== name)
    throw new Error(`Pack name ${manifest.name} does not match ${name}`);
  const profileSchema = await Bun.file(
    join(root, manifest.profileSchema),
  ).json();
  const profileValidator = compileProfileSchema(profileSchema);
  return { root, manifest, profileValidator };
}
export type LoadedPack = Awaited<ReturnType<typeof loadPack>>;

export async function loadPlan(
  path: string,
  packageRoot = PACKAGE_ROOT,
  packName?: string,
) {
  const plan = parsePlan(await Bun.file(path).json());
  const pack = await loadPack(packName ?? plan.pack, packageRoot);
  if (plan.pack !== pack.manifest.name)
    throw new Error(
      `Plan pack ${plan.pack} does not match ${pack.manifest.name}`,
    );
  const [valid, errors] = pack.profileValidator.Errors(plan.profile);
  if (!valid)
    throw new Error(
      `profile: ${errors.map((error) => `${error.instancePath}: ${error.message}`).join("; ")}`,
    );
  const paths = [...plan.files, ...plan.symlinks].map((entry) =>
    entry.path.toLowerCase(),
  );
  if (new Set(paths).size !== paths.length)
    throw new Error("Plan contains duplicate paths");
  for (const path of paths) {
    if (paths.some((other) => other.startsWith(`${path}/`)))
      throw new Error(`${path}: plan paths overlap`);
  }
  return { plan, pack };
}

export async function knowledgeEntry(pack: LoadedPack): Promise<string> {
  if (!pack.manifest.changelog)
    return `${pack.manifest.name}@${pack.manifest.version}`;
  const changelog = await Bun.file(
    join(pack.root, pack.manifest.changelog),
  ).text();
  const heading = /^## (.+)$/m.exec(changelog)?.[1];
  if (!heading) throw new Error("Pack changelog has no entry heading");
  return heading;
}
