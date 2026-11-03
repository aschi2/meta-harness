import { expect, test } from "bun:test";
import { frontmatter } from "../src/frontmatter.ts";
import { parsePlan, relativeFile, parsePackManifest } from "../src/schema.ts";
import { join } from "node:path";

test("UTF-8 BOM is stripped before frontmatter parsing and body slicing", () => {
  expect(frontmatter("\uFEFF---\r\ntype: source\r\n---\r\nBody\r\n")).toEqual({
    metadata: { type: "source" },
    body: "Body",
  });
});

test.each([
  "file.",
  "docs /guide.md",
  "docs/guide.md ",
  "CON",
  "con.txt",
  "docs/PRN.md",
  "AUX.json",
  "NUL.txt",
  "COM1.log",
  "com9",
  "LPT1.md",
  "lpt9/name.md",
])(
  "Windows-incompatible path %s is rejected at every schema boundary",
  async (path) => {
    expect(() => relativeFile(path, "path")).toThrow();
    const plan = await Bun.file(
      join(import.meta.dir, "fixtures/plan.json"),
    ).json();
    plan.files[0].path = path;
    expect(() => parsePlan(plan)).toThrow();
    const pack = await Bun.file(
      join(import.meta.dir, "../packs/coding/pack.json"),
    ).json();
    pack.checkers = [path];
    expect(() => parsePackManifest(pack)).toThrow();
  },
);

test.each([
  "docs/guide.md",
  ".config/file.json",
  "console.txt",
  "COM10.md",
  "LPT0.log",
])("portable non-device path %s remains valid", (path) => {
  expect(relativeFile(path, "path")).toBe(path);
});
