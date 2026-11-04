import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function assertPersistentHookInstall(
  modulePath = fileURLToPath(import.meta.url),
): void {
  const path = realpathSync(modulePath).replaceAll("\\", "/").toLowerCase();
  const temporaryCache =
    /\/(?:bunx-[^/]+\/node_modules|_npx\/[^/]+\/node_modules)\//.test(path);
  if (temporaryCache)
    throw new Error(
      "Hooks require a persistent installation; this CLI is running from a temporary bunx/npx cache. Run bun add -g meta-harness, then run meta-harness again. One-off commands can still use bunx.",
    );
}

// ponytail: Compiled binaries are deferred: packs and checkers need embedding, and process.execPath would become the CLI rather than Bun.
