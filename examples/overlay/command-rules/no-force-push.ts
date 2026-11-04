import { basename } from "node:path";

export const id = "no-force-push";
const optionsWithValues = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
]);

interface Context {
  commands(): Array<{ words: string[] }>;
  rawCommand: string;
}

function hasRawForcePush(command: string): boolean {
  for (const match of command.matchAll(/\bgit\s+push\b[^\n;&|]*/g)) {
    const segment = match[0];
    if (segment.includes("--force-with-lease")) continue;
    if (/(?:--force(?:\b|=)|(?:^|\s)-f(?:\s|$))/.test(segment)) return true;
  }
  return false;
}

export function check(context: Context): string | null {
  let commands: Array<{ words: string[] }> = [];
  let parseFailed = false;
  try {
    commands = context.commands();
  } catch {
    parseFailed = true;
  }
  for (const { words } of commands) {
    if (basename(words[0] ?? "") !== "git") continue;
    let subcommand: string | undefined;
    const arguments_: string[] = [];
    for (let index = 1; index < words.length; index++) {
      const word = words[index] ?? "";
      if (optionsWithValues.has(word)) {
        index++;
        continue;
      }
      if (word.startsWith("-")) {
        arguments_.push(word);
        continue;
      }
      subcommand = word;
      arguments_.push(...words.slice(index + 1));
      break;
    }
    if (subcommand !== "push") continue;
    const force = arguments_.some(
      (argument) => argument === "--force" || argument === "-f",
    );
    const lease = arguments_.some(
      (argument) =>
        argument === "--force-with-lease" ||
        argument.startsWith("--force-with-lease="),
    );
    if (force && !lease)
      return "Use git push --force-with-lease so the push cannot overwrite remote commits added since your last fetch.";
  }
  if (parseFailed && hasRawForcePush(context.rawCommand))
    return "Use git push --force-with-lease so the push cannot overwrite remote commits added since your last fetch.";
  return null;
}
