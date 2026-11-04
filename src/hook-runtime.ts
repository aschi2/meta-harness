import { fileURLToPath } from "node:url";
import type { HookResult } from "./hooks.ts";
import type { RuleOptions } from "./rule-sources.ts";

const DEFAULT_TIMEOUT_MS = {
  "pre-tool-use": 5_000,
  stop: 60_000,
} as const;

export async function runHookIsolated(
  eventName: "pre-tool-use" | "stop",
  input: unknown,
  options: RuleOptions = {},
): Promise<HookResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS[eventName];
  const deadline = options.deadline ?? Date.now() + timeoutMs;
  const remaining = deadline - Date.now();
  if (remaining <= 0)
    return { output: {}, errors: [`${eventName}: hook deadline exceeded`] };

  const config = fileURLToPath(new URL("./hook.bunfig.toml", import.meta.url));
  const worker = fileURLToPath(new URL("./hook-worker.ts", import.meta.url));
  const child = Bun.spawn(
    [process.execPath, "--no-env-file", `--config=${config}`, worker],
    {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      windowsHide: true,
    },
  );
  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  child.stdin.write(
    JSON.stringify({
      eventName,
      input,
      options: { ...options, deadline, timeoutMs },
    }),
  );
  child.stdin.end();

  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    child.kill("SIGKILL");
  }, remaining);
  const exitCode = await child.exited;
  clearTimeout(timer);
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  if (expired)
    return {
      output: {},
      errors: [`${eventName}: hook deadline exceeded`, ...stderrLines(stderr)],
    };
  if (exitCode !== 0)
    return {
      output: {},
      errors: [
        `${eventName}: isolated hook worker exited with code ${String(exitCode)}`,
        ...stderrLines(stderr),
      ],
    };
  try {
    const result = JSON.parse(stdout) as HookResult;
    return { ...result, errors: [...result.errors, ...stderrLines(stderr)] };
  } catch (error) {
    return {
      output: {},
      errors: [
        `${eventName}: invalid isolated hook response: ${error instanceof Error ? error.message : String(error)}`,
        ...stderrLines(stderr),
      ],
    };
  }
}

function stderrLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

export function hookDeadlineMs(
  eventName: "pre-tool-use" | "stop",
  configured?: string,
): number {
  const value = configured === undefined ? undefined : Number(configured);
  if (value !== undefined && Number.isSafeInteger(value) && value > 0)
    return value;
  return DEFAULT_TIMEOUT_MS[eventName];
}
