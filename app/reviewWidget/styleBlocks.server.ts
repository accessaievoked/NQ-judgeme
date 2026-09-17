// Compiles the structured "style blocks" (see styleCatalog.ts for the
// target/property catalog the admin editor's dropdowns are built from) into
// real CSS. This is the "normal mode" counterpart to the raw CSS textarea's
// "complete coder mode" — appended after it, so a block always wins over the
// raw stylesheet for the same property.
import { TARGETS, PROPERTIES, type StyleBlock } from "./styleCatalog";

const TARGET_SELECTORS: Record<string, string> = Object.fromEntries(TARGETS.map((t) => [t.value, t.selector]));
const PROPERTY_NAMES = new Set<string>(PROPERTIES.map((p) => p.value));

function sanitizeValue(value: string): string {
  // Blocks are meant to hold a single CSS value, not extra rules — strip
  // anything that could close the declaration/rule early.
  return value.replace(/[;{}]/g, "").trim();
}

export function compileStyleBlocks(blocks: StyleBlock[] | null | undefined): string {
  if (!blocks || blocks.length === 0) return "";

  const byTarget = new Map<string, string[]>();
  for (const block of blocks) {
    const selector = TARGET_SELECTORS[block.target];
    if (!selector || !PROPERTY_NAMES.has(block.property)) continue;
    const value = sanitizeValue(String(block.value ?? ""));
    if (!value) continue;
    const decls = byTarget.get(selector) ?? [];
    decls.push(`  ${block.property}: ${value};`);
    byTarget.set(selector, decls);
  }

  return Array.from(byTarget.entries())
    .map(([selector, decls]) => `${selector} {\n${decls.join("\n")}\n}`)
    .join("\n");
}
