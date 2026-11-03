import { appendFile } from "node:fs/promises";
const [branch, title, bodyFile, resultPath, mode] = Bun.argv.slice(2);
if (!branch || !title || !bodyFile || !resultPath)
  throw new Error("Missing fake publish arguments");
const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
  cwd: process.cwd(),
});
const branchHead = Bun.spawnSync(["git", "rev-parse", `refs/heads/${branch}`], {
  cwd: process.cwd(),
});
if (head.stdout.toString() !== branchHead.stdout.toString())
  throw new Error("Publisher worktree is not on the core commit");
await appendFile(
  resultPath,
  JSON.stringify({ branch, title, body: await Bun.file(bodyFile).text() }) +
    "\n",
);
process.stdout.write("Fake publisher called.\n");
if (mode === "fail") process.exit(8);
