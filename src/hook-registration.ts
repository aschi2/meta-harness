import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type HookHarness = "claude" | "codex";

const SHELL_MATCHER = "^(Bash|shell|local_shell|run_command|exec_command)$";

function quoteArgument(value: string): string {
  const absolute = resolve(value);
  if (process.platform === "win32")
    return `'${absolute.replaceAll("'", "''")}'`;
  return `'${absolute.replaceAll("'", `'\\''`)}'`;
}

function command(
  event: "pre-tool-use" | "stop",
  harness: HookHarness,
  overlay?: string,
): string {
  const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));
  const config = fileURLToPath(new URL("./hook.bunfig.toml", import.meta.url));
  const runtime = quoteArgument(process.execPath);
  const invoke = `${process.platform === "win32" ? `& ${runtime}` : runtime} --no-env-file --config=${quoteArgument(config)} ${quoteArgument(cli)} hook ${event} --harness ${harness}`;
  return `${invoke}${overlay ? ` --overlay ${quoteArgument(overlay)}` : ""}`;
}

function registration(
  event: "pre-tool-use" | "stop",
  harness: HookHarness,
  overlay?: string,
) {
  const handler: Record<string, unknown> = {
    type: "command",
    command: command(event, harness, overlay),
    timeout: 120,
  };
  if (process.platform === "win32" && harness === "claude")
    handler.shell = "powershell";
  const value: Record<string, unknown> = { hooks: [handler] };
  if (event === "pre-tool-use") value.matcher = SHELL_MATCHER;
  return value;
}

export function hookRegistrationPaths(
  profile: Record<string, unknown>,
): string[] {
  const targets = profile.targets;
  if (!Array.isArray(targets))
    return [".claude/settings.json", ".codex/hooks.json"];
  const paths: string[] = [];
  if (targets.some((target) => target === "claude" || target === "claude-code"))
    paths.push(".claude/settings.json");
  if (targets.includes("codex")) paths.push(".codex/hooks.json");
  return paths;
}

export function mergeHookSettings(
  content: string | undefined,
  harness: HookHarness,
  overlay?: string,
): string {
  let settings: Record<string, unknown> = {};
  if (content !== undefined) {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      throw new Error(`${harness} hook settings must be a JSON object`);
    settings = parsed as Record<string, unknown>;
  }
  const hooksValue = settings.hooks;
  if (
    hooksValue !== undefined &&
    (typeof hooksValue !== "object" ||
      hooksValue === null ||
      Array.isArray(hooksValue))
  )
    throw new Error(`${harness} hook settings.hooks must be an object`);
  const hooks = (hooksValue ?? {}) as Record<string, unknown>;
  settings.hooks = hooks;
  for (const event of ["PreToolUse", "Stop"] as const) {
    const groupValue = hooks[event];
    if (groupValue !== undefined && !Array.isArray(groupValue))
      throw new Error(`${harness} hooks.${event} must be an array`);
    const group = (groupValue ?? []) as unknown[];
    const entry = registration(
      event === "PreToolUse" ? "pre-tool-use" : "stop",
      harness,
      overlay,
    );
    if (
      !group.some(
        (existing) => JSON.stringify(existing) === JSON.stringify(entry),
      )
    )
      group.push(entry);
    hooks[event] = group;
  }
  return `${JSON.stringify(settings, null, 2)}\n`;
}

export function hookEntries(
  harness: HookHarness,
  overlay?: string,
): Array<{ event: "PreToolUse" | "Stop"; entry: Record<string, unknown> }> {
  return [
    {
      event: "PreToolUse",
      entry: registration("pre-tool-use", harness, overlay),
    },
    { event: "Stop", entry: registration("stop", harness, overlay) },
  ];
}
