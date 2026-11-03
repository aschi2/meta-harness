import { join } from "node:path";
import {
  HarnessManifestSchema,
  PackManifestSchema,
  PlanSchema,
} from "./schema.ts";

for (const [name, schema] of Object.entries({
  pack: PackManifestSchema,
  harness: HarnessManifestSchema,
  plan: PlanSchema,
})) {
  await Bun.write(
    join(import.meta.dir, "../schemas", `${name}.schema.json`),
    `${JSON.stringify(schema, null, 2)}\n`,
  );
}
