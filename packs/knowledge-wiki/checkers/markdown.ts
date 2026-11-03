import { Parser, type Node } from "commonmark";

export interface Reference {
  target: string;
  wiki: boolean;
}
function text(node: Node): string {
  let result = "";
  const walker = node.walker();
  let event;
  while ((event = walker.next())) {
    if (event.entering && event.node.type === "text")
      result += event.node.literal ?? "";
  }
  return result;
}
export function markdown(body: string): {
  references: Reference[];
  headings: string[];
} {
  const document = new Parser().parse(body);
  const references: Reference[] = [];
  const headings: string[] = [];
  const walker = document.walker();
  let event;
  while ((event = walker.next())) {
    if (!event.entering) continue;
    const node = event.node;
    if (node.type === "heading" && node.level > 1) headings.push(text(node));
    if (node.type === "link") {
      references.push({ target: node.destination ?? "", wiki: false });
      walker.resumeAt(node, false);
      continue;
    }
    if (node.type === "image") {
      walker.resumeAt(node, false);
      continue;
    }
    if (node.type !== "text" || node.prev?.type === "text") continue;
    let prose = node.literal ?? "";
    let sibling = node.next;
    while (sibling?.type === "text") {
      prose += sibling.literal ?? "";
      sibling = sibling.next;
    }
    for (const match of prose.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
      const target = match[1]?.split("|", 1)[0];
      if (target) references.push({ target, wiki: true });
    }
  }
  return { references, headings };
}
