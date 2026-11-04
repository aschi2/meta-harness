import { spawnSync } from "node:child_process";
import { mkdir, lstat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { overlayDirectory } from "./overlay.ts";
import { loadPack, PACKAGE_ROOT } from "./packs.ts";
import {
  getRuleSources,
  harnessRoot,
  type RuleOptions,
  type RuleSource,
} from "./rule-sources.ts";
import { parsePackManifest, relativeFile } from "./schema.ts";
import { astGrepArgs } from "./code-rules.ts";
import { safePath } from "./files.ts";
import { pathToFileURL } from "node:url";

export type LearnKind = "command" | "code";
export type LearnScope = "overlay" | "harness" | `pack:${string}`;
export interface LearnOptions extends RuleOptions {
  scope?: LearnScope;
  target?: string;
}
export interface LearnReport {
  passed: number;
  failures: string[];
  output: string[];
}

const TEST_TIMEOUT_MS = 30_000;
const COMMAND_RULE_TEMPLATE = (id: string) =>
  `export const id = ${JSON.stringify(id)};\n\n` +
  `export function check(context: { command: string }): string | null {\n` +
  `  if (context.command.includes("__META_HARNESS_LEARN_PLACEHOLDER__"))\n` +
  `    return "Replace this starter rule with the intended check.";\n` +
  `  return null;\n}\n`;

const COMMAND_FIXTURE_TEMPLATE = (id: string) => ({
  ruleId: id,
  cases: (["claude", "codex"] as const).flatMap((shape) => {
    const tool = shape === "claude" ? "Bash" : "exec_command";
    const commandField = shape === "claude" ? "command" : "cmd";
    return [
      {
        event: "pre-tool-use",
        inputShape: shape,
        input: {
          tool_name: tool,
          cwd: ".",
          tool_input: {
            [commandField]: "__META_HARNESS_LEARN_PLACEHOLDER__",
          },
        },
        expected: "block",
      },
      {
        event: "pre-tool-use",
        inputShape: shape,
        input: {
          tool_name: tool,
          cwd: ".",
          tool_input: { [commandField]: "echo safe" },
        },
        expected: null,
      },
    ];
  }),
});

const CODE_RULE_TEMPLATE = (id: string) =>
  `id: ${id}\nlanguage: TypeScript\nseverity: warning\nmessage: Replace this starter rule with the intended check.\nrule:\n  pattern: TODO\n`;
const CODE_FIXTURE_TEMPLATE = (id: string) =>
  `id: ${id}\nvalid:\n  - const ready = true\ninvalid:\n  - TODO\n`;

function sourceForPack(
  root: string,
  kind: RuleSource["kind"],
  input: unknown,
): RuleSource {
  const manifest = parsePackManifest(input);
  return {
    root,
    kind,
    commandRules: (manifest.commandRules ?? []).map((path) => join(root, path)),
    codeRules: (manifest.codeRules ?? []).map((path) => join(root, path)),
    ruleTests: (manifest.ruleTests ?? []).map((path) => join(root, path)),
  };
}

async function createPersonalOverlay(overlay?: string): Promise<RuleSource> {
  const root = join(overlayDirectory(overlay), "personal-rules");
  await safePath(root, "pack.json");
  await safePath(root, "profile.schema.json");
  await mkdir(root, { recursive: true });
  const manifestPath = join(root, "pack.json");
  const profilePath = join(root, "profile.schema.json");
  const manifest = {
    name: "personal-rules",
    version: "0.1.0",
    domain: "Personal agent rules",
    description: "User-owned command and code rules.",
    overlay: true,
    parts: ["checks"],
    knowledge: [],
    templates: [],
    checkers: [],
    profileSchema: "profile.schema.json",
    commandRules: [],
    codeRules: [],
    ruleTests: [],
    preferences: {},
    researchTopics: [],
  };
  await writeFile(
    profilePath,
    '{"type":"object","properties":{},"additionalProperties":true}\n',
    { flag: "wx" },
  ).catch((error: unknown) => {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST"))
      throw error;
  });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: "wx",
  }).catch((error: unknown) => {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST"))
      throw error;
  });
  const existing = await Bun.file(manifestPath).json();
  return sourceForPack(root, "overlay", existing);
}

async function selectedSources(options: LearnOptions): Promise<{
  source: RuleSource;
}> {
  const sources = await sourcesInScope(options);
  const scope =
    options.scope ??
    ((await harnessRoot(resolve(options.target ?? process.cwd())))
      ? "harness"
      : "overlay");
  if (scope === "overlay") {
    const personal = sources.find(
      (source) => basename(source.root) === "personal-rules",
    );
    if (personal) return { source: personal };
    if (sources.length === 1) return { source: sources[0]! };
    if (sources.length > 1)
      throw new Error(
        "Overlay has multiple packs; use --overlay <pack-directory> to choose one",
      );
    return { source: await createPersonalOverlay(options.overlay) };
  }
  if (sources.length !== 1)
    throw new Error("Rule scope must identify exactly one source");
  return { source: sources[0]! };
}

async function sourcesInScope(options: LearnOptions): Promise<RuleSource[]> {
  const target = resolve(options.target ?? process.cwd());
  const found = await getRuleSources(target, options, true);
  const scope = options.scope ?? (found.target ? "harness" : "overlay");
  if (scope === "harness") {
    if (!found.target)
      throw new Error("No harness found; use --scope overlay or pack:<name>");
    const source = found.sources.find(
      (candidate) => candidate.kind === "harness",
    );
    if (!source) throw new Error("Harness rule source is unavailable");
    return [source];
  }
  if (scope === "overlay") {
    return found.sources.filter((candidate) => candidate.kind === "overlay");
  }

  const name = scope.slice("pack:".length);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
    throw new Error("Pack scope must be pack:<lowercase-name>");
  const existing = found.sources.find(
    (candidate) =>
      candidate.kind === "pack" && basename(candidate.root) === name,
  );
  if (existing) return [existing];
  const pack = await loadPack(name, options.packageRoot ?? PACKAGE_ROOT);
  const input = await Bun.file(join(pack.root, "pack.json")).json();
  return [sourceForPack(pack.root, "pack", input)];
}

function pathsFor(
  source: RuleSource,
  kind: LearnKind,
  id: string,
): [string, string, string, string] {
  if (source.kind === "harness") {
    const rule =
      kind === "command"
        ? `.harness/rules/command/${id}.ts`
        : `.harness/rules/code/${id}.yml`;
    const fixture =
      kind === "command"
        ? `.harness/rule-tests/${id}.json`
        : `.harness/rule-tests/${id}-test.yml`;
    return [join(source.root, rule), join(source.root, fixture), rule, fixture];
  }
  const rule =
    kind === "command" ? `command-rules/${id}.ts` : `rules/${id}.yml`;
  const fixture =
    kind === "command"
      ? `rule-tests/${id}-command.json`
      : `rule-tests/${id}-test.yml`;
  return [join(source.root, rule), join(source.root, fixture), rule, fixture];
}

async function addPackReferences(
  source: RuleSource,
  kind: LearnKind,
  rule: string,
  fixture: string,
): Promise<void> {
  if (source.kind === "harness") return;
  const manifestPath = await safePath(source.root, "pack.json");
  const manifest = parsePackManifest(await Bun.file(manifestPath).json());
  const field = kind === "command" ? "commandRules" : "codeRules";
  const next = {
    ...manifest,
    [field]: [...(manifest[field] ?? []), rule],
    ruleTests: [...(manifest.ruleTests ?? []), fixture],
  };
  await writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
}

export async function learnNew(
  kind: LearnKind,
  id: string,
  options: LearnOptions = {},
): Promise<string[]> {
  if (kind !== "command" && kind !== "code")
    throw new Error("Rule kind must be command or code");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
    throw new Error("Rule id must be a lowercase slug");
  const { source } = await selectedSources(options);
  const [rulePath, fixturePath, relativeRule, relativeFixture] = pathsFor(
    source,
    kind,
    id,
  );
  relativeFile(relativeRule, "rule path");
  relativeFile(relativeFixture, "rule fixture path");
  await safePath(source.root, relativeRule);
  await safePath(source.root, relativeFixture);
  for (const path of [rulePath, fixturePath]) {
    if (
      await lstat(path).then(
        () => true,
        () => false,
      )
    )
      throw new Error(
        `${path}: refusing to overwrite an existing rule or fixture`,
      );
  }
  await mkdir(dirname(rulePath), { recursive: true });
  await mkdir(dirname(fixturePath), { recursive: true });
  const ruleContent =
    kind === "command" ? COMMAND_RULE_TEMPLATE(id) : CODE_RULE_TEMPLATE(id);
  const fixtureContent =
    kind === "command"
      ? `${JSON.stringify(COMMAND_FIXTURE_TEMPLATE(id), null, 2)}\n`
      : CODE_FIXTURE_TEMPLATE(id);
  await writeFile(rulePath, ruleContent, { flag: "wx" });
  try {
    await writeFile(fixturePath, fixtureContent, { flag: "wx" });
    await addPackReferences(source, kind, relativeRule, relativeFixture);
  } catch (error) {
    await unlink(rulePath).catch(() => undefined);
    await unlink(fixturePath).catch(() => undefined);
    throw error;
  }
  return [rulePath, fixturePath];
}

interface AstRuleTest {
  id: string;
  valid?: unknown[];
  invalid?: unknown[];
}

interface AstRule {
  id: string;
  language?: string;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

async function runAstRuleTest(
  fixturePath: string,
  rules: Map<string, string>,
): Promise<{ passed: number; failures: string[] }> {
  const parsedFixture = objectRecord(
    Bun.YAML.parse(await Bun.file(fixturePath).text()),
  ) as AstRuleTest | undefined;
  if (!parsedFixture || typeof parsedFixture.id !== "string")
    throw new Error("code fixture needs an id");
  const rulePath = rules.get(parsedFixture.id);
  if (!rulePath)
    throw new Error(`no code rule registered as ${parsedFixture.id}`);
  const valid = parsedFixture.valid ?? [];
  const invalid = parsedFixture.invalid ?? [];
  if (
    !Array.isArray(valid) ||
    !Array.isArray(invalid) ||
    valid.length + invalid.length === 0
  )
    throw new Error("code fixture needs valid and/or invalid examples");

  const rule = objectRecord(Bun.YAML.parse(await Bun.file(rulePath).text())) as
    AstRule | undefined;
  if (!rule || typeof rule.id !== "string")
    throw new Error("code rule needs an id");
  const {
    files: _files,
    ignores: _ignores,
    ...inlineRule
  } = rule as AstRule & Record<string, unknown>;
  const failures: string[] = [];
  let passed = 0;
  for (const [expectMatch, cases] of [
    [false, valid],
    [true, invalid],
  ] as const) {
    for (const [index, example] of cases.entries()) {
      if (typeof example !== "string") {
        failures.push(
          `${fixturePath}: ${expectMatch ? "invalid" : "valid"} example ${index + 1} must be a string`,
        );
        continue;
      }
      const [binary, ...arguments_] = astGrepArgs([
        "scan",
        "--stdin",
        "--inline-rules",
        JSON.stringify(inlineRule),
        "--json=compact",
        "--color",
        "never",
      ]);
      const result = spawnSync(binary, arguments_, {
        input: example,
        timeout: TEST_TIMEOUT_MS,
        encoding: "utf8",
        shell: false,
      });
      if (result.status !== 0 && result.status !== 1) {
        failures.push(
          `${fixturePath}: ast-grep exited ${result.status}: ${result.stderr.trim()}`,
        );
        continue;
      }
      try {
        const jsonStart = result.stdout.indexOf("[");
        const diagnostics: unknown = JSON.parse(result.stdout.slice(jsonStart));
        if (!Array.isArray(diagnostics))
          throw new Error("expected diagnostics array");
        const matched = diagnostics.length > 0;
        if (matched !== expectMatch)
          failures.push(
            `${fixturePath}: ${expectMatch ? "invalid" : "valid"} example ${index + 1} ${matched ? "matched" : "did not match"}`,
          );
        else passed++;
      } catch (error) {
        failures.push(
          `${fixturePath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
  return { passed, failures };
}

async function ruleId(path: string, command: boolean): Promise<string> {
  if (command) {
    const imported = (await import(pathToFileURL(path).href)) as {
      id?: unknown;
    };
    if (typeof imported.id !== "string")
      throw new Error(`${path}: rule must export id`);
    return imported.id;
  }
  const parsed = objectRecord(Bun.YAML.parse(await Bun.file(path).text()));
  if (typeof parsed?.id !== "string")
    throw new Error(`${path}: code rule must have an id`);
  return parsed.id;
}

export async function learnTest(
  options: LearnOptions = {},
): Promise<LearnReport> {
  const sources = await sourcesInScope(options);
  const scope =
    options.scope ??
    ((await harnessRoot(resolve(options.target ?? process.cwd())))
      ? "harness"
      : "overlay");
  const selected =
    scope === "overlay"
      ? sources.filter((source) => source.kind === "overlay")
      : sources;
  const report: LearnReport = { passed: 0, failures: [], output: [] };
  if (selected.length === 0) {
    report.failures.push("No rule sources found in scope");
    return report;
  }
  for (const source of selected) {
    const commandRules = new Map<string, string>();
    const codeRules = new Map<string, string>();
    for (const [paths, destination] of [
      [source.commandRules, commandRules],
      [source.codeRules, codeRules],
    ] as const) {
      for (const path of paths) {
        try {
          const id = await ruleId(path, destination === commandRules);
          if (destination.has(id)) throw new Error(`duplicate rule id ${id}`);
          destination.set(id, path);
        } catch (error) {
          report.failures.push(
            `${path}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    const commandFixtures = new Set<string>();
    const codeFixtures = new Set<string>();
    for (const fixturePath of source.ruleTests) {
      const extension = fixturePath.toLowerCase().split(".").at(-1);
      if (extension === "json") {
        try {
          const fixture = (await Bun.file(fixturePath).json()) as {
            ruleId?: string;
          };
          if (typeof fixture.ruleId !== "string")
            throw new Error("fixture needs ruleId");
          const rulePath = commandRules.get(fixture.ruleId);
          if (!rulePath)
            throw new Error(`no command rule registered as ${fixture.ruleId}`);
          const { runCommandRuleFixture } = await import("./hooks.ts");
          const result = await runCommandRuleFixture(rulePath, fixturePath);
          commandFixtures.add(fixture.ruleId);
          report.passed += result.passed;
          report.failures.push(...result.failures);
        } catch (error) {
          report.failures.push(
            `${fixturePath}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        continue;
      }
      if (extension === "yml" || extension === "yaml") {
        try {
          const fixture = objectRecord(
            Bun.YAML.parse(await Bun.file(fixturePath).text()),
          );
          if (typeof fixture?.id !== "string")
            throw new Error("code fixture needs an id");
          const result = await runAstRuleTest(fixturePath, codeRules);
          codeFixtures.add(fixture.id);
          report.passed += result.passed;
          report.failures.push(...result.failures);
        } catch (error) {
          report.failures.push(
            `${fixturePath}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    for (const id of commandRules.keys())
      if (!commandFixtures.has(id))
        report.failures.push(
          `${source.root}: command rule ${id} has no fixture`,
        );
    for (const id of codeRules.keys())
      if (!codeFixtures.has(id))
        report.failures.push(`${source.root}: code rule ${id} has no fixture`);
  }
  return report;
}
