export function frontmatter(content: string): {
  metadata: unknown;
  body: string;
} {
  content = content.replace(/^\uFEFF/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match?.[1]) throw new Error("Missing YAML frontmatter");
  return {
    metadata: Bun.YAML.parse(match[1]),
    body: content
      .slice(match[0].length)
      .replace(/^(?:\r?\n)+|(?:\r?\n)+$/g, ""),
  };
}
