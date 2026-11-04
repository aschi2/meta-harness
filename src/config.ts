import { homedir } from "node:os";
import { join } from "node:path";

export function configDirectory(
  home = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  const directory =
    process.platform === "win32"
      ? (env.APPDATA ?? join(home, "AppData", "Roaming"))
      : join(home, ".config");
  return join(directory, "meta-harness");
}
