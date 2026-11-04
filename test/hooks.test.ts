import { INTEGRATION_TIMEOUT_MS } from "./constants.ts";
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { contextFromEvent } from "../src/hook-context.ts";
import * as forcePushRule from "../examples/overlay/command-rules/no-force-push.ts";
import {
  hook as runHook,
  runCommandRuleFixture,
  runCommandRules,
} from "../src/hooks.ts";
import type { RuleOptions } from "../src/rule-sources.ts";
import type { RuleSource } from "../src/rule-sources.ts";

const EMPTY_OVERLAY = join(import.meta.dir, "fixtures", "empty-overlay");
function hook(
  eventName: "pre-tool-use" | "stop",
  input: unknown,
  options: RuleOptions = {},
) {
  return runHook(eventName, input, {
    ...options,
    overlay: options.overlay ?? EMPTY_OVERLAY,
  });
}

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function tempDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "meta-harness-hooks-"));
  temporary.push(path);
  return path;
}

function git(root: string, ...args: string[]): void {
  const result = Bun.spawnSync(["git", "-C", root, ...args]);
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

test("normalizes shell events and exposes conservative delegate metadata", () => {
  const original = process.env.CLAUDE_CODE_ENTRYPOINT;
  process.env.CLAUDE_CODE_ENTRYPOINT = "sdk";
  try {
    const claude = contextFromEvent(
      { tool_name: "Bash", cwd: "/tmp", tool_input: { command: "git push" } },
      "pre-tool-use",
    );
    const codex = contextFromEvent(
      {
        tool_name: "exec_command",
        cwd: "/tmp",
        tool_input: { cmd: ["bash", "-lc", "git push"], workdir: "/elsewhere" },
      },
      "pre-tool-use",
    );
    expect(claude.harness).toBe("claude");
    expect(codex.harness).toBe("codex");
    expect(claude.isDelegate).toBe(true);
    expect(codex.isDelegate).toBe("unknown");
    expect(codex.entrypoint).toBe("sdk");
    const codexWithUnknownEntrypoint = contextFromEvent(
      {
        tool_name: "exec_command",
        cwd: "/tmp",
        entrypoint: "sdk",
        tool_input: { cmd: "git status" },
      },
      "pre-tool-use",
    );
    expect(codexWithUnknownEntrypoint.entrypoint).toBe("sdk");
    expect(codexWithUnknownEntrypoint.isDelegate).toBe("unknown");
    const codexCliEntrypoint = contextFromEvent(
      {
        tool_name: "exec_command",
        cwd: "/tmp",
        entrypoint: "cli",
        tool_input: { cmd: "git status" },
      },
      "pre-tool-use",
    );
    expect(codexCliEntrypoint.entrypoint).toBe("cli");
    expect(codexCliEntrypoint.isDelegate).toBe("unknown");
    const explicitNullEntrypoint = contextFromEvent(
      {
        tool_name: "exec_command",
        cwd: "/tmp",
        entrypoint: null,
        tool_input: { cmd: "git status" },
      },
      "pre-tool-use",
    );
    expect(explicitNullEntrypoint.entrypoint).toBeNull();
    expect(explicitNullEntrypoint.isDelegate).toBe("unknown");
    expect(claude.commands()[0]?.words).toEqual(["git", "push"]);
    expect(codex.commands()[0]?.words).toEqual(["git", "push"]);
    const separateLine = contextFromEvent(
      {
        tool_name: "Bash",
        cwd: "/tmp",
        tool_input: { command: "echo ready\npkill -f worker" },
      },
      "pre-tool-use",
    );
    expect(separateLine.commands().map(({ words }) => words[0])).toEqual([
      "echo",
      "pkill",
    ]);
    expect(() =>
      contextFromEvent(
        {
          tool_name: "Bash",
          cwd: "/tmp",
          tool_input: { command: "echo 'unterminated" },
        },
        "pre-tool-use",
      ).commands(),
    ).toThrow("unclosed quote");
    const comments = contextFromEvent(
      {
        tool_name: "Bash",
        cwd: "/tmp",
        tool_input: {
          command: "echo safe # ; git push --force\n# pkill -f worker",
        },
      },
      "pre-tool-use",
    );
    expect(comments.commands().map(({ words }) => words)).toEqual([
      ["echo", "safe"],
    ]);
    process.env.CLAUDE_CODE_ENTRYPOINT = "cli";
    expect(
      contextFromEvent({ tool_name: "Bash", cwd: "/tmp" }, "pre-tool-use")
        .isDelegate,
    ).toBe(false);
    delete process.env.CLAUDE_CODE_ENTRYPOINT;
    expect(
      contextFromEvent({ tool_name: "Bash", cwd: "/tmp" }, "pre-tool-use")
        .isDelegate,
    ).toBe(false);
  } finally {
    if (original === undefined) delete process.env.CLAUDE_CODE_ENTRYPOINT;
    else process.env.CLAUDE_CODE_ENTRYPOINT = original;
  }
});

test("shell invocation parsing covers heredocs, here-strings, quotes, backticks, and -c flags", () => {
  const push = "git push --force origin topic";
  const cases: Array<[string, string | string[], string[], boolean]> = [
    [
      "Codex argv heredoc at end",
      ["bash", "-lc", `${push}\ncat <<EOF\nbody\nEOF`],
      ["git", "cat"],
      true,
    ],
    [
      "Codex argv heredoc at start",
      ["bash", "-lc", `cat <<EOF\nbody\nEOF\n${push}`],
      ["cat", "git"],
      true,
    ],
    ["heredoc body is data", `cat <<'EOF'\n${push}\nEOF`, ["cat"], false],
    ["here-string payload", `cat <<<"${push}"`, ["cat"], false],
    ["quoted heredoc marker", `echo "a <<X"\n${push}`, ["echo", "git"], true],
    ["backtick substitution", `echo \`${push}\``, ["git", "echo"], true],
    [
      "backtick inside double quotes",
      `echo "\`${push}\`"`,
      ["git", "echo"],
      true,
    ],
    ["long option is not -c", `bash --norc -c "${push}"`, ["git"], true],
    ["combined short option -lc", `bash -lc "${push}"`, ["git"], true],
  ];
  for (const [name, command, expected, blocked] of cases) {
    const context = contextFromEvent(
      {
        tool_name: Array.isArray(command) ? "exec_command" : "Bash",
        cwd: "/tmp",
        tool_input: Array.isArray(command) ? { cmd: command } : { command },
      },
      "pre-tool-use",
    );
    expect(
      context.commands().map(({ words }) => words[0]),
      name,
    ).toEqual(expected);
    expect(Boolean(forcePushRule.check(context)), name).toBe(blocked);
  }
  const malformed = contextFromEvent(
    {
      tool_name: "Bash",
      cwd: "/tmp",
      tool_input: { command: `${push} 'unterminated` },
    },
    "pre-tool-use",
  );
  expect(() => malformed.commands()).toThrow("unclosed quote");
  expect(malformed.rawCommand).toContain(push);
  expect(forcePushRule.check(malformed)).toContain("force-with-lease");
  expect(() =>
    contextFromEvent(
      {
        tool_name: "exec_command",
        tool_input: { cmd: "echo ignored", workdir: "/tmp" },
      },
      "pre-tool-use",
    ),
  ).toThrow("cwd must be a string");
  expect(() =>
    contextFromEvent(
      {
        tool_name: "Bash",
        cwd: ".",
        tool_input: { command: "echo ignored", workdir: "/tmp" },
      },
      "pre-tool-use",
    ),
  ).toThrow("cwd must be absolute");
});

test("repository membership rejects another Windows drive", () => {
  if (process.platform !== "win32") return;
  const context = contextFromEvent(
    {
      tool_name: "exec_command",
      cwd: "C:\\repo\\child",
      tool_input: { cmd: "git status", workdir: "D:\\repo" },
    },
    "pre-tool-use",
  );
  expect(context.inRepo("D:\\repo")).toBe(false);
});

test("the generic force-push overlay fixture covers Claude and Codex", async () => {
  const root = join(import.meta.dir, "..", "examples", "overlay");
  const result = await runCommandRuleFixture(
    join(root, "command-rules", "no-force-push.ts"),
    join(root, "rule-tests", "no-force-push.json"),
  );
  expect(result).toEqual({ passed: 4, failures: [] });
});

test("command-rule fixtures reject empty tables, missing shape/outcome pairs, and mismatched inputs", async () => {
  const root = await tempDirectory();
  const rulePath = join(
    import.meta.dir,
    "..",
    "examples",
    "overlay",
    "command-rules",
    "no-force-push.ts",
  );
  const fixturePath = join(root, "fixture.json");
  const cases = [
    ["claude", "block", "Bash", "git push --force"],
    ["claude", null, "Bash", "git push"],
    ["codex", "block", "exec_command", "git push --force"],
    ["codex", null, "exec_command", "git push"],
  ] as const;
  const fixture = {
    ruleId: "no-force-push",
    cases: cases.map(([inputShape, expected, tool_name, command]) => ({
      event: "pre-tool-use",
      inputShape,
      input: {
        tool_name,
        cwd: "/tmp",
        tool_input:
          inputShape === "claude"
            ? { command, cwd: "/tmp" }
            : { cmd: ["bash", "-lc", command], workdir: "/tmp" },
      },
      expected,
    })),
  };

  await writeFile(fixturePath, JSON.stringify({ ...fixture, cases: [] }));
  expect(
    (await runCommandRuleFixture(rulePath, fixturePath)).failures[0],
  ).toContain("invalid fixture");

  await writeFile(
    fixturePath,
    JSON.stringify({ ...fixture, cases: fixture.cases.slice(1) }),
  );
  expect(
    (await runCommandRuleFixture(rulePath, fixturePath)).failures[0],
  ).toContain("invalid fixture");

  const mismatched = structuredClone(fixture);
  mismatched.cases[0]!.input.tool_name = "exec_command";
  await writeFile(fixturePath, JSON.stringify(mismatched));
  const report = await runCommandRuleFixture(rulePath, fixturePath);
  expect(report.failures).toHaveLength(1);
  expect(report.failures[0]).toContain(
    "declares claude but input normalizes as codex",
  );
});
test("command fixtures use runtime return validation and reject a mismatched rule id", async () => {
  const root = await tempDirectory();
  const fixturePath = join(root, "cases.json");
  const fixture = await Bun.file(
    join(import.meta.dir, "../examples/overlay/rule-tests/no-force-push.json"),
  ).json();
  await Bun.write(fixturePath, JSON.stringify(fixture));
  const badRule = join(root, "bad.ts");
  await Bun.write(
    badRule,
    'export const id="no-force-push";export const check=()=>({bad:true});',
  );
  const invalid = await runCommandRuleFixture(badRule, fixturePath);
  expect(invalid.passed).toBe(0);
  expect(invalid.failures).toHaveLength(4);
  expect(
    invalid.failures.every((failure) => failure.includes("must return")),
  ).toBe(true);
  await Bun.write(
    fixturePath,
    JSON.stringify({ ...fixture, ruleId: "another-rule" }),
  );
  const mismatch = await runCommandRuleFixture(badRule, fixturePath);
  expect(mismatch.passed).toBe(0);
  expect(mismatch.failures).toHaveLength(1);
});

test("an erroring command rule is isolated and cannot erase another rule's block", async () => {
  const root = await tempDirectory();
  const failure = join(root, "broken.ts");
  const importFailure = join(root, "import-failure.ts");
  const blocking = join(root, "blocking.ts");
  const invalidReturn = join(root, "invalid-return.ts");
  await writeFile(
    failure,
    "export const id='broken'; export function check(){ throw new Error('broken rule'); }\n",
  );
  await writeFile(importFailure, "throw new Error('import exploded');\n");
  await writeFile(
    blocking,
    "export const id='blocking'; export function check(){ return 'blocked safely'; }\n",
  );
  await writeFile(
    invalidReturn,
    "export const id='invalid-return'; export function check(){ return { block: true }; }\n",
  );
  const source: RuleSource = {
    root,
    kind: "overlay",
    commandRules: [importFailure, failure, blocking, invalidReturn],
    codeRules: [],
    ruleTests: [],
  };
  const report = await runCommandRules(
    contextFromEvent(
      { tool_name: "Bash", cwd: root, tool_input: { command: "echo ok" } },
      "pre-tool-use",
    ),
    [source],
  );
  expect(report.messages).toEqual(["blocked safely"]);
  expect(report.errors).toEqual([
    expect.stringContaining("import exploded"),
    expect.stringContaining("broken rule"),
    expect.stringContaining("must return a string or null"),
  ]);
  const onlyBroken = await runCommandRules(
    contextFromEvent(
      { tool_name: "Bash", cwd: root, tool_input: { command: "echo ok" } },
      "pre-tool-use",
    ),
    [{ ...source, commandRules: [failure] }],
  );
  expect(onlyBroken.messages).toEqual([]);
  expect(onlyBroken.errors).toHaveLength(1);
  const onlyImportFailure = await runCommandRules(
    contextFromEvent(
      { tool_name: "Bash", cwd: root, tool_input: { command: "echo ok" } },
      "pre-tool-use",
    ),
    [{ ...source, commandRules: [importFailure] }],
  );
  expect(onlyImportFailure.messages).toEqual([]);
  expect(onlyImportFailure.errors).toHaveLength(1);
});

test("hook fails open on malformed input, skips non-shell tools and honors stop_hook_active", async () => {
  const options = { overlay: await tempDirectory() };
  const malformed = await hook(
    "pre-tool-use",
    {
      tool_name: "Bash",
      tool_input: { command: 42 },
    },
    options,
  );
  expect(malformed.output).toEqual({});
  expect(malformed.errors).toHaveLength(1);
  expect(
    (await hook("pre-tool-use", { tool_name: "Read" }, options)).output,
  ).toEqual({});
  expect(
    (await hook("stop", { stop_hook_active: true }, options)).output,
  ).toEqual({});
});

async function budgetHarness(root: string) {
  await Bun.write(
    join(root, ".harness/manifest.json"),
    JSON.stringify({
      kbDate: "2026-11-03",
      metaHarnessVersion: "1.0.0",
      generatedAt: new Date().toISOString(),
      profile: { sizeTier: "S", languages: [], targets: ["codex"] },
      packs: [{ name: "coding", version: "1.0.0" }],
      files: {},
      parts: { context: [], knowledge: [], actions: [], checks: [], loop: [] },
    }),
  );
}

test(
  "Stop blocks changed instruction files over budget but ignores unrelated edits",
  async () => {
    const root = await tempDirectory();
    await budgetHarness(root);
    const homeConfig = await tempDirectory();
    const originalCodexHome = process.env.CODEX_HOME;
    process.env.CODEX_HOME = homeConfig;
    try {
      git(root, "init", "--quiet");
      await writeFile(join(root, "AGENTS.md"), "x".repeat(32_769));
      await writeFile(join(root, "source.ts"), "baseline\n");
      git(root, "add", ".");
      git(
        root,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "-m",
        "baseline",
      );

      await writeFile(join(root, "source.ts"), "unrelated change\n");
      const unrelated = await hook(
        "stop",
        {
          cwd: root,
          stop_hook_active: false,
        },
        { overlay: join(root, "empty-overlay") },
      );
      expect(unrelated.output).toEqual({});

      await writeFile(join(root, "AGENTS.md"), "x".repeat(32_768));
      const atLimit = await hook(
        "stop",
        {
          cwd: root,
          stop_hook_active: false,
        },
        { overlay: join(root, "empty-overlay") },
      );
      expect(atLimit.output).toEqual({});

      await writeFile(join(root, "AGENTS.md"), "y".repeat(32_769));
      const over = await hook(
        "stop",
        { cwd: root, stop_hook_active: false },
        { overlay: join(root, "empty-overlay") },
      );
      expect(over.output).toMatchObject({ decision: "block" });
      expect(over.output.reason).toContain("32769");
      git(root, "restore", "AGENTS.md");
      await mkdir(join(root, "child"));
      await writeFile(join(root, "child/AGENTS.md"), "new");
      const untracked = await hook(
        "stop",
        { cwd: join(root, "child") },
        { overlay: join(root, "empty-overlay") },
      );
      expect(untracked.output).toMatchObject({ decision: "block" });
    } finally {
      if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = originalCodexHome;
    }
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "Claude Stop uses Codex global instructions for a Codex-targeted harness",
  async () => {
    const root = await tempDirectory();
    await budgetHarness(root);
    const globalClaude = await tempDirectory();
    const oldConfig = process.env.CODEX_HOME;
    process.env.CODEX_HOME = globalClaude;
    try {
      git(root, "init", "--quiet");
      await writeFile(
        join(globalClaude, "AGENTS.override.md"),
        "g".repeat(20_000),
      );
      await writeFile(join(root, "AGENTS.md"), "a".repeat(12_769));
      await writeFile(join(root, "notes.txt"), "base\n");
      git(root, "add", ".");
      git(
        root,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "-m",
        "baseline",
      );

      await writeFile(join(root, "notes.txt"), "unrelated change\n");
      const unrelated = await hook(
        "stop",
        { cwd: root, stop_hook_active: false },
        { harness: "claude", overlay: join(root, "empty-overlay") },
      );
      expect(unrelated.output).toEqual({});

      await writeFile(join(root, "AGENTS.md"), "a".repeat(12_768));
      const atLimit = await hook(
        "stop",
        { cwd: root, stop_hook_active: false },
        { harness: "claude", overlay: join(root, "empty-overlay") },
      );
      expect(atLimit.output).toEqual({});

      await writeFile(join(root, "AGENTS.md"), "b".repeat(12_769));
      const over = await hook(
        "stop",
        { cwd: root, stop_hook_active: false },
        { harness: "claude", overlay: join(root, "empty-overlay") },
      );
      expect(over.output).toMatchObject({ decision: "block" });
      expect(over.output.reason).toContain("32769");
    } finally {
      if (oldConfig === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = oldConfig;
    }
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "Stop still checks changed instruction files when overlay rule loading fails",
  async () => {
    const root = await tempDirectory();
    await budgetHarness(root);
    const overlay = await tempDirectory();
    const homeConfig = await tempDirectory();
    const originalCodexHome = process.env.CODEX_HOME;
    process.env.CODEX_HOME = homeConfig;
    try {
      git(root, "init", "--quiet");
      await writeFile(join(root, "AGENTS.md"), "x".repeat(32_769));
      await writeFile(join(root, "source.ts"), "base\n");
      git(root, "add", ".");
      git(
        root,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "-m",
        "baseline",
      );
      await mkdir(join(overlay, "broken"));
      await writeFile(join(overlay, "broken", "pack.json"), "{}\n");
      await writeFile(join(root, "AGENTS.md"), "y".repeat(32_769));
      const result = await hook(
        "stop",
        { cwd: root, stop_hook_active: false },
        { overlay },
      );
      expect(result.output).toMatchObject({ decision: "block" });
      expect(result.output.reason).toContain("Over budget");
      expect(result.errors.join("\n")).toContain("Overlay invalid");
    } finally {
      if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = originalCodexHome;
    }
  },
  INTEGRATION_TIMEOUT_MS,
);

test(
  "Stop budget includes nested instructions through a realpath-resolved git root",
  async () => {
    const root = await tempDirectory();
    await budgetHarness(root);
    const aliasParent = await tempDirectory();
    const homeConfig = await tempDirectory();
    const originalCodexHome = process.env.CODEX_HOME;
    process.env.CODEX_HOME = homeConfig;
    try {
      git(root, "init", "--quiet");
      await mkdir(join(root, "child"));
      await writeFile(join(root, "AGENTS.md"), "x".repeat(20_000));
      await writeFile(join(root, "child", "AGENTS.md"), "y".repeat(12_769));
      git(root, "add", ".");
      git(
        root,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "-m",
        "baseline",
      );
      const alias = join(aliasParent, "repo-alias");
      await symlink(
        root,
        alias,
        process.platform === "win32" ? "junction" : "dir",
      );
      await writeFile(join(root, "child", "AGENTS.md"), "y".repeat(12_770));
      const result = await hook(
        "stop",
        {
          cwd: resolve(alias, "child"),
          stop_hook_active: false,
        },
        { overlay: join(root, "empty-overlay") },
      );
      expect(result.output).toMatchObject({ decision: "block" });
    } finally {
      if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = originalCodexHome;
    }
  },
  INTEGRATION_TIMEOUT_MS,
);
