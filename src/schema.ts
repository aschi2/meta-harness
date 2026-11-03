export const HARNESS_PARTS = [
  "context",
  "knowledge",
  "actions",
  "checks",
  "loop",
] as const;

export type HarnessPart = (typeof HARNESS_PARTS)[number];
export type HarnessParts = Record<HarnessPart, string[]>;
export type PackVersion = { name: string; version: string };

export interface PackManifest extends PackVersion {
  domain: string;
  description: string;
  parts: HarnessPart[];
  knowledge: string[];
  templates: string[];
  checkers: string[];
  researchTopics: { path: string; reviewed: string }[];
}

export type FileRecord = { sha256: string } | { symlink: string };

interface LegacyHarnessManifest {
  metaHarnessVersion: string;
  kbEntry?: string;
  kbDate?: string;
  generatedAt: string;
  profile: { sizeTier: string; languages: string[]; targets: string[] };
  files: Record<string, FileRecord>;
  machineSetup?: {
    what: string;
    where: string;
    rediscover: string;
    appliedAt: string;
  }[];
  machineLocal?: { path: string; rediscover: string; generatedAt: string }[];
  overlays?: { name: string; appliedAt: string }[];
}

// Existing field manifests remain valid; new manifests add both fields together.
export type HarnessManifest = LegacyHarnessManifest &
  (
    | { parts: HarnessParts; packs: PackVersion[] }
    | { parts?: never; packs?: never }
  );

function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field}: expected a non-empty string`);
  }
  return value;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field}: expected an array`);
  return value;
}

function strings(value: unknown, field: string): string[] {
  return array(value, field).map((entry, index) =>
    string(entry, `${field}[${index}]`),
  );
}

export function relativeFile(value: unknown, field: string): string {
  const path = string(value, field);
  const segments = path.split("/");
  if (
    path.includes("\\") ||
    path.includes(":") ||
    segments.some((segment) => ["", ".", ".."].includes(segment))
  ) {
    throw new Error(`${field}: expected a relative file path within its root`);
  }
  return path;
}

export function reviewedDate(value: unknown, field: string): string {
  const date = string(value, field);
  const timestamp = Date.parse(date);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== date
  ) {
    throw new Error(`${field}: expected a valid YYYY-MM-DD date, got ${date}`);
  }
  return date;
}

function isoDate(value: unknown, field: string): string {
  const date = string(value, field);
  reviewedDate(date.slice(0, 10), field);
  if (!Number.isFinite(Date.parse(date))) {
    throw new Error(`${field}: expected an ISO date`);
  }
  return date;
}

function packVersion(value: unknown, field: string): PackVersion {
  const entry = object(value, field);
  const name = string(entry.name, `${field}.name`);
  const version = string(entry.version, `${field}.version`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`${field}.name: expected a lowercase slug`);
  }
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version)) {
    throw new Error(`${field}.version: expected a semantic version`);
  }
  return { name, version };
}

function harnessPart(value: unknown, field: string): HarnessPart {
  const part = HARNESS_PARTS.find((part) => part === value);
  if (!part)
    throw new Error(`${field}: expected one of ${HARNESS_PARTS.join(", ")}`);
  return part;
}

function filePaths(value: unknown, field: string): string[] {
  return array(value, field).map((entry, index) =>
    relativeFile(entry, `${field}[${index}]`),
  );
}

export function parsePackManifest(value: unknown): PackManifest {
  const entry = object(value, "pack");
  const parts = array(entry.parts, "parts").map((part) =>
    harnessPart(part, "parts"),
  );
  if (parts.length === 0 || new Set(parts).size !== parts.length) {
    throw new Error("parts: expected at least one part, without duplicates");
  }
  const knowledge = filePaths(entry.knowledge, "knowledge");
  const researchTopics = array(entry.researchTopics, "researchTopics").map(
    (value, index) => {
      const field = `researchTopics[${index}]`;
      const topic = object(value, field);
      const path = relativeFile(topic.path, `${field}.path`);
      if (!knowledge.includes(path))
        throw new Error(`${field}.path: must be listed in knowledge`);
      return {
        path,
        reviewed: reviewedDate(topic.reviewed, `${field}.reviewed`),
      };
    },
  );
  return {
    ...packVersion(entry, "pack"),
    domain: string(entry.domain, "domain"),
    description: string(entry.description, "description"),
    parts,
    knowledge,
    templates: filePaths(entry.templates, "templates"),
    checkers: filePaths(entry.checkers, "checkers"),
    researchTopics,
  };
}

export function parseHarnessManifest(value: unknown): HarnessManifest {
  const entry = object(value, "harness");
  const profile = object(entry.profile, "profile");
  const files: Record<string, FileRecord> = {};
  for (const [path, value] of Object.entries(object(entry.files, "files"))) {
    relativeFile(path, `files.${path}`);
    const record = object(value, `files.${path}`);
    if ("symlink" in record && !("sha256" in record)) {
      files[path] = {
        symlink: string(record.symlink, `files.${path}.symlink`),
      };
      continue;
    }
    const sha256 = string(record.sha256, `files.${path}.sha256`);
    if ("symlink" in record || !/^[a-f\d]{64}$/i.test(sha256)) {
      throw new Error(
        `files.${path}: expected either a SHA-256 hash or a symlink target`,
      );
    }
    files[path] = { sha256 };
  }
  if (entry.kbEntry === undefined && entry.kbDate === undefined) {
    throw new Error("kbEntry: required (or legacy kbDate)");
  }
  const manifest: LegacyHarnessManifest = {
    metaHarnessVersion: string(entry.metaHarnessVersion, "metaHarnessVersion"),
    generatedAt: isoDate(entry.generatedAt, "generatedAt"),
    profile: {
      sizeTier: string(profile.sizeTier, "profile.sizeTier"),
      languages: strings(profile.languages, "profile.languages"),
      targets: strings(profile.targets, "profile.targets"),
    },
    files,
  };
  if (entry.kbEntry !== undefined)
    manifest.kbEntry = string(entry.kbEntry, "kbEntry");
  if (entry.kbDate !== undefined)
    manifest.kbDate = reviewedDate(entry.kbDate, "kbDate");
  if (entry.machineSetup !== undefined) {
    manifest.machineSetup = array(entry.machineSetup, "machineSetup").map(
      (value) => {
        const setup = object(value, "machineSetup entry");
        return {
          what: string(setup.what, "machineSetup.what"),
          where: string(setup.where, "machineSetup.where"),
          rediscover: string(setup.rediscover, "machineSetup.rediscover"),
          appliedAt: isoDate(setup.appliedAt, "machineSetup.appliedAt"),
        };
      },
    );
  }
  if (entry.machineLocal !== undefined) {
    manifest.machineLocal = array(entry.machineLocal, "machineLocal").map(
      (value) => {
        const setup = object(value, "machineLocal entry");
        return {
          path: relativeFile(setup.path, "machineLocal.path"),
          rediscover: string(setup.rediscover, "machineLocal.rediscover"),
          generatedAt: isoDate(setup.generatedAt, "machineLocal.generatedAt"),
        };
      },
    );
  }
  if (entry.overlays !== undefined) {
    manifest.overlays = array(entry.overlays, "overlays").map((value) => {
      const overlay = object(value, "overlay");
      return {
        name: string(overlay.name, "overlays.name"),
        appliedAt: isoDate(overlay.appliedAt, "overlays.appliedAt"),
      };
    });
  }
  if (entry.parts === undefined && entry.packs === undefined) return manifest;
  const parts = object(entry.parts, "parts");
  function partFiles(part: HarnessPart): string[] {
    const paths = filePaths(parts[part], `parts.${part}`);
    for (const path of paths) {
      if (!Object.hasOwn(files, path))
        throw new Error(`parts.${part}: ${path} is absent from files`);
    }
    return paths;
  }
  return {
    ...manifest,
    parts: {
      context: partFiles("context"),
      knowledge: partFiles("knowledge"),
      actions: partFiles("actions"),
      checks: partFiles("checks"),
      loop: partFiles("loop"),
    },
    packs: array(entry.packs, "packs").map((pack) =>
      packVersion(pack, "packs entry"),
    ),
  };
}
