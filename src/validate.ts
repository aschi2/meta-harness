import { stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parsePackManifest, reviewedDate } from "./schema.ts";

export interface ValidationResult {
  manifests: string[];
  errors: string[];
}

export async function validate(path: string): Promise<ValidationResult> {
  const root = resolve(path);
  const manifests: string[] = [];
  const errors: string[] = [];
  try {
    if (await Bun.file(join(root, "pack.json")).exists()) {
      manifests.push(join(root, "pack.json"));
    } else {
      const packs = join(root, "packs");
      const searchRoot = await stat(packs).then(
        () => packs,
        () => root,
      );
      for await (const file of new Bun.Glob("**/pack.json").scan({
        cwd: searchRoot,
        absolute: true,
      })) {
        manifests.push(file);
      }
    }
    manifests.sort();
    if (manifests.length === 0)
      errors.push(`${root}: no pack.json files found`);
    for (const manifestPath of manifests) {
      try {
        const input: unknown = await Bun.file(manifestPath).json();
        const pack = parsePackManifest(input);
        const packRoot = dirname(manifestPath);
        const references = new Set([
          ...pack.knowledge,
          ...pack.templates,
          ...pack.checkers,
          ...pack.researchTopics.map((topic) => topic.path),
        ]);
        for (const reference of references) {
          const filePath = join(packRoot, reference);
          const isFile = await stat(filePath).then(
            (info) => info.isFile(),
            () => false,
          );
          if (!isFile)
            errors.push(
              `${manifestPath}: referenced file does not exist: ${reference}`,
            );
        }
        for (const topic of pack.researchTopics) {
          const file = Bun.file(join(packRoot, topic.path));
          if (!(await file.exists())) continue;
          const content = await file.text();
          const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(
            content,
          )?.[1];
          const reviewed = /^reviewed:\s*([^\r\n]+)$/m
            .exec(frontmatter ?? "")?.[1]
            ?.trim();
          try {
            reviewedDate(reviewed, `${topic.path} reviewed`);
            if (reviewed !== topic.reviewed) {
              errors.push(
                `${manifestPath}: ${topic.path} reviewed date differs from researchTopics`,
              );
            }
          } catch (error) {
            errors.push(`${manifestPath}: ${errorMessage(error)}`);
          }
        }
      } catch (error) {
        errors.push(`${manifestPath}: ${errorMessage(error)}`);
      }
    }
  } catch (error) {
    errors.push(`${root}: ${errorMessage(error)}`);
  }
  return { manifests, errors };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
