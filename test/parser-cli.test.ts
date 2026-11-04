import { afterEach, expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INTEGRATION_TIMEOUT_MS } from "./constants.ts";

const repositoryRoot = join(import.meta.dir, "..");
const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function tempDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "meta-harness-parser-cli-"));
  temporary.push(path);
  return path;
}

function runHook(
  cwd: string,
  overlay: string,
  event: unknown,
): { output: Record<string, unknown>; stderr: string } {
  const result = Bun.spawnSync(
    [
      process.execPath,
      "--no-env-file",
      `--config=${join(repositoryRoot, "src", "hook.bunfig.toml")}`,
      join(repositoryRoot, "src", "cli.ts"),
      "hook",
      "pre-tool-use",
      "--overlay",
      overlay,
    ],
    {
      cwd,
      env: {
        ...process.env,
        META_HARNESS_OVERLAY: join(cwd, "nonexistent-overlay"),
      },
      stdin: new TextEncoder().encode(JSON.stringify(event)),
      timeout: INTEGRATION_TIMEOUT_MS,
    },
  );
  if (result.exitCode !== 0)
    throw new Error(
      `hook exited ${result.exitCode}: ${result.stderr.toString()}`,
    );
  return {
    output: JSON.parse(result.stdout.toString()) as Record<string, unknown>,
    stderr: result.stderr.toString(),
  };
}

test(
  "the real hook CLI checks parsed and raw shell commands",
  async () => {
    const cwd = await tempDirectory();
    const overlay = join(cwd, "overlay");
    await cp(join(repositoryRoot, "examples", "overlay"), overlay, {
      recursive: true,
    });
    const forcePush = "git push --force origin topic";
    const blockedEvents: unknown[] = [
      {
        tool_name: "exec_command",
        cwd,
        tool_input: {
          cmd: ["bash", "-lc", `cat <<EOF\nbody\nEOF\n${forcePush}`],
          workdir: join(cwd, "ignored-tool-workdir"),
        },
      },
      {
        tool_name: "Bash",
        cwd,
        tool_input: { command: `echo \`${forcePush}\`` },
      },
      {
        tool_name: "Bash",
        cwd,
        tool_input: { command: `echo "\`${forcePush}\`"` },
      },
      {
        tool_name: "Bash",
        cwd,
        tool_input: { command: `${forcePush} 'unterminated` },
      },
    ];

    for (const command of [
      `${forcePush}\ncat <<EOF\nbody\nEOF`,
      `echo ready\ncat <<EOF\nbody\nEOF\n${forcePush}`,
      `cat <<<EOF\n${forcePush}`,
      `echo "a <<X"\n${forcePush}`,
      `bash --norc -c "${forcePush}"`,
      `zsh -lc "echo 'it''s'; ${forcePush}"`,
    ])
      blockedEvents.push({
        tool_name: "exec_command",
        cwd,
        tool_input: { cmd: ["bash", "-lc", command] },
      });

    for (const event of blockedEvents) {
      const result = runHook(cwd, overlay, event);
      expect(result.output).toMatchObject({
        hookSpecificOutput: { permissionDecision: "deny" },
      });
    }

    const hereString = runHook(cwd, overlay, {
      tool_name: "Bash",
      cwd,
      tool_input: { command: `cat <<<"${forcePush}"` },
    });
    expect(hereString.output).toEqual({});
  },
  INTEGRATION_TIMEOUT_MS,
);
