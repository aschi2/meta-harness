import { join } from "node:path";
import {
  HarnessManifestSchema,
  PackManifestSchema,
  PlanSchema,
  RoleSchema,
  MaintenanceSchema,
  MaintenanceUserSchema,
  CommandRuleFixtureSchema,
} from "./schema.ts";

for (const [name, schema] of Object.entries({
  "command-rule-tests": CommandRuleFixtureSchema,
  pack: PackManifestSchema,
  harness: HarnessManifestSchema,
  plan: PlanSchema,
  role: RoleSchema,
  maintenance: MaintenanceSchema,
  "maintenance-user": MaintenanceUserSchema,
})) {
  await Bun.write(
    join(import.meta.dir, "../schemas", `${name}.schema.json`),
    `${JSON.stringify(schema, null, 2)}\n`,
  );
}
