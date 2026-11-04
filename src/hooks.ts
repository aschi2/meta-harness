import { pathToFileURL } from "node:url";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import type { HookContext } from "./hook-context.ts";
import { contextFromEvent, SHELL_TOOLS } from "./hook-context.ts";
import { instructionBudgetReport } from "./check.ts";
import {
  getRuleSources,
  type RuleOptions,
  type RuleSource,
} from "./rule-sources.ts";
import { scanCodeRules } from "./code-rules.ts";
import { parseCommandRuleFixture } from "./schema.ts";

export interface HookResult {
  output: Record<string, unknown>;
  errors: string[];
}

interface CommandRule {
  id: string;
  check(context: HookContext): unknown;
}

function isShellTool(value: unknown): value is string {
  return typeof value === "string" && SHELL_TOOLS.has(value);
}

async function loadCommandRule(path: string): Promise<CommandRule> {
  const imported = (await import(
    pathToFileURL(path).href
  )) as Partial<CommandRule>;
  if (typeof imported.id !== "string" || typeof imported.check !== "function")
    throw new Error("rule module must export id and check(context)");
  return imported as CommandRule;
}

async function checkCommandRule(
  rule: CommandRule,
  context: HookContext,
): Promise<string | null> {
  const message = await rule.check(context);
  if (message !== null && typeof message !== "string")
    throw new Error("check(context) must return a string or null");
  return message;
}

export async function runCommandRules(
  context: HookContext,
  sources: RuleSource[],
): Promise<{ messages: string[]; errors: string[] }> {
  const messages: string[] = [];
  const errors: string[] = [];
  for (const source of sources) {
    for (const path of source.commandRules) {
      let id = path;
      try {
        const rule = await loadCommandRule(path);
        id = rule.id;
        const message = await checkCommandRule(rule, context);
        if (message) messages.push(message);
      } catch (error) {
        errors.push(
          `${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
  return { messages, errors };
}

export async function runCommandRuleFixture(
  rulePath: string,
  fixturePath: string,
): Promise<{ passed: number; failures: string[] }> {
  const rule = await loadCommandRule(rulePath);
  let fixture;
  try {
    fixture = parseCommandRuleFixture(await Bun.file(fixturePath).json());
  } catch (error) {
    return {
      passed: 0,
      failures: [
        `${fixturePath}: invalid fixture: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
  if (fixture.ruleId !== rule.id)
    return {
      passed: 0,
      failures: [`${fixturePath}: expected ruleId ${rule.id}`],
    };
  const failures: string[] = [];
  for (const [index, item] of fixture.cases.entries()) {
    try {
      const input: unknown = JSON.parse(
        JSON.stringify(item.input).replaceAll("{home}", () =>
          JSON.stringify(homedir()).slice(1, -1),
        ),
      );
      if (
        input !== null &&
        typeof input === "object" &&
        !Array.isArray(input)
      ) {
        const event = input as Record<string, unknown>;
        if (typeof event.cwd === "string" && !isAbsolute(event.cwd))
          event.cwd = resolve(event.cwd);
        if (item.entrypoint !== undefined)
          (input as Record<string, unknown>).entrypoint = item.entrypoint;
      }
      const context = contextFromEvent(input, item.event);
      if (context.harness !== item.inputShape) {
        failures.push(
          `${fixturePath}: case ${index + 1} declares ${item.inputShape} but input normalizes as ${context.harness}`,
        );
        continue;
      }
      const blocked = Boolean(await checkCommandRule(rule, context));
      if (blocked !== (item.expected === "block"))
        failures.push(
          `${fixturePath}: case ${index + 1} expected ${item.expected ?? "allow"}`,
        );
    } catch (error) {
      failures.push(
        `${fixturePath}: case ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { passed: fixture.cases.length - failures.length, failures };
}

function preToolOutput(messages: string[]): Record<string, unknown> {
  if (!messages.length) return {};
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: messages.join("\n"),
    },
  };
}

function stopOutput(messages: string[]): Record<string, unknown> {
  return messages.length
    ? { decision: "block", reason: messages.join("\n") }
    : {};
}

export async function hook(
  eventName: "pre-tool-use" | "stop",
  input: unknown,
  options: RuleOptions = {},
): Promise<HookResult> {
  const errors: string[] = [];
  try {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new TypeError("hook input must be an object");
    const event = input as Record<string, unknown>;
    if (eventName === "stop" && event.stop_hook_active)
      return { output: {}, errors };
    if (eventName === "pre-tool-use" && !isShellTool(event.tool_name))
      return { output: {}, errors };
    const context = contextFromEvent(input, eventName, options.harness);
    if (eventName === "pre-tool-use") {
      const { sources, notices = [] } = await getRuleSources(
        context.cwd,
        options,
      );
      errors.push(...notices);
      const checks = await runCommandRules(context, sources);
      errors.push(...checks.errors);
      return { output: preToolOutput(checks.messages), errors };
    }
    const messages: string[] = [];
    try {
      const budget = await instructionBudgetReport(
        context.cwd,
        options.packageRoot,
        {
          changedOnly: true,
          harness: context.harness,
          ...(options.overlay === undefined
            ? {}
            : { overlay: options.overlay }),
          ...(options.deadline === undefined
            ? {}
            : { deadline: options.deadline }),
        },
      );
      messages.push(...budget.errors);
    } catch (error) {
      errors.push(
        `instruction-budget: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      const report = await scanCodeRules(context.cwd, {
        ...options,
        ...(options.deadline === undefined
          ? {}
          : { deadline: options.deadline }),
      });
      messages.push(...report.errors);
      errors.push(...report.failures);
      errors.push(...report.messages.map((message) => `Warning: ${message}`));
    } catch (error) {
      errors.push(
        `code-rule-scan: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { output: stopOutput([...new Set(messages)]), errors };
  } catch (error) {
    errors.push(
      `${eventName}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { output: {}, errors };
  }
}
