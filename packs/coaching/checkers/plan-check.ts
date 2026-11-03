import { resolve } from "node:path";
import { diskFile, safePath } from "../../../src/files.ts";
import {
  profileValidator,
  libraryValidator,
  planValidator,
} from "../formats.ts";

export const PLAN_RULES = [
  "input",
  "unknown-item",
  "unknown-excluded-tag",
  "equipment",
  "excluded-tag",
  "session-duration",
  "weekly-count",
] as const;
export interface PlanWarning {
  rule: "untagged-item";
  path: string;
}
export interface PlanFinding {
  rule: (typeof PLAN_RULES)[number];
  path: string;
}
const DAY_MS = 86_400_000;

async function json(target: string, path: string): Promise<unknown> {
  const file = await diskFile(await safePath(target, path));
  if (file.kind !== "file") throw new Error("Expected regular JSON file");
  return JSON.parse(file.content);
}

export async function planCheck(
  targetPath: string,
  warnings: PlanWarning[] = [],
): Promise<PlanFinding[]> {
  const target = resolve(targetPath);
  const findings: PlanFinding[] = [];
  let profileInput: unknown;
  let profilePath = "profile.json";
  try {
    const ownerProfile = await diskFile(await safePath(target, profilePath));
    if (ownerProfile.kind === "file") {
      profileInput = JSON.parse(ownerProfile.content);
    } else if (ownerProfile.kind === "missing") {
      profilePath = ".harness/manifest.json";
      const manifest: unknown = await json(target, profilePath);
      if (
        typeof manifest !== "object" ||
        manifest === null ||
        !("profile" in manifest)
      )
        throw new Error("Missing profile");
      profileInput = manifest.profile;
    } else throw new Error("Invalid owner profile");
    if (!profileValidator.Check(profileInput))
      throw new Error("Invalid profile");
  } catch {
    return [{ rule: "input", path: profilePath }];
  }
  const profile = profileValidator.Parse(profileInput);
  let library: ReturnType<typeof libraryValidator.Parse>;
  try {
    const input = await json(target, "library.json");
    if (!libraryValidator.Check(input)) throw new Error("Invalid library");
    library = libraryValidator.Parse(input);
    if (
      new Set(library.items.map((item) => item.id)).size !==
      library.items.length
    )
      throw new Error("Duplicate item id");
  } catch {
    return [{ rule: "input", path: "library.json" }];
  }
  const vocabulary = new Set(library.items.flatMap((item) => item.tags));
  for (const precaution of profile.precautions) {
    for (const tag of precaution.excludedTags) {
      if (!vocabulary.has(tag))
        findings.push({ rule: "unknown-excluded-tag", path: profilePath });
    }
  }
  for (const item of library.items) {
    if (!item.tags.length)
      warnings.push({ rule: "untagged-item", path: "library.json" });
  }
  let plan: ReturnType<typeof planValidator.Parse>;
  try {
    const input = await json(target, "plan.json");
    if (!planValidator.Check(input)) throw new Error("Invalid plan");
    plan = planValidator.Parse(input);
    const firstDay = Date.parse(plan.weekOf);
    if (
      plan.sessions.some(
        (session) =>
          Date.parse(session.date) < firstDay ||
          Date.parse(session.date) >= firstDay + 7 * DAY_MS,
      )
    )
      throw new Error("Outside the declared week");
  } catch {
    return [{ rule: "input", path: "plan.json" }];
  }
  const items = new Map(library.items.map((item) => [item.id, item]));
  const excluded = new Set(
    profile.precautions.flatMap((precaution) => precaution.excludedTags),
  );
  if (plan.sessions.length > profile.constraints.sessionsPerWeek)
    findings.push({ rule: "weekly-count", path: "plan.json" });
  for (const session of plan.sessions) {
    const locations = profile.constraints.equipmentByLocation;
    const available = Object.hasOwn(locations, session.location)
      ? locations[session.location]
      : undefined;
    if (!available) findings.push({ rule: "equipment", path: "plan.json" });
    const minutes = session.items.reduce(
      (sum, item) => sum + item.durationMinutes,
      0,
    );
    if (minutes > profile.constraints.sessionMinutes)
      findings.push({ rule: "session-duration", path: "plan.json" });
    for (const entry of session.items) {
      const item = items.get(entry.itemId);
      if (!item) {
        findings.push({ rule: "unknown-item", path: "plan.json" });
        continue;
      }
      if (
        available &&
        item.requiredEquipment.some(
          (equipment) => !available.includes(equipment),
        )
      )
        findings.push({ rule: "equipment", path: "plan.json" });
      if (item.tags.some((tag) => excluded.has(tag)))
        findings.push({ rule: "excluded-tag", path: "plan.json" });
    }
  }
  return findings;
}

if (import.meta.main) {
  const warnings: PlanWarning[] = [];
  const findings = await planCheck(Bun.argv[2] ?? process.cwd(), warnings);
  const counts = Object.fromEntries(
    PLAN_RULES.map((rule) => [
      rule,
      findings.filter((finding) => finding.rule === rule).length,
    ]),
  );
  process.stdout.write(
    JSON.stringify({
      counts,
      warnings: warnings.map((warning) => ({
        ...warning,
        message: "Untagged library item: exclusions cannot apply to it.",
      })),
      paths: [...new Set(findings.map((finding) => finding.path))],
    }) + "\n",
  );
  process.exitCode = findings.length ? 1 : 0;
}
