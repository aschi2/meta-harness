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
    "^(?!/)(?!.*\\\\)(?!.*:)(?!.*//)(?!.*(?:^|/)\\.{1,2}(?:/|$))(?!.*[/]$)(?!.*[. ](?:/|$))(?!.*(?:^|/)(?:[cC][oO][nN]|[pP][rR][nN]|[aA][uU][xX]|[nN][uU][lL]|[cC][oO][mM][1-9]|[lL][pP][tT][1-9])(?:[.]|/|$))[^\\u0000]+$",
});
export const RESERVED_PATH_PATTERN =
  "(?:^|/)\\.(?:[gG][iI][tT]|[hH][aA][rR][nN][eE][sS][sS])(?:/|$)";
const outputPath = Type.Intersect([
  RelativeFileSchema,
  Type.String({ pattern: `^(?!.*${RESERVED_PATH_PATTERN}).*$` }),
]);
const part = Type.Enum(HARNESS_PARTS);
const parts = Type.Array(part, { minItems: 1, uniqueItems: true });
const paths = Type.Array(RelativeFileSchema);
const trackedMode = Type.Union([
  Type.Literal("managed"),
  Type.Literal("owner"),
]);
const fileMode = Type.Union([trackedMode, Type.Literal("seed")]);
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

const cron = Type.String({ pattern: "^[0-9*/,-]+(?: [0-9*/,-]+){4}$" });
export const CommandRuleFixtureSchema = Type.Object(
  {
    ruleId: slug,
    cases: Type.Array(
      Type.Object(
        {
          event: Type.Literal("pre-tool-use"),
          inputShape: Type.Union([
            Type.Literal("claude"),
            Type.Literal("codex"),
          ]),
          input: Type.Record(Type.String(), Type.Unknown()),
          expected: Type.Union([Type.Literal("block"), Type.Null()]),
          entrypoint: Type.Optional(Type.Union([Type.String(), Type.Null()])),
        },
        { additionalProperties: false },
      ),
      {
        minItems: 4,
        allOf: ["claude", "codex"].flatMap((inputShape) =>
          ["block", null].map((expected) => ({
            contains: {
              type: "object",
              properties: {
                inputShape: { const: inputShape },
                expected: { const: expected },
              },
              required: ["inputShape", "expected"],
            },
          })),
        ),
      },
    ),
  },
  { $schema: JSON_SCHEMA_DRAFT, additionalProperties: false },
);

export const RoleSchema = Type.Object(
  {
    id: slug,
    title: text,
    job: Type.String({ pattern: "^[^\\r\\n]+$" }),
    prompt: text,
    defaultCadence: cron,
    perRun: Type.Object(
      {
        maxPullRequests: Type.Integer({ minimum: 0, maximum: 1 }),
        maxChangedLines: Type.Integer({ minimum: 1 }),
      },
      { additionalProperties: false },
    ),
    requiredEvidence: Type.Array(text, { minItems: 1 }),
    neverDo: Type.Array(text, { minItems: 1 }),
    requires: Type.Array(
      Type.Union(
        [
          "repo",
          "ci",
          "local-toolchain",
          "simulator",
          "transcripts",
          "connectors",
        ].map((value) => Type.Literal(value)),
      ),
      { uniqueItems: true },
    ),
    review: Type.Literal("pull-request"),
    sources: Type.Array(Type.String({ format: "uri", pattern: "^https://" }), {
      minItems: 1,
    }),
  },
  { $schema: JSON_SCHEMA_DRAFT, additionalProperties: false },
);
const argv = Type.Array(text, { minItems: 1 });
export const MaintenanceSchema = Type.Object(
  {
    roles: Type.Record(
      slug,
      Type.Object(
        { enabled: Type.Boolean(), cadence: cron },
        { additionalProperties: false },
      ),
      { additionalProperties: false },
    ),
  },
  { $schema: JSON_SCHEMA_DRAFT, additionalProperties: false },
);

export const MaintenanceUserSchema = Type.Object(
  {
    agent: Type.Array(text, {
      minItems: 1,
      allOf: ["prompt_file", "worktree"].map((name) => ({
        contains: { type: "string", pattern: `\\{${name}\\}` },
      })),
    }),
    publish: Type.Optional(argv),
    verify: Type.Optional(argv),
    timeoutMinutes: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
    protectedPaths: Type.Optional(Type.Array(text)),
  },
  { $schema: JSON_SCHEMA_DRAFT, additionalProperties: false },
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
    maintenance: Type.Optional(paths),
    overlay: Type.Optional(Type.Boolean()),
    commandRules: Type.Optional(paths),
    codeRules: Type.Optional(paths),
    ruleTests: Type.Optional(paths),
    preferences: Type.Optional(profile),
    ownerPaths: Type.Optional(Type.Array(outputPath, { uniqueItems: true })),
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
          {
            sha256: Type.String({ pattern: "^[a-fA-F0-9]{64}$" }),
            mode: Type.Optional(trackedMode),
          },
          { additionalProperties: false },
        ),
        Type.Object(
          { symlink: text, mode: Type.Optional(trackedMode) },
          { additionalProperties: false },
        ),
      ]),
      { additionalProperties: false },
    ),
    seedFiles: Type.Optional(Type.Array(outputPath, { uniqueItems: true })),
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
      mode: Type.Optional(fileMode),
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
      mode: Type.Optional(fileMode),
    },
    { additionalProperties: false },
  ),
]);
export const PlanSchema = Type.Object(
  {
    pack: slug,
    hooks: Type.Optional(Type.Boolean()),
    profile,
    files: Type.Array(planFile),
    symlinks: Type.Array(
      Type.Object(
        {
          path: outputPath,
          target: text,
          parts,
          adopted: Type.Optional(Type.Boolean()),
          mode: Type.Optional(fileMode),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { $schema: JSON_SCHEMA_DRAFT, additionalProperties: false },
);

export type Role = Type.Static<typeof RoleSchema>;
export type MaintenanceUserConfig = Type.Static<typeof MaintenanceUserSchema>;
export type MaintenanceConfig = Type.Static<typeof MaintenanceSchema>;

export type HarnessPart = Type.Static<typeof part>;
export type HarnessParts = Type.Static<typeof partMap>;
export type PackManifest = Type.Static<typeof PackManifestSchema>;
export type HarnessManifest = Type.Static<typeof HarnessManifestSchema>;
export type FileRecord = HarnessManifest["files"][string];
export type FileMode = Type.Static<typeof fileMode>;
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

export const parseCommandRuleFixture = parser(CommandRuleFixtureSchema);
export const parseMaintenanceUser = parser(MaintenanceUserSchema);
export const parseMaintenance = parser(MaintenanceSchema);
export const parseRole = parser(RoleSchema);
export const parsePlan = parser(PlanSchema);
export const parsePackManifest = parser(PackManifestSchema);
const parseHarness = parser(HarnessManifestSchema);
export function parseHarnessManifest(value: unknown): HarnessManifest {
  const manifest = parseHarness(value);
  const seeds = new Set(manifest.seedFiles ?? []);
  for (const path of seeds) {
    if (Object.hasOwn(manifest.files, path))
      throw new Error(`${path}: cannot belong to both files and seedFiles`);
  }
  for (const [part, paths] of Object.entries(manifest.parts ?? {})) {
    for (const path of paths) {
      if (!Object.hasOwn(manifest.files, path) && !seeds.has(path))
        throw new Error(
          `parts.${part}: ${path} is absent from files and seedFiles`,
        );
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
