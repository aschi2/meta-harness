import Type from "typebox";
import Schema from "typebox/schema";

export const JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema";
export const HARNESS_PARTS = [
  "context",
  "knowledge",
  "actions",
  "checks",
  "loop",
] as const;
const text = Type.String({ pattern: "\\S" });
const slug = Type.String({ pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" });
const version = Type.String({
  pattern: "^\\d+\\.\\d+\\.\\d+(?:-[\\w.-]+)?(?:\\+[\\w.-]+)?$",
});
const date = Type.String({ format: "date" });
const isoDate = Type.Union([date, Type.String({ format: "date-time" })]);
export const RelativeFileSchema = Type.String({
  minLength: 1,
  pattern:
    "^(?!/)(?!.*\\\\)(?!.*:)(?!.*//)(?!.*(?:^|/)\\.{1,2}(?:/|$))(?!.*[/]$)[^\\u0000]+$",
});
export const RESERVED_PATH_PATTERN =
  "(?:^|/)\\.(?:[gG][iI][tT]|[hH][aA][rR][nN][eE][sS][sS])(?:/|$)";
const outputPath = Type.Intersect([
  RelativeFileSchema,
  Type.String({ pattern: `^(?!.*${RESERVED_PATH_PATTERN}).*$` }),
]);
const part = Type.Union(HARNESS_PARTS.map((part) => Type.Literal(part)));
const parts = Type.Array(part, { minItems: 1, uniqueItems: true });
const paths = Type.Array(RelativeFileSchema);
const partMap = Type.Object(
  {
    context: paths,
    knowledge: paths,
    actions: paths,
    checks: paths,
    loop: paths,
  },
  { additionalProperties: false },
);
const packVersion = Type.Object({ name: slug, version });
const profile = Type.Record(Type.String(), Type.Unknown());
export const InstructionBudgetSchema = Type.Object(
  {
    target: text,
    paths: Type.Array(RelativeFileSchema, { minItems: 1 }),
    maximum: Type.Integer({ minimum: 1 }),
    unit: Type.Union([Type.Literal("bytes"), Type.Literal("lines")]),
    scope: Type.Union([Type.Literal("file"), Type.Literal("chain")]),
    globalDirectory: Type.Optional(Type.String()),
    globalEnvironment: Type.Optional(text),
    globalPaths: Type.Optional(paths),
    description: text,
  },
  { additionalProperties: false },
);

export const PackManifestSchema = Type.Object(
  {
    name: slug,
    version,
    domain: text,
    description: text,
    parts,
    knowledge: paths,
    templates: paths,
    checkers: paths,
    profileSchema: RelativeFileSchema,
    changelog: Type.Optional(RelativeFileSchema),
    targetsField: Type.Optional(text),
    instructionBudgets: Type.Optional(Type.Array(InstructionBudgetSchema)),
    researchTopics: Type.Array(
      Type.Object({ path: RelativeFileSchema, reviewed: date }),
    ),
  },
  { $schema: JSON_SCHEMA_DRAFT },
);

export const HarnessManifestSchema = Type.Object(
  {
    metaHarnessVersion: text,
    kbEntry: Type.Optional(text),
    kbDate: Type.Optional(date),
    generatedAt: isoDate,
    profile,
    files: Type.Record(
      RelativeFileSchema,
      Type.Union([
        Type.Object(
          { sha256: Type.String({ pattern: "^[a-fA-F0-9]{64}$" }) },
          { additionalProperties: false },
        ),
        Type.Object({ symlink: text }, { additionalProperties: false }),
      ]),
      { additionalProperties: false },
    ),
    parts: Type.Optional(partMap),
    packs: Type.Optional(Type.Array(packVersion, { minItems: 1 })),
    deleted: Type.Optional(paths),
    machineSetup: Type.Optional(
      Type.Array(
        Type.Object({
          what: text,
          where: text,
          rediscover: text,
          appliedAt: isoDate,
        }),
      ),
    ),
    machineLocal: Type.Optional(
      Type.Array(
        Type.Object({
          path: RelativeFileSchema,
          rediscover: text,
          generatedAt: isoDate,
        }),
      ),
    ),
    overlays: Type.Optional(
      Type.Array(Type.Object({ name: text, appliedAt: isoDate })),
    ),
  },
  {
    $schema: JSON_SCHEMA_DRAFT,
    anyOf: [{ required: ["kbEntry"] }, { required: ["kbDate"] }],
    dependentRequired: { parts: ["packs"], packs: ["parts"] },
  },
);

const planFile = Type.Union([
  Type.Object(
    {
      path: outputPath,
      content: Type.String(),
      parts,
      adopted: Type.Optional(Type.Boolean()),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      path: outputPath,
      template: RelativeFileSchema,
      variables: Type.Record(Type.String(), Type.String()),
      parts,
      adopted: Type.Optional(Type.Boolean()),
    },
    { additionalProperties: false },
  ),
]);
export const PlanSchema = Type.Object(
  {
    pack: slug,
    profile,
    files: Type.Array(planFile),
    symlinks: Type.Array(
      Type.Object(
        {
          path: outputPath,
          target: text,
          parts,
          adopted: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { $schema: JSON_SCHEMA_DRAFT, additionalProperties: false },
);

export type HarnessPart = Type.Static<typeof part>;
export type HarnessParts = Type.Static<typeof partMap>;
export type PackManifest = Type.Static<typeof PackManifestSchema>;
export type HarnessManifest = Type.Static<typeof HarnessManifestSchema>;
export type FileRecord = HarnessManifest["files"][string];
export type Plan = Type.Static<typeof PlanSchema>;
export type InstructionBudget = Type.Static<typeof InstructionBudgetSchema>;

function parser<const Definition extends object>(definition: Definition) {
  const validator = Schema.Compile(definition);
  return (value: unknown): Type.Static<Definition> => {
    const [valid, errors] = validator.Errors(value);
    if (!valid)
      throw new Error(
        errors
          .map((error) => `${error.instancePath || "/"}: ${error.message}`)
          .join("; "),
      );
    return validator.Parse(value);
  };
}

export const parsePlan = parser(PlanSchema);
export const parsePackManifest = parser(PackManifestSchema);
const parseHarness = parser(HarnessManifestSchema);
export function parseHarnessManifest(value: unknown): HarnessManifest {
  const manifest = parseHarness(value);
  for (const [part, paths] of Object.entries(manifest.parts ?? {})) {
    for (const path of paths) {
      if (!Object.hasOwn(manifest.files, path))
        throw new Error(`parts.${part}: ${path} is absent from files`);
    }
  }
  return manifest;
}
export function relativeFile(value: unknown, field: string): string {
  try {
    return parser(RelativeFileSchema)(value);
  } catch {
    throw new Error(`${field}: expected a relative file path within its root`);
  }
}
export function reviewedDate(value: unknown, field: string): string {
  try {
    return parser(date)(value);
  } catch {
    throw new Error(
      `${field}: expected a valid YYYY-MM-DD date, got ${String(value)}`,
    );
  }
}

export function compileProfileSchema(value: unknown) {
  const meta = Schema.Meta[JSON_SCHEMA_DRAFT];
  if (!meta || !Schema.IsSchema(value) || !Schema.Compile(meta).Check(value)) {
    throw new Error("Invalid profile JSON Schema (expected Draft 2020-12)");
  }
  const serialized = JSON.stringify(value);
  if (/"\$ref"\s*:\s*"(?!#)/.test(serialized))
    throw new Error("Profile schema references must be local (#/$defs)");
  return Schema.Compile(value);
}
