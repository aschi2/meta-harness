#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { init, update } from "./apply.ts";
import { check } from "./check.ts";
import { validate } from "./validate.ts";

const USAGE =
  "meta-harness validate [path] | init --pack <name> --plan <plan.json> --target <dir> | update --plan <plan.json> --target <dir> | check --target <dir>";

try {
  const [command, ...arguments_] = Bun.argv.slice(2);
  if (command === "validate") {
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
