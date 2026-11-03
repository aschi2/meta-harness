import { join } from "node:path";
import { symlink, rename, mkdir } from "node:fs/promises";
const [promptFile, worktree, evidenceFile, mode = "change", resultPath] =
  Bun.argv.slice(2);
if (!promptFile || !worktree || !evidenceFile)
  throw new Error("Missing fake agent arguments");
const prompt = await Bun.file(promptFile).text();
if (!prompt.includes("Run contract"))
  throw new Error("Missing maintenance prompt");
const git = (...argv: string[]) => {
  const result = Bun.spawnSync(["git", ...argv], { cwd: worktree });
  if (result.exitCode) throw new Error(result.stderr.toString());
};
if (mode === "wait" || mode === "tree") {
  const child =
    mode === "tree"
      ? Bun.spawn([process.execPath, "-e", "setInterval(()=>{},1000)"], {
          stdout: "ignore",
          stderr: "ignore",
        })
      : undefined;
  if (resultPath)
    await Bun.write(
      resultPath,
      JSON.stringify({ pid: process.pid, child: child?.pid }),
    );
  await Bun.sleep(120_000);
}
if (
  mode === "self-commit" ||
  mode === "history" ||
  mode === "committed-over-limit"
) {
  await Bun.write(join(worktree, "sample.txt"), "intermediate\n".repeat(300));
  git("add", "-A");
  git("commit", "-m", "Agent commit that must not be published");
  git("checkout", "--detach");
}
if (mode === "binary")
  await Bun.write(join(worktree, "binary.dat"), new Uint8Array([0, 1, 2]));
else if (mode === "rename")
  await rename(join(worktree, "sample.txt"), join(worktree, "renamed.txt"));
else if (mode === "submodule") {
  const vendor = join(worktree, "vendor");
  await mkdir(vendor);
  for (const argv of [
    ["init", "-b", "main"],
    ["config", "user.name", "Fixture"],
    ["config", "user.email", "fixture@example.invalid"],
  ]) {
    const result = Bun.spawnSync(["git", ...argv], { cwd: vendor });
    if (result.exitCode) throw new Error(result.stderr.toString());
  }
  await Bun.write(join(vendor, "file.txt"), "nested repo\n");
  Bun.spawnSync(["git", "add", "-A"], { cwd: vendor });
  Bun.spawnSync(
    ["git", "-c", "commit.gpgsign=false", "commit", "-m", "Submodule"],
    { cwd: vendor },
  );
} else if (mode === "protected" || mode === "protected-case") {
  const ci = mode === "protected-case" ? ".GITHUB" : ".github";
  await mkdir(join(worktree, ci, "workflows"), { recursive: true });
  await Bun.write(
    join(worktree, ci, "workflows/attack.yml"),
    "name: attack\n",
  );
} else if (mode === "custom-protected")
  await Bun.write(join(worktree, "sensitive.txt"), "attack\n");
else if (mode !== "no-change")
  await Bun.write(
    join(worktree, mode === "untracked" ? "new.txt" : "sample.txt"),
    mode === "over-limit" || mode === "committed-over-limit"
      ? "new line\n".repeat(500)
      : `${mode}\n`,
  );
if (mode === "symlink-evidence") {
  if (!resultPath) throw new Error("Missing symlink victim");
  await import("node:fs/promises")
    .then(({ unlink }) => unlink(evidenceFile))
    .catch(() => {});
  await symlink(resultPath, evidenceFile);
} else if (mode !== "missing-evidence") {
  const required =
    prompt.match(/  - (.+)/g)?.map((line) => line.slice(4)) ?? [];
  await Bun.write(
    evidenceFile,
    mode === "bad-evidence"
      ? "## unrelated\nOld claims\n"
      : required
          .map(
            (entry) =>
              `## ${entry}\nBefore: original. After: changed. Fixture checks passed.\n`,
          )
          .join("\n"),
  );
}
if (mode === "symlink-prompt") {
  if (!resultPath) throw new Error("Missing symlink victim");
  await import("node:fs/promises").then(({ unlink }) => unlink(promptFile));
  await symlink(resultPath, promptFile);
}
process.stdout.write(`Fake agent ran in ${worktree}\n`);
if (mode === "fail") process.exit(7);
