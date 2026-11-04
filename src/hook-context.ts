import { basename, isAbsolute, relative, resolve, sep } from "node:path";

export const SHELL_TOOLS = new Set([
  "Bash",
  "shell",
  "local_shell",
  "run_command",
  "exec_command",
]);
const SHELLS = new Set(["sh", "bash", "zsh"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

export interface HookContext {
  command: string;
  rawCommand: string;
  cwd: string;
  harness: "claude" | "codex";
  entrypoint: string | null;
  isDelegate: boolean | "unknown";
  commands(command?: string): Invocation[];
  inRepo(root: string): boolean;
}

export interface Invocation {
  words: string[];
}

function heredocDelimiters(
  line: string,
  startingQuote: "'" | '"' | null,
): { delimiters: string[]; quote: "'" | '"' | null } {
  const delimiters: string[] = [];
  let quote = startingQuote;
  for (let index = 0; index < line.length; index++) {
    const character = line[index] ?? "";
    if (quote) {
      if (character === quote) quote = null;
      else if (character === "\\") index++;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "\\") {
      index++;
      continue;
    }
    if (character !== "<" || line[index + 1] !== "<") continue;
    if (line[index + 2] === "<") {
      index += 2;
      continue;
    }
    index += 2;
    if (line[index] === "-") index++;
    while (line[index] === " " || line[index] === "\t") index++;
    const delimiterQuote =
      line[index] === "'" || line[index] === '"' ? line[index] : null;
    if (delimiterQuote) index++;
    let delimiter = "";
    while (index < line.length) {
      const current = line[index] ?? "";
      if (
        delimiterQuote ? current === delimiterQuote : /[\s;&|<>]/.test(current)
      )
        break;
      if (current === "\\" && index + 1 < line.length) index++;
      delimiter += line[index] ?? "";
      index++;
    }
    if (delimiter) delimiters.push(delimiter);
    if (delimiterQuote && line[index] === delimiterQuote) index++;
    index--;
  }
  return { delimiters, quote };
}

function withoutHeredocBodies(command: string): string {
  const lines = command.split(/\r?\n/);
  const kept: string[] = [];
  let delimiters: string[] = [];
  let quote: "'" | '"' | null = null;
  for (const line of lines) {
    if (delimiters.length) {
      if (line.trim() === delimiters[0]) {
        delimiters.shift();
      }
      continue;
    }
    kept.push(line);
    const parsed = heredocDelimiters(line, quote);
    delimiters.push(...parsed.delimiters);
    quote = parsed.quote;
  }
  return kept.join("\n");
}

function tokenize(command: string): string[][] {
  const segments: string[][] = [];
  let segment: string[] = [];
  let word = "";
  let started = false;
  let quote: "'" | '"' | null = null;
  const flushWord = () => {
    if (!started) return;
    segment.push(word);
    word = "";
    started = false;
  };
  const flushSegment = () => {
    flushWord();
    if (segment.length) segments.push(segment);
    segment = [];
  };
  const text = command;
  for (let index = 0; index < text.length; index++) {
    const character = text[index] ?? "";
    if (quote) {
      if (character === quote) quote = null;
      else if (character === "\\" && quote === '"' && index + 1 < text.length)
        word += text[++index] ?? "";
      else word += character;
      started = true;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      started = true;
    } else if (character === "\\" && index + 1 < text.length) {
      word += text[++index] ?? "";
      started = true;
    } else if (character === "#" && !started) {
      while (index < text.length && text[index] !== "\n") index++;
      flushSegment();
    } else if (character === "\n") flushSegment();
    else if (/\s/.test(character)) flushWord();
    else if (";&|()".includes(character)) flushSegment();
    else {
      word += character;
      started = true;
    }
  }
  if (quote) throw new Error("unclosed quote in shell command");
  flushSegment();
  return segments;
}

function executableWords(input: string[]): string[] {
  const words = [...input];
  while (words.length) {
    const name = basename(words[0] ?? "");
    if (
      ASSIGNMENT.test(words[0] ?? "") ||
      ["env", "command", "exec", "sudo", "time", "xcrun"].includes(name)
    ) {
      words.shift();
      continue;
    }
    if ((words[0] ?? "").startsWith("-") && name !== "-") {
      words.shift();
      continue;
    }
    break;
  }
  return words;
}

function invocationList(command: string): Invocation[] {
  const invocations: Invocation[] = [];
  const text = withoutHeredocBodies(command);
  const { plainText, substitutions } = extractBackticks(text);
  for (const substitution of substitutions)
    invocations.push(...invocationList(substitution));
  for (const segment of tokenize(plainText)) {
    let words = executableWords(segment);
    if (!words.length) continue;
    const executable = basename(words[0] ?? "");
    if (SHELLS.has(executable)) {
      const commandIndex = words.findIndex(
        (word, index) => index > 0 && /^-[^-]/.test(word) && word.includes("c"),
      );
      if (commandIndex >= 0 && commandIndex + 1 < words.length) {
        invocations.push(...invocationList(words[commandIndex + 1] ?? ""));
        continue;
      }
      words = words.slice(1);
      if (!words.length) continue;
    }
    invocations.push({ words });
  }
  return invocations;
}

function extractBackticks(command: string): {
  plainText: string;
  substitutions: string[];
} {
  const substitutions: string[] = [];
  let plainText = "";
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < command.length; index++) {
    const character = command[index] ?? "";
    if (quote) {
      if (quote === '"' && character === "`") {
        const parsed = readBacktick(command, index);
        substitutions.push(parsed.substitution);
        plainText += " ";
        index = parsed.end;
        continue;
      }
      if (character === quote) quote = null;
      if (character === "\\" && index + 1 < command.length) {
        plainText += character + (command[++index] ?? "");
        continue;
      }
      plainText += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      plainText += character;
      continue;
    }
    if (character !== "`") {
      plainText += character;
      continue;
    }
    const parsed = readBacktick(command, index);
    substitutions.push(parsed.substitution);
    plainText += " ";
    index = parsed.end;
  }
  return { plainText, substitutions };
}

function readBacktick(
  command: string,
  opening: number,
): { substitution: string; end: number } {
  let substitution = "";
  for (let index = opening + 1; index < command.length; index++) {
    const character = command[index] ?? "";
    if (character === "\\" && index + 1 < command.length) {
      substitution += character + (command[++index] ?? "");
    } else if (character === "`") return { substitution, end: index };
    else substitution += character;
  }
  throw new Error("unclosed backtick command substitution");
}

function shellQuote(value: string): string {
  return value === "" ? "''" : `'${value.replaceAll("'", "'\\''")}'`;
}

export function contextFromEvent(
  input: unknown,
  eventName: "pre-tool-use" | "stop",
  harnessOverride?: "claude" | "codex",
): HookContext {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new TypeError("hook input must be an object");
  const event = input as Record<string, unknown>;
  const toolName = event.tool_name;
  if (eventName === "pre-tool-use" && typeof toolName !== "string")
    throw new TypeError("tool_name must be a string");
  const rawToolInput = event.tool_input ?? {};
  if (
    !rawToolInput ||
    typeof rawToolInput !== "object" ||
    Array.isArray(rawToolInput)
  )
    throw new TypeError("tool_input must be an object");
  const toolInput = rawToolInput as Record<string, unknown>;
  const rawCommand = toolInput.command ?? toolInput.cmd ?? "";
  let command: string;
  if (Array.isArray(rawCommand))
    command = rawCommand.map((part) => shellQuote(String(part))).join(" ");
  else if (typeof rawCommand === "string") command = rawCommand;
  else throw new TypeError("shell command must be a string or argv array");
  const cwdValue = event.cwd;
  if (typeof cwdValue !== "string") throw new TypeError("cwd must be a string");
  if (!isAbsolute(cwdValue)) throw new TypeError("cwd must be absolute");
  const cwd = resolve(cwdValue);
  const eventHarness = event.harness;
  const harness =
    harnessOverride ??
    (eventHarness === "claude" || eventHarness === "codex"
      ? eventHarness
      : toolName === "Bash"
        ? "claude"
        : "codex");
  const entrypointValue = Object.hasOwn(event, "entrypoint")
    ? event.entrypoint
    : process.env.CLAUDE_CODE_ENTRYPOINT;
  const entrypoint =
    typeof entrypointValue === "string" ? entrypointValue : null;
  return {
    command,
    rawCommand: command,
    cwd,
    harness,
    entrypoint,
    isDelegate: harness === "codex" ? "unknown" : entrypoint === "sdk",
    commands: (override = command) => invocationList(override),
    inRepo: (root) => {
      const fromRoot = relative(resolve(root), cwd);
      return (
        fromRoot === "" ||
        (!isAbsolute(fromRoot) &&
          !fromRoot.startsWith(`..${sep}`) &&
          fromRoot !== "..")
      );
    },
  };
}
