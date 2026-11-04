import { format } from "node:util";
import { hook } from "./hooks.ts";
import type { RuleOptions } from "./rule-sources.ts";

interface HookRequest {
  eventName: "pre-tool-use" | "stop";
  input: unknown;
  options: RuleOptions;
}

for (const method of ["log", "info", "debug", "warn"] as const) {
  console[method] = (...values: unknown[]) => {
    process.stderr.write(`${format(...values)}\n`);
  };
}

const request = JSON.parse(await Bun.stdin.text()) as HookRequest;
const result = await hook(request.eventName, request.input, request.options);
process.stdout.write(JSON.stringify(result));
