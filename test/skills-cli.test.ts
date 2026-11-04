import { expect, test } from "bun:test";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

test("skills use the installed CLI and document a portable bundled fallback", async () => {
  const skillFiles: string[] = [];
  for await (const path of new Bun.Glob("skills/**/SKILL.md").scan(root)) {
    skillFiles.push(path);
  }

  for (const path of skillFiles) {
    const content = await Bun.file(join(root, path)).text();
    expect(content, path).not.toContain("src/cli.ts");
    expect(content, path).not.toMatch(/bun run[^\n]*cli\.ts/);
    expect(content, path).toContain("meta-harness");
    expect(content, path).toContain("cli.md");
  }

  const fallback = await Bun.file(join(root, "skills/cli.md")).text();
  expect(fallback).toContain("bin.meta-harness");
  expect(fallback).toContain("--no-env-file");
  expect(fallback).toContain("hook.bunfig.toml");
  expect(fallback).toContain("${CLAUDE_PLUGIN_ROOT}");
  expect(fallback).toContain("currently loaded `SKILL.md`");
  expect(fallback).toContain(
    "does not document that substitution for skill instructions",
  );
});
