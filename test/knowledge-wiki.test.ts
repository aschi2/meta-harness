import { afterEach, expect, spyOn, test } from "bun:test";
import * as filesystem from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  wikiLint,
  type Finding,
} from "../packs/knowledge-wiki/checkers/wiki-lint.ts";
import { init } from "../src/apply.ts";
import { check } from "../src/check.ts";
import { loadPack } from "../src/packs.ts";
import { loadRole, renderPrompt } from "../src/roles.ts";
import {
  HARNESS_PARTS,
  parseHarnessManifest,
  parsePlan,
} from "../src/schema.ts";
import { validate } from "../src/validate.ts";
import { INTEGRATION_TIMEOUT_MS } from "./constants.ts";

const root = join(import.meta.dir, "..");
const fixtures = join(import.meta.dir, "fixtures/knowledge-wiki");
const packRoot = join(root, "packs/knowledge-wiki");
const checker = join(packRoot, "checkers/wiki-lint.ts");
const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0))
    await filesystem.rm(directory, { recursive: true, force: true });
});

async function workspace(copyFixture = true) {
  const directory = await filesystem.mkdtemp(join(tmpdir(), "wiki-synthetic-"));
  directories.push(directory);
  const target = join(directory, "target");
  if (copyFixture)
    await filesystem.cp(join(fixtures, "pass"), target, { recursive: true });
  else await filesystem.mkdir(target);
  return { directory, target };
}

async function write(target: string, path: string, content: string) {
  await filesystem.mkdir(dirname(join(target, path)), { recursive: true });
  await filesystem.writeFile(join(target, path), content);
}

function git(directory: string, ...args: string[]) {
  const result = Bun.spawnSync(["git", "-C", directory, ...args]);
  expect(result.exitCode, result.stderr.toString()).toBe(0);
}

function gitBaseline(directory: string) {
  git(directory, "init", "-q");
  git(directory, "add", ".");
  git(
    directory,
    "-c",
    "user.name=Synthetic Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    "Synthetic baseline",
  );
}

function cli(target: string, explicitTarget = false) {
  return Bun.spawnSync(
    [process.execPath, checker, ...(explicitTarget ? [target] : [])],
    {
      cwd: explicitTarget ? root : target,
      timeout: 10_000,
    },
  );
}

test(
  "synthetic wiki passes through cross-page links and both CLI target modes",
  async () => {
    const { target } = await workspace();
    expect(await wikiLint(target)).toEqual([]);
    for (const explicit of [false, true]) {
      const result = cli(target, explicit);
      expect(result.exitCode, result.stderr.toString()).toBe(0);
      expect(JSON.parse(result.stdout.toString())).toEqual({
        counts: {},
        findings: [],
      });
      expect(result.stderr.toString()).toBe("");
    }
  },
  INTEGRATION_TIMEOUT_MS,
);

test.each(["wiki/index.md", "wiki/sources/example.md", "wiki/log.md"])(
  "invalid frontmatter on %s does not create cascading link or orphan findings",
  async (path) => {
    const { target } = await workspace();
    const original = await filesystem.readFile(join(target, path), "utf8");
    await write(
      target,
      path,
      original.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ""),
    );
    expect(await wikiLint(target)).toEqual([{ rule: "frontmatter", path }]);
  },
);

test.each([
  "frontmatter",
  "raw-reference",
  "index-link",
  "orphan-page",
  "log-order",
  "raw-immutable",
  "unsafe-path",
])(
  "one failing synthetic fixture for %s",
  async (name) => {
    const { target } = await workspace();
    const fixture: { rule: Finding["rule"]; path: string; content: string } =
      await Bun.file(join(fixtures, `${name}.json`)).json();
    if (name === "raw-immutable") gitBaseline(target);
    await write(target, fixture.path, fixture.content);
    const expected = [{ rule: fixture.rule, path: fixture.path }];
    expect(await wikiLint(target)).toEqual(expected);
    const result = cli(target);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout.toString())).toEqual({
      counts: { [fixture.rule]: 1 },
      findings: expected,
    });
    expect(result.stdout.toString()).not.toContain(target);
    expect(result.stdout.toString()).not.toContain(fixture.content);
    expect(result.stderr.toString()).toBe("");
  },
  INTEGRATION_TIMEOUT_MS,
);

test.each([
  "# Missing frontmatter",
  "---\n- sequence\n---\n",
  "---\nscalar\n---\n",
  "---\n\n---\n",
])("frontmatter requires a syntactic YAML mapping: %s", async (content) => {
  const { target } = await workspace();
  await write(target, "wiki/analysis/overview.md", content);
  expect(await wikiLint(target)).toContainEqual({
    rule: "frontmatter",
    path: "wiki/analysis/overview.md",
  });
});

test.each([
  "raw: raw/paper.txt",
  "source: ../../raw/paper.txt",
  "sources: [raw/paper.txt]",
  "sources:\n  files: [raw/paper.txt]",
  "source:\n  file: raw/paper.txt",
  "raw:\n  - path: raw/paper.txt",
  "raw: &source\n  path: raw/paper.txt\n  raw: *source",
])("source and analysis accept generic raw metadata: %s", async (metadata) => {
  const { target } = await workspace();
  await write(
    target,
    "wiki/analysis/overview.md",
    `---\n${metadata}\n---\n# Synthetic analysis\n`,
  );
  expect(await wikiLint(target)).toEqual([]);
});

test("type-marked pages require raw provenance outside conventional directories", async () => {
  const { target } = await workspace();
  await write(
    target,
    "wiki/topic.md",
    "---\nkind: source\nsources: [https://example.invalid]\n---\n# Synthetic topic\n",
  );
  await write(
    target,
    "wiki/index.md",
    "---\n{}\n---\n[Source](sources/example.md)\n[Topic](topic.md)\n",
  );
  expect(await wikiLint(target)).toEqual([
    { rule: "raw-reference", path: "wiki/topic.md" },
  ]);
});

test("inline, reference, wiki and encoded-space links resolve; example code is ignored", async () => {
  const { target } = await workspace();
  await write(
    target,
    "wiki/space page.md",
    "---\n{}\n---\n# Synthetic space\n",
  );
  await write(
    target,
    "wiki/index.md",
    `---\n{}\n---\n[Source][source]\n\n[source]: <sources/example.md>\n[Space](space%20page.md#heading \"Title\")\n[[analysis/overview|Analysis]]\n\n\`[Not a link](missing.md)\`\n\n\`\`\`markdown\n[Example](missing.md)\n\`\`\`\n`,
  );
  await write(
    target,
    "wiki/analysis/overview.md",
    "---\ntype: analysis\n---\n[Raw][evidence]\n\n[evidence]: ../../raw/paper.txt\n",
  );
  expect(await wikiLint(target)).toEqual([]);
});

test("disconnected page cycles remain orphaned", async () => {
  const { target } = await workspace();
  await write(target, "wiki/first.md", "---\n{}\n---\n[Second](second.md)\n");
  await write(target, "wiki/second.md", "---\n{}\n---\n[First](first.md)\n");
  expect(await wikiLint(target)).toEqual([
    { rule: "orphan-page", path: "wiki/first.md" },
    { rule: "orphan-page", path: "wiki/second.md" },
  ]);
});

test.each([
  "## undated entry",
  "## 2026-02-30 invalid date",
  "## 2026-13-01 invalid month",
])("log dates must be real ISO dates: %s", async (entry) => {
  const { target } = await workspace();
  await write(target, "wiki/log.md", `---\n{}\n---\n# Log\n\n${entry}\n`);
  expect(await wikiLint(target)).toEqual([
    { rule: "log-order", path: "wiki/log.md" },
  ]);
});

test("newest-first heading logs allow bullets, equal dates and empty initial logs", async () => {
  const { target } = await workspace();
  for (const body of [
    "",
    "## 2026-11-03 one\n- Ordinary detail without a date\n## [2026-11-03] two\n## 2026-11-02 three\n",
  ]) {
    await write(target, "wiki/log.md", `---\n{}\n---\n# Log\n\n${body}`);
    expect(await wikiLint(target)).toEqual([]);
  }
});

test.each(["staged-modification", "deleted", "staged-deletion", "renamed"])(
  "real Git raw immutability rejects %s in temporary repositories",
  async (operation) => {
    const { target } = await workspace();
    await write(
      target,
      "raw/unreferenced source name.txt",
      "Synthetic baseline.\n",
    );
    gitBaseline(target);
    const path = "raw/unreferenced source name.txt";
    if (operation === "staged-modification") {
      await write(target, path, "Synthetic changed.\n");
      git(target, "add", "--", path);
    } else if (operation === "deleted") await filesystem.rm(join(target, path));
    else if (operation === "staged-deletion") git(target, "rm", "--", path);
    else if (operation === "renamed")
      git(target, "mv", "--", path, "raw/renamed.txt");
    else {
      await write(target, "raw/new.txt", "Synthetic new.\n");
      if (operation === "staged-addition") git(target, "add", "raw/new.txt");
    }
    const findings = await wikiLint(target);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every(({ rule }) => rule === "raw-immutable")).toBe(true);
    if (operation === "renamed")
      expect(findings).toEqual([{ rule: "raw-immutable", path }]);
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "Git paths work under a repository subdirectory and allow inbox additions",
  async () => {
    const { directory, target } = await workspace();
    gitBaseline(directory);
    await write(target, "raw/inbox/new.txt", "Synthetic inbox.\n");
    expect(await wikiLint(target)).toEqual([]);
    await write(target, "raw/paper.txt", "Synthetic modified.\n");
    expect(await wikiLint(target)).toEqual([
      { rule: "raw-immutable", path: "raw/paper.txt" },
    ]);
  },
  INTEGRATION_TIMEOUT_MS,
);

test.each([
  "../../../outside.md",
  "%2e%2e/%2e%2e/%2e%2e/outside.md",
  "file:///outside.md",
  "/outside.md",
  "../../.env",
  "../../raw/receipts/private.md",
])(
  "escaping and private links are rejected without disclosing destinations: %s",
  async (link) => {
    const { target } = await workspace();
    await write(
      target,
      "wiki/analysis/overview.md",
      `---\nraw: raw/paper.txt\n---\n[Unsafe](${link})\n`,
    );
    expect(await wikiLint(target)).toEqual([
      { rule: "unsafe-path", path: "wiki/analysis/overview.md" },
    ]);
  },
);

test("page, directory, and raw-reference symlinks are rejected without following them", async () => {
  const { directory, target } = await workspace();
  const outside = join(directory, "outside");
  await filesystem.mkdir(outside);
  await filesystem.writeFile(
    join(outside, "private.md"),
    "Synthetic invalid frontmatter marker.\n",
  );
  await filesystem.symlink(
    join(outside, "private.md"),
    join(target, "wiki/linked.md"),
  );
  await filesystem.symlink(
    outside,
    join(target, "wiki/linked-directory"),
    "dir",
  );
  await filesystem.symlink(
    outside,
    join(target, "raw/linked-directory"),
    "dir",
  );
  await write(
    target,
    "wiki/analysis/overview.md",
    "---\nraw: raw/linked-directory/private.md\n---\n# Synthetic\n",
  );
  expect(await wikiLint(target)).toEqual([
    { rule: "raw-reference", path: "wiki/analysis/overview.md" },
    { rule: "unsafe-path", path: "wiki/analysis/overview.md" },
    { rule: "unsafe-path", path: "wiki/linked-directory" },
    { rule: "unsafe-path", path: "wiki/linked.md" },
  ]);
  await filesystem.rm(join(target, "wiki"), { recursive: true });
  await filesystem.symlink(outside, join(target, "wiki"), "dir");
  expect(await wikiLint(target)).toContainEqual({
    rule: "unsafe-path",
    path: "wiki",
  });
});

test("checker reads only wiki pages, never raw contents or excluded private trees", async () => {
  const { target } = await workspace();
  for (const path of [
    "wiki/.env.md",
    "wiki/.envrc.md",
    "wiki/receipts/private.md",
    "wiki/tmp/private.md",
    "wiki/raw/private.md",
  ])
    await write(target, path, "Synthetic invalid frontmatter marker.\n");
  const readFile = filesystem.readFile;
  const reader = spyOn(filesystem, "readFile");
  try {
    expect(await wikiLint(target)).toEqual([]);
    expect(reader).toHaveBeenCalled();
    for (const [path] of reader.mock.calls) {
      expect(String(path)).toStartWith(join(target, "wiki"));
      expect(String(path)).not.toMatch(
        /(?:^|\/)(?:raw|receipts|tmp|\.env[^/]*)(?:\/|$)/,
      );
    }
    expect(filesystem.readFile).not.toBe(readFile);
  } finally {
    reader.mockRestore();
  }
});

test("knowledge-wiki pack, profile, research dates, and all three role contracts validate", async () => {
  expect((await validate(packRoot)).errors).toEqual([]);
  const pack = await loadPack("knowledge-wiki");
  const plan = parsePlan(await Bun.file(join(fixtures, "plan.json")).json());
  expect(pack.profileValidator.Check(plan.profile)).toBe(true);
  for (const key of ["sourceTypes", "ingestCadence", "approveEdits"]) {
    const profile = { ...plan.profile };
    delete profile[key];
    expect(pack.profileValidator.Check(profile)).toBe(false);
  }
  const unidentified = { ...plan.profile };
  delete unidentified.domain;
  delete unidentified.topic;
  expect(pack.profileValidator.Check(unidentified)).toBe(false);
  expect(
    pack.profileValidator.Check({ ...plan.profile, approveEdits: "true" }),
  ).toBe(false);
  expect(
    pack.profileValidator.Check({ ...plan.profile, sourceTypes: [] }),
  ).toBe(false);
  const roles = await Promise.all(
    (pack.manifest.maintenance ?? []).map((path) => loadRole(pack.root, path)),
  );
  expect(roles.map(({ id }) => id)).toEqual([
    "inbox-ingest",
    "wiki-lint-fixer",
    "stale-page-review",
  ]);
  for (const role of roles) {
    expect(role.perRun.maxPullRequests).toBe(1);
    expect(role.perRun.maxChangedLines).toBeGreaterThan(0);
    expect(role.requiredEvidence.length).toBeGreaterThan(0);
    expect(role.sources.length).toBeGreaterThan(0);
    expect(renderPrompt(role)).toContain(
      "Never delete a test that can fail or code not proven unreachable.",
    );
    expect(role.neverDo.join(" ")).toContain(
      "Delete a test that can fail or code not proven unreachable.",
    );
  }
});

test.each(["domain", "topic"])(
  "profile accepts %s alone and on-demand cadence",
  async (identifier) => {
    const pack = await loadPack("knowledge-wiki");
    expect(
      pack.profileValidator.Check({
        [identifier]: "Synthetic topic",
        sourceTypes: ["paper"],
        ingestCadence: "on-demand",
        approveEdits: true,
      }),
    ).toBe(true);
  },
);

test(
  "full fixture-plan init creates baselines and all parts, then core check runs the Bun checker",
  async () => {
    const { directory, target } = await workspace(false);
    await write(target, "raw/paper.txt", "");
    const plan = parsePlan(await Bun.file(join(fixtures, "plan.json")).json());
    for (const file of plan.files)
      if ("variables" in file && file.path === "AGENTS.md")
        file.variables.checker_command = `${process.execPath} ${checker}`;
    const planPath = join(directory, "plan.json");
    await Bun.write(planPath, JSON.stringify(plan));
    expect(
      (await init({ planPath, target, packName: "knowledge-wiki" })).conflicts,
    ).toEqual([]);
    const manifest = parseHarnessManifest(
      await Bun.file(join(target, ".harness/manifest.json")).json(),
    );
    expect(manifest.profile).toEqual(plan.profile);
    expect(manifest.packs?.map(({ name }) => name).sort()).toEqual([
      "base",
      "knowledge-wiki",
    ]);
    for (const part of HARNESS_PARTS)
      expect(manifest.parts?.[part].length).toBeGreaterThan(0);
    for (const file of plan.files) {
      const content = await filesystem.readFile(
        join(target, file.path),
        "utf8",
      );
      if (file.mode === "seed") {
        expect(manifest.files[file.path]).toBeUndefined();
        expect(manifest.seedFiles).toContain(file.path);
        continue;
      }
      expect(
        await filesystem.readFile(
          join(target, ".harness/baseline", file.path),
          "utf8",
        ),
      ).toBe(content);
      expect(content).not.toContain("{{");
      expect(manifest.files[file.path]).toEqual({
        ...(file.mode === "owner" ? { mode: "owner" } : {}),
        sha256: new Bun.CryptoHasher("sha256").update(content).digest("hex"),
      });
    }
    expect(manifest.files["raw/paper.txt"]).toBeUndefined();
    expect(await filesystem.readlink(join(target, "CLAUDE.md"))).toBe(
      "AGENTS.md",
    );
    const report = await check(target);
    expect(report.errors).toEqual([]);
    expect(report.messages).toContain(
      "Checker knowledge-wiki/checkers/wiki-lint.ts: exit 0",
    );
    expect(await wikiLint(target)).toEqual([]);
    await write(
      target,
      "wiki/analysis/overview.md",
      "---\ntype: analysis\n---\n# Synthetic missing raw reference\n",
    );
    const failed = await check(target);
    expect(failed.errors).toContain(
      "Checker knowledge-wiki/checkers/wiki-lint.ts: exit 1",
    );
    expect(failed.messages.join("\n")).toContain('"raw-reference"');
  },
  INTEGRATION_TIMEOUT_MS,
);

test.each([
  "<!-- [Hidden](../../raw/paper.txt) -->",
  "    [Hidden](../../raw/paper.txt)",
  "`[Hidden](../../raw/paper.txt)`",
  "<!-- [[paper.txt]] -->",
  "    [[paper.txt]]",
])("CommonMark excludes fake provenance in %s", async (body) => {
  const { target } = await workspace();
  await write(
    target,
    "wiki/analysis/overview.md",
    `---\ntype: analysis\n---\n${body}\n`,
  );
  expect(await wikiLint(target)).toContainEqual({
    rule: "raw-reference",
    path: "wiki/analysis/overview.md",
  });
});

test.each(["skip-worktree", "assume-unchanged"])(
  "raw %s index flags are errors even when status hides edits",
  async (flag) => {
    const { target } = await workspace();
    gitBaseline(target);
    git(target, "update-index", `--${flag}`, "raw/paper.txt");
    await write(target, "raw/paper.txt", "Synthetic hidden change.\n");
    expect(await wikiLint(target)).toContainEqual({
      rule: "raw-immutable",
      path: "raw/paper.txt",
    });
  },
  INTEGRATION_TIMEOUT_MS,
);

test.each([false, true])(
  "new raw additions are allowed with committed HEAD=%s",
  async (committed) => {
    const { target } = await workspace();
    if (committed) gitBaseline(target);
    else git(target, "init", "-q");
    await write(target, "raw/new.txt", "Synthetic addition.\n");
    expect(await wikiLint(target)).toEqual([]);
    git(target, "add", "raw/new.txt");
    expect(await wikiLint(target)).toEqual([]);
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "ingest moves a new inbox source into a tracked addition that survives a fresh clone",
  async () => {
    const { target, directory } = await workspace();
    gitBaseline(target);
    await write(target, "raw/inbox/added.txt", "Synthetic new source.\n");
    await filesystem.rename(
      join(target, "raw/inbox/added.txt"),
      join(target, "raw/added.txt"),
    );
    await write(
      target,
      "wiki/sources/added.md",
      "---\ntype: source\nraw: raw/added.txt\n---\n# Added\n",
    );
    await filesystem.appendFile(
      join(target, "wiki/index.md"),
      "\n[Added](sources/added.md)\n",
    );
    git(target, "add", "raw/added.txt", "wiki");
    expect(await wikiLint(target)).toEqual([]);
    git(
      target,
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "Ingest synthetic source",
    );
    const clone = join(directory, "clone");
    const result = Bun.spawnSync(["git", "clone", "--quiet", target, clone]);
    expect(result.exitCode).toBe(0);
    expect(await wikiLint(clone)).toEqual([]);
  },
  INTEGRATION_TIMEOUT_MS,
);

test.each(["Source", "SOURCE", "unknown"])(
  "page type %s is rejected as outside the strict enum",
  async (type) => {
    const { target } = await workspace();
    await write(
      target,
      "wiki/analysis/overview.md",
      `---\ntype: ${type}\nraw: raw/paper.txt\n---\n# Invalid type\n`,
    );
    expect(await wikiLint(target)).toContainEqual({
      rule: "page-type",
      path: "wiki/analysis/overview.md",
    });
  },
);

test("BOM-prefixed wiki frontmatter stays valid", async () => {
  const { target } = await workspace();
  const path = join(target, "wiki/sources/example.md");
  await filesystem.writeFile(
    path,
    "\uFEFF" + (await filesystem.readFile(path, "utf8")),
  );
  expect(await wikiLint(target)).toEqual([]);
});

test("Obsidian basenames, aliases and heading references resolve across the harness", async () => {
  const { target } = await workspace();
  await write(
    target,
    "wiki/index.md",
    "---\ntype: index\n---\n[[example|Alias]]\n[[overview#Synthetic analysis]]\n",
  );
  await write(
    target,
    "wiki/analysis/overview.md",
    "---\ntype: analysis\n---\n[[paper.txt|Evidence]]\n",
  );
  expect(await wikiLint(target)).toEqual([]);
});

test("ambiguous Obsidian basenames fail instead of choosing a local match", async () => {
  const { target } = await workspace();
  await write(
    target,
    "wiki/other/example.md",
    "---\ntype: topic\n---\n# Duplicate\n",
  );
  await write(target, "wiki/index.md", "---\ntype: index\n---\n[[example]]\n");
  expect(await wikiLint(target)).toContainEqual({
    rule: "ambiguous-link",
    path: "wiki/index.md",
  });
});
