#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { init, update } from "./apply.ts";
import { check } from "./check.ts";
import {
  maintenanceList,
  maintenanceToggle,
  maintenanceSchedule,
  maintenanceRun,
  maintenanceStatus,
} from "./maintenance.ts";
import { validate } from "./validate.ts";

const USAGE =
  "meta-harness validate [path] | init --pack <name> --plan <plan.json> --target <dir> | update --plan <plan.json> --target <dir> | check --target <dir>";

try {
  const [command, ...arguments_] = Bun.argv.slice(2);
  if (command === "maintenance") {
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
    if (arguments_.length > 1) throw new Error(USAGE);
    const result = await validate(arguments_[0] ?? ".");
    if (result.errors.length) throw new Error(result.errors.join("\n"));
    process.stdout.write(`Validated ${result.manifests.length} pack(s).\n`);
  } else {
    const { values } = parseArgs({
      args: arguments_,
      options: {
        pack: { type: "string" },
        plan: { type: "string" },
        target: { type: "string" },
      },
      strict: true,
    });
    if (!values.target) throw new Error(USAGE);
    if (command === "check") {
      if (values.plan || values.pack) throw new Error(USAGE);
      const report = await check(values.target);
      process.stdout.write(`${report.messages.join("\n")}\n`);
      if (report.errors.length) throw new Error(report.errors.join("\n"));
    } else {
      if (!values.plan) throw new Error(USAGE);
      const options = { planPath: values.plan, target: values.target };
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
