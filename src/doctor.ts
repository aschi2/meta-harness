import {
  inspectCodexHooks,
  type CodexTrustOptions,
} from "./codex-hook-trust.ts";
import { lstat } from "node:fs/promises";
import { overlayCodexTrustOptions } from "./overlay-install.ts";
import { resolve } from "node:path";
import { readHarness } from "./apply.ts";
import { check } from "./check.ts";
import {
  MAINTENANCE_CONFIG,
  maintenanceStatus,
  maintenanceUserConfigPath,
} from "./maintenance.ts";
import { readRegularFile } from "./maintenance-runtime.ts";
import { safePath } from "./files.ts";
import { overlayDirectory, overlayPacks } from "./overlay.ts";
import { PACKAGE_ROOT } from "./packs.ts";
import { parseMaintenance, parseMaintenanceUser } from "./schema.ts";
import { localRulePaths, ruleApprovals } from "./rule-trust.ts";
import type { RuleOptions } from "./rule-sources.ts";

const DEFAULT_STALE_DAYS = 90;
const DAY_MS = 86_400_000;
export interface DoctorFinding {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
  fix: string;
}
export interface DoctorOptions extends RuleOptions {
  codexTrust?: Partial<CodexTrustOptions>;
  configPath?: string;
  staleDays?: number;
  now?: Date;
}

export async function doctor(
  targetPath = process.cwd(),
  options: DoctorOptions = {},
) {
  const target = resolve(targetPath);
  const packageRoot = options.packageRoot ?? PACKAGE_ROOT;
  const staleDays = options.staleDays ?? DEFAULT_STALE_DAYS;
  if (!Number.isFinite(staleDays) || staleDays < 0)
    throw new Error("stale-days must be a non-negative number");
  const findings: DoctorFinding[] = [];
  const targetArgument = `--target ${JSON.stringify(target)}`;
  const rerun = `meta-harness doctor ${targetArgument}`;
  const add = (
    level: DoctorFinding["level"],
    code: string,
    message: string,
    fix: string,
  ) => findings.push({ level, code, message, fix });
  if (!Bun.which("git"))
    add("error", "git", "git is not on PATH", `<install git>; ${rerun}`);
  const manifestExists = await lstat(
    resolve(target, ".harness/manifest.json"),
  ).then(
    () => true,
    (error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return false;
      throw error;
    },
  );
  const trustFix = `meta-harness overlay trust${options.overlay ? ` --overlay ${JSON.stringify(resolve(options.overlay))}` : ""}`;
  try {
    const trustOptions = await overlayCodexTrustOptions({
      ...options.codexTrust,
    });
    for (const finding of await inspectCodexHooks(
      trustOptions,
      target,
      manifestExists,
    ))
      add(
        finding.level,
        "codex-trust",
        finding.message,
        finding.level === "info" ? "" : trustFix,
      );
  } catch (error) {
    add(
      "warning",
      "codex-trust",
      `Codex trust check failed: ${errorMessage(error)}`,
      trustFix,
    );
  }
  const configPath = maintenanceUserConfigPath(options.configPath);
  try {
    if (await Bun.file(configPath).exists()) {
      const config = parseMaintenanceUser(await Bun.file(configPath).json());
      const executable = config.agent[0];
      if (!executable || !Bun.which(executable))
        add(
          "error",
          "agent",
          `Configured agent is not resolvable: ${executable ?? "empty argv"}`,
          `<install ${executable ?? "agent CLI"}>; ${rerun}`,
        );
    } else {
      const maintenanceContent = manifestExists
        ? await readRegularFile(await safePath(target, MAINTENANCE_CONFIG))
        : undefined;
      const maintenanceEnabled =
        maintenanceContent !== undefined &&
        Object.values(
          parseMaintenance(JSON.parse(maintenanceContent)).roles,
        ).some((role) => role.enabled);
      add(
        maintenanceEnabled ? "warning" : "info",
        "agent",
        `Agent not configured: ${configPath}`,
        maintenanceEnabled
          ? `<editor> ${JSON.stringify(configPath)}; ${rerun}`
          : "",
      );
    }
  } catch (error) {
    add(
      "error",
      "agent",
      errorMessage(error),
      `<editor> ${JSON.stringify(configPath)}; ${rerun}`,
    );
  }
  try {
    await overlayPacks(options.overlay);
  } catch (error) {
    add(
      "error",
      "overlay",
      errorMessage(error),
      `meta-harness validate --overlay ${JSON.stringify(overlayDirectory(options.overlay))}`,
    );
  }
  if (!manifestExists) {
    add("info", "harness", "not a harness: harness checks skipped", "");
    return {
      findings,
      errors: findings.filter((finding) => finding.level === "error"),
    };
  }
  try {
    const { manifest, packs } = await readHarness(target, packageRoot);
    for (const pack of packs) {
      const recorded = manifest.packs?.find(
        (source) => source.name === pack.manifest.name,
      );
      if (!recorded || recorded.version !== pack.manifest.version)
        add(
          "warning",
          "pack-version",
          `${pack.manifest.name}: harness ${recorded?.version ?? "legacy"}, current ${pack.manifest.version}`,
          `meta-harness update --plan <plan.json> ${targetArgument}`,
        );
      for (const topic of pack.manifest.researchTopics) {
        const age =
          ((options.now ?? new Date()).getTime() - Date.parse(topic.reviewed)) /
          DAY_MS;
        if (age > staleDays)
          add(
            "warning",
            "research",
            `${pack.manifest.name}/${topic.path}: reviewed ${topic.reviewed}, older than ${staleDays} days`,
            `/harness-research ${JSON.stringify(pack.manifest.name + "/" + topic.path)}`,
          );
      }
    }
    const approval = await ruleApprovals(target, await localRulePaths(target));
    for (const notice of approval.notices)
      add(
        "warning",
        "rules",
        notice,
        `meta-harness approve --rules ${targetArgument}`,
      );
    const report = await check(target, packageRoot, options);
    for (const error of report.errors) {
      if (
        error.startsWith("Drift:") &&
        error.endsWith("owner approval required")
      ) {
        const path = /^Drift: (.*) \((?:changed|deleted)\)/.exec(error)?.[1];
        add(
          "error",
          "owner",
          error,
          `meta-harness approve ${JSON.stringify(path ?? "<path>")} ${targetArgument}`,
        );
      } else if (error.startsWith("Over budget:"))
        add(
          "error",
          "budget",
          error,
          `<shorten instructions>; meta-harness check ${targetArgument}`,
        );
      else if (error.startsWith("Checker "))
        add(
          "error",
          "checker",
          error,
          `<repair checker or its runtime>; meta-harness check ${targetArgument}`,
        );
      else if (!error.startsWith("Overlay invalid:"))
        add("error", "check", error, `meta-harness check ${targetArgument}`);
    }
    for (const status of await maintenanceStatus(target, { packageRoot })) {
      if (status.includes("NEEDS TUNING")) {
        const role = status.split(":")[0] ?? "<role>";
        add(
          "warning",
          "maintenance",
          status,
          `meta-harness maintenance disable ${role} ${targetArgument} # tune its prompt before enabling again`,
        );
      }
    }
  } catch (error) {
    add(
      "error",
      "harness",
      errorMessage(error),
      `meta-harness check ${targetArgument}`,
    );
  }
  return {
    findings,
    errors: findings.filter((finding) => finding.level === "error"),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
