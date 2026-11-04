import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const packagePath = join(resolve(import.meta.dirname, ".."), "package.json");
const packageManifest = JSON.parse(await readFile(packagePath, "utf8"));
const expectedTag = `v${packageManifest.version}`;

if (process.env.GITHUB_REF_NAME !== expectedTag) {
  throw new Error(
    `Release tag ${process.env.GITHUB_REF_NAME ?? "<missing>"} must match ${expectedTag}`,
  );
}
