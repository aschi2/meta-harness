#!/usr/bin/env bun
import { runHookIsolated, hookDeadlineMs } from "./hook-runtime.ts";
import { overlayInstall, overlayUninstall } from "./overlay-install.ts";
import { learnNew, learnTest, type LearnScope } from "./learn.ts";
import { doctor } from "./doctor.ts";
import { overlayPacks } from "./overlay.ts";
import { parseArgs } from "node:util";
import { init, update } from "./apply.ts";
import { approveRules } from "./rule-trust.ts";
import { approve } from "./approve.ts";
import { check } from "./check.ts";
import {
  maintenanceList,
  maintenanceToggle,
  maintenanceSchedule,
  maintenanceRun,
  maintenanceStatus,
} from "./maintenance.ts";
import { validate } from "./validate.ts";
import { PACKAGE_ROOT } from "./packs.ts";

const USAGE =
  "meta-harness validate [path] | init --pack <name> --plan <plan.json> --target <dir> | update --plan <plan.json> --target <dir> | check --target <dir> | approve <path>|--rules --target <dir>";

try {
  const [command, ...arguments_] = Bun.argv.slice(2);
  if (command === "hook") {
    const [event, ...remaining] = arguments_;
    if (event !== "pre-tool-use" && event !== "stop")
      throw new Error("hook: expected pre-tool-use or stop");
    const { values } = parseArgs({
      args: remaining,
      options: {
        overlay: { type: "string" },
        harness: { type: "string" },
        "timeout-ms": { type: "string" },
      },
      strict: true,
    });
    try {
      const input: unknown = JSON.parse(await Bun.stdin.text());
      if (
        values.harness !== undefined &&
        values.harness !== "claude" &&
        values.harness !== "codex"
      )
        throw new Error("harness: expected claude or codex");
      const timeoutMs = hookDeadlineMs(
        event,
        values["timeout-ms"] ?? process.env.META_HARNESS_HOOK_TIMEOUT_MS,
      );
      const result = await runHookIsolated(event, input, {
        timeoutMs,
        ...(values.overlay ? { overlay: values.overlay } : {}),
        ...(values.harness ? { harness: values.harness } : {}),
      });
      process.stdout.write(JSON.stringify(result.output) + "\n");
      for (const error of result.errors)
        process.stderr.write(`meta-harness: ${error}\n`);
    } catch (error) {
      process.stdout.write("{}\n");
      process.stderr.write(
        `meta-harness hook ${event}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  } else if (command === "overlay") {
    const [operation, ...remaining] = arguments_;
    const { values } = parseArgs({
      args: remaining,
      options: {
        "dry-run": { type: "boolean", default: false },
        overlay: { type: "string" },
      },
      strict: true,
    });
    if (operation !== "install" && operation !== "uninstall")
      throw new Error("overlay: expected install or uninstall");
    if (operation === "uninstall" && values["dry-run"])
      throw new Error("uninstall does not accept --dry-run");
    const lines =
      operation === "install"
        ? await overlayInstall({
            dryRun: values["dry-run"],
            ...(values.overlay ? { overlay: values.overlay } : {}),
          })
        : await overlayUninstall();
    process.stdout.write(lines.join("\n") + "\n");
  } else if (command === "learn") {
    const [operation, ...remaining] = arguments_;
    const { values, positionals } = parseArgs({
      args: remaining,
      allowPositionals: true,
      options: {
        target: { type: "string" },
        overlay: { type: "string" },
        scope: { type: "string" },
      },
      strict: true,
    });
    const scope = parseLearnScope(values.scope);
    const options = {
      ...(values.target ? { target: values.target } : {}),
      ...(values.overlay ? { overlay: values.overlay } : {}),
      ...(scope ? { scope } : {}),
    };
    if (operation === "test") {
      if (positionals.length)
        throw new Error("learn test accepts no positional arguments");
      const report = await learnTest(options);
      process.stdout.write(report.output.join("\n") + "\n");
      process.stdout.write(
        `${report.passed} rule cases passed; ${report.failures.length} failed.\n`,
      );
      if (report.failures.length) throw new Error(report.failures.join("\n"));
    } else if (operation === "new") {
      const [kind, id, ...extra] = positionals;
      if ((kind !== "command" && kind !== "code") || !id || extra.length)
        throw new Error(
          "learn new command|code <id> [--scope overlay|harness|pack:<name>]",
        );
      process.stdout.write(
        (await learnNew(kind, id, options)).join("\n") + "\n",
      );
    } else throw new Error("learn: expected new or test");
  } else if (command === "doctor") {
    const { values } = parseArgs({
      args: arguments_,
      options: {
        target: { type: "string" },
        overlay: { type: "string" },
        config: { type: "string" },
        "stale-days": { type: "string" },
      },
      strict: true,
    });
    const report = await doctor(values.target ?? process.cwd(), {
      ...(values.overlay ? { overlay: values.overlay } : {}),
      ...(values.config ? { configPath: values.config } : {}),
      ...(values["stale-days"] !== undefined
        ? { staleDays: Number(values["stale-days"]) }
        : {}),
    });
    for (const finding of report.findings)
      process.stdout.write(
        `${finding.level.toUpperCase()} [${finding.code}] ${finding.message}\n  Fix: ${finding.fix}\n`,
      );
    process.stdout.write(
      `Doctor: ${report.errors.length} error(s), ${report.findings.length - report.errors.length} warning(s).\n`,
    );
    if (report.errors.length) process.exitCode = 1;
  } else if (command === "maintenance") {
    const [operation, ...remaining] = arguments_;
    const { values, positionals } = parseArgs({
      args: remaining,
      allowPositionals: true,
      strict: true,
      options: {
        target: { type: "string" },
        config: { type: "string" },
        force: { type: "boolean", default: false },
        cadence: { type: "string" },
      },
    });
    const target = values.target ?? process.cwd();
    const [role, ...extra] = positionals;
    if (extra.length) throw new Error("Expected at most one maintenance role");
    if (operation === "list" || operation === "status") {
      if (role || values.force || values.cadence)
        throw new Error("list/status accept only --target");
      const lines =
        operation === "list"
          ? await maintenanceList(target)
          : await maintenanceStatus(target);
      process.stdout.write(lines.join("\n") + "\n");
    } else {
      if (!role) throw new Error("Expected a maintenance role id");
      if (operation === "enable" || operation === "disable") {
        if (values.force)
          throw new Error("--force is only for maintenance run");
        process.stdout.write(
          (await maintenanceToggle(
            target,
            role,
            operation === "enable",
            values.cadence,
          )) + "\n",
        );
      } else if (operation === "schedule") {
        if (values.force || values.cadence)
          throw new Error("schedule accepts only --target");
        process.stdout.write(
          (
            await maintenanceSchedule(target, role, {
              ...(values.config ? { configPath: values.config } : {}),
            })
          ).join("\n") + "\n",
        );
      } else if (operation === "run") {
        if (values.cadence) throw new Error("run accepts --target and --force");
        const record = await maintenanceRun(target, role, values.force, {
          ...(values.config ? { configPath: values.config } : {}),
        });
        process.stdout.write(
          `${role}: ${record.outcome}; branch ${record.branch}\n`,
        );
        for (const warning of record.warnings ?? [])
          process.stderr.write(`${warning}\n`);
        if (record.outcome === "failed")
          throw new Error(record.error ?? `Maintenance run ${record.outcome}`);
      } else
        throw new Error(
          "maintenance: expected list, enable, disable, run, status or schedule",
        );
    }
  } else if (command === "validate") {
    const { values, positionals } = parseArgs({
      args: arguments_,
      allowPositionals: true,
      options: { overlay: { type: "string" } },
      strict: true,
    });
    if (positionals.length > 1 || (values.overlay && positionals.length))
      throw new Error("validate: use [path] or --overlay <path>");
    const result = await validate(
      values.overlay ?? positionals[0] ?? PACKAGE_ROOT,
    );
    if (result.errors.length) throw new Error(result.errors.join("\n"));
    if (values.overlay) await overlayPacks(values.overlay);
    process.stdout.write(
      `Validated ${result.manifests.length} ${values.overlay ? "overlay " : ""}pack(s).\n`,
    );
  } else {
    const { values, positionals } = parseArgs({
      args: arguments_,
      allowPositionals: command === "approve",
      options: {
        rules: { type: "boolean" },
        pack: { type: "string" },
        plan: { type: "string" },
        target: { type: "string" },
        overlay: { type: "string" },
      },
      strict: true,
    });
    if (!values.target) throw new Error(USAGE);
    if (command === "approve") {
      const [path, ...extra] = positionals;
      if (
        (!path && !values.rules) ||
        (path && values.rules) ||
        extra.length ||
        values.plan ||
        values.pack
      )
        throw new Error(USAGE);
      process.stdout.write(
        (values.rules
          ? await approveRules(values.target)
          : await approve(path!, values.target)) + "\n",
      );
    } else if (command === "check") {
      if (values.plan || values.pack) throw new Error(USAGE);
      const report = await check(
        values.target,
        undefined,
        values.overlay ? { overlay: values.overlay } : {},
      );
      process.stdout.write(`${report.messages.join("\n")}\n`);
      if (report.errors.length) throw new Error(report.errors.join("\n"));
    } else {
      if (!values.plan) throw new Error(USAGE);
      const options = {
        planPath: values.plan,
        target: values.target,
        ...(values.overlay ? { overlay: values.overlay } : {}),
      };
      let report;
      if (command === "init" && values.pack)
        report = await init({ ...options, packName: values.pack });
      else if (command === "update" && !values.pack)
        report = await update(options);
      if (!report) throw new Error(USAGE);
      process.stdout.write(`${report.messages.join("\n")}\n`);
      if (report.conflicts.length)
        throw new Error(`Unresolved conflicts: ${report.conflicts.join(", ")}`);
    }
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}

function parseLearnScope(value: string | undefined): LearnScope | undefined {
  if (value === undefined || value === "overlay" || value === "harness")
    return value;
  if (/^pack:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))
    return `pack:${value.slice(5)}`;
  throw new Error("scope: expected overlay, harness or pack:<name>");
}
