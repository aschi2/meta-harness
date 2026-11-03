import { validate } from "./validate.ts";

const [command, path = ".", ...extra] = Bun.argv.slice(2);
if (command !== "validate" || extra.length > 0) {
  process.stderr.write("Usage: bun run src/cli.ts validate [path]\n");
  process.exitCode = 1;
} else {
  const result = await validate(path);
  if (result.errors.length > 0) {
    process.stderr.write(`${result.errors.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`Validated ${result.manifests.length} pack(s).\n`);
  }
}
