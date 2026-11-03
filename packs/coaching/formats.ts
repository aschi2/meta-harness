import Type from "typebox";
import Schema from "typebox/schema";
import { join } from "node:path";

const text = Type.String({ pattern: "\\S" });
const tag = Type.String({ pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" });
const tags = Type.Array(tag, { uniqueItems: true });
const labels = Type.Array(text, { uniqueItems: true });
export const ProfileSchema = Type.Object(
  {
    goals: Type.Array(text, { minItems: 1 }),
    constraints: Type.Object(
      {
        sessionMinutes: Type.Number({ exclusiveMinimum: 0 }),
        sessionsPerWeek: Type.Integer({ minimum: 0 }),
        equipmentByLocation: Type.Record(text, labels, { minProperties: 1 }),
      },
      { additionalProperties: false },
    ),
    precautions: Type.Array(
      Type.Object(
        {
          providedBy: Type.Union([
            Type.Literal("user"),
            Type.Literal("clinician"),
          ]),
          excludedTags: Type.Array(tag, { uniqueItems: true, minItems: 1 }),
          notes: Type.Optional(text),
        },
        { additionalProperties: false },
      ),
    ),
    trackingTool: text,
  },
  {
    additionalProperties: false,
    $schema: "https://json-schema.org/draft/2020-12/schema",
  },
);
export const LibrarySchema = Type.Object(
  {
    owner: Type.Union([Type.Literal("user"), Type.Literal("clinician")]),
    items: Type.Array(
      Type.Object(
        {
          id: text,
          title: text,
          tags,
          requiredEquipment: labels,
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
export const PlanSchema = Type.Object(
  {
    weekOf: Type.String({ format: "date" }),
    sessions: Type.Array(
      Type.Object(
        {
          date: Type.String({ format: "date" }),
          location: text,
          items: Type.Array(
            Type.Object(
              {
                itemId: text,
                durationMinutes: Type.Number({ exclusiveMinimum: 0 }),
              },
              { additionalProperties: false },
            ),
            { minItems: 1 },
          ),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
export const profileValidator = Schema.Compile(ProfileSchema);
export const libraryValidator = Schema.Compile(LibrarySchema);
export const planValidator = Schema.Compile(PlanSchema);

if (import.meta.main) {
  for (const [name, schema] of Object.entries({
    profile: ProfileSchema,
    library: LibrarySchema,
    plan: PlanSchema,
  })) {
    await Bun.write(
      join(import.meta.dir, `${name}.schema.json`),
      JSON.stringify(schema, null, 2) + "\n",
    );
  }
}
