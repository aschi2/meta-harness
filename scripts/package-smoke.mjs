import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const repositoryRoot = resolve(import.meta.dirname, "..");
const packDirectory = resolve(process.argv[2] ?? "");
const temporaryRoot = await mkdtemp(join(tmpdir(), "meta-harness-pack-"));
const extractedDirectory = join(temporaryRoot, "extracted");
const binDirectory = join(temporaryRoot, "bin");
const isolatedHome = join(temporaryRoot, "home");
const overlayDirectory = join(temporaryRoot, "overlay");
const targetDirectory = join(temporaryRoot, "harness");
const planPath = join(temporaryRoot, "plan.json");
const forbidden = /\/Users\/|robodono|heavy-work-lock|austinchi|aschi2/i;

async function run(command, args, options = {}) {
  const child = Bun.spawn([command, ...args], {
    cwd: options.cwd ?? repositoryRoot,
    env: options.env ?? process.env,
    stdout: "pipe",
    stderr: "pipe",
    stdin: options.stdin === undefined ? "ignore" : "pipe",
    timeout: options.timeout ?? 180_000,
  });
  if (options.stdin !== undefined) {
    child.stdin.write(new TextEncoder().encode(options.stdin));
    child.stdin.end();
  }
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    child.stdout.text(),
    child.stderr.text(),
  ]);
  if (exitCode !== 0)
    throw new Error(
      `${command} ${args.join(" ")} exited ${exitCode}\n${stdout}${stderr}`,
    );
  return stdout;
}

try {
  if (!process.argv[2])
    throw new Error("Pass the directory containing the npm pack tarball");
  await Promise.all([
    mkdir(extractedDirectory),
    mkdir(binDirectory),
    mkdir(isolatedHome),
    mkdir(overlayDirectory),
    mkdir(targetDirectory),
  ]);

  const tarballs = (await readdir(packDirectory)).filter((name) =>
    /^meta-harness-.+\.tgz$/.test(name),
  );
  if (tarballs.length !== 1)
    throw new Error(`Expected one meta-harness tarball in ${packDirectory}`);
  const tarball = join(packDirectory, tarballs[0]);
  const archiveListing = await run("tar", ["-tzf", tarball]);
  const packageFiles = archiveListing
    .split(/\r?\n/)
    .filter(Boolean)
    .map((path) => path.replace(/^package\//, ""));
  const unsafePaths = packageFiles.filter((path) => {
    const segments = path.replaceAll("\\", "/").split("/");
    return (
      segments.some((segment) =>
        /^(?:test|tests|fixtures|__fixtures__)$/i.test(segment),
      ) || forbidden.test(path)
    );
  });
  if (unsafePaths.length)
    throw new Error(`Package contains test files: ${unsafePaths.join(", ")}`);

  await run("tar", ["-xzf", tarball, "-C", extractedDirectory]);
  for (const relativePath of packageFiles) {
    const archivePath = join(extractedDirectory, "package", relativePath);
    const contents = await readFile(archivePath, "utf8");
    const withoutRepositoryUrl = contents.replace(
      /https:\/\/github\.com\/aschi2\/meta-harness(?:\.git)?(?=[/#?\s"'<>)]|$)/gi,
      "",
    );
    const matches = withoutRepositoryUrl.match(forbidden);
    if (matches)
      throw new Error(
        `${relativePath}: package content contains forbidden personal text (${[...new Set(matches)].join(", ")})`,
      );
  }

  process.stdout.write(`npm pack files (${packageFiles.length}):\n`);
  process.stdout.write(
    packageFiles.map((path) => `  ${path}`).join("\n") + "\n",
  );

  const installEnvironment = {
    ...process.env,
    HOME: isolatedHome,
    USERPROFILE: isolatedHome,
    APPDATA: join(isolatedHome, "AppData", "Roaming"),
    BUN_INSTALL_GLOBAL_DIR: join(temporaryRoot, "global"),
    BUN_INSTALL_BIN: binDirectory,
  };
  await run(process.execPath, ["add", "--global", tarball], {
    cwd: temporaryRoot,
    env: installEnvironment,
  });

  const pathEnvironment = `${binDirectory}${delimiter}${process.env.PATH ?? ""}`;
  const installedCli = Bun.which("meta-harness", { PATH: pathEnvironment });
  if (!installedCli)
    throw new Error("Global install did not create meta-harness on PATH");
  const cliEnvironment = {
    ...installEnvironment,
    PATH: pathEnvironment,
    META_HARNESS_OVERLAY: overlayDirectory,
    CODEX_HOME: join(isolatedHome, ".codex"),
    CLAUDE_CONFIG_DIR: join(isolatedHome, ".claude"),
  };
  const invoke = (args, options = {}) =>
    run(installedCli, args, {
      cwd: options.cwd ?? temporaryRoot,
      env: cliEnvironment,
      ...(options.stdin === undefined ? {} : { stdin: options.stdin }),
    });

  const validateOutput = await invoke(["validate"]);
  const fixturePlan = {
    pack: "coding",
    profile: { sizeTier: "S", languages: ["typescript"], targets: [] },
    files: [
      {
        path: "AGENTS.md",
        parts: ["context", "knowledge", "actions", "checks", "loop"],
        mode: "managed",
        content: "# Smoke fixture\n\nGenerated for package verification.\n",
      },
    ],
    symlinks: [],
  };
  await writeFile(planPath, JSON.stringify(fixturePlan));
  const initOutput = await invoke([
    "init",
    "--pack",
    "coding",
    "--plan",
    planPath,
    "--target",
    targetDirectory,
  ]);
  const checkOutput = await invoke(["check", "--target", targetDirectory]);
  const hookOutput = await invoke(
    ["hook", "pre-tool-use", "--overlay", overlayDirectory],
    {
      cwd: targetDirectory,
      stdin: JSON.stringify({
        cwd: targetDirectory,
        tool_name: "exec_command",
        tool_input: { cmd: "echo smoke" },
      }),
    },
  );
  if (JSON.stringify(JSON.parse(hookOutput.trim())) !== "{}")
    throw new Error(
      `Empty overlay hook output was unexpected: ${hookOutput.trim()}`,
    );

  process.stdout.write(`validate: ${validateOutput.trim()}\n`);
  process.stdout.write(`init: ${initOutput.trim()}\n`);
  process.stdout.write(`check: ${checkOutput.trim()}\n`);
  process.stdout.write(`hook: ${hookOutput.trim()}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
