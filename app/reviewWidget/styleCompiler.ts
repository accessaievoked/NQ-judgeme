// Compiles structured style blocks into real CSS. Shared (no .server suffix)
// because both the storefront renderer (apps.reviews.jsx, server-side) and
// the visual widget editor (app.widget-editor.jsx, client-side, for instant
// preview) need it. A block's `target` is either one of the fixed catalog
// entries in styleCatalog.ts (resolved to its class selector) or a
// merchant-added block's id (resolved to `[data-jm-block="id"]`, the
// attribute the editor stamps onto blocks it creates).
import { TARGETS, PROPERTIES, type StyleBlock } from "./styleCatalog";

const TARGET_SELECTORS: Record<string, string> = Object.fromEntries(TARGETS.map((t) => [t.value, t.selector]));
const PROPERTY_NAMES = new Set<string>(PROPERTIES.map((p) => p.value));
const SAFE_BLOCK_ID = /^[a-zA-Z0-9_-]+$/;

function selectorFor(target: string): string | null {
  if (TARGET_SELECTORS[target]) return TARGET_SELECTORS[target];
  if (SAFE_BLOCK_ID.test(target)) return `[data-jm-block="${target}"]`;
  return null;
}

function sanitizeValue(value: string): string {
  // Blocks are meant to hold a single CSS value, not extra rules — strip
  // anything that could close the declaration/rule early.
  return value.replace(/[;{}]/g, "").trim();
}

export function compileStyleBlocks(blocks: StyleBlock[] | null | undefined): string {
  if (!blocks || blocks.length === 0) return "";

  const byTarget = new Map<string, string[]>();
  for (const block of blocks) {
    const selector = selectorFor(block.target);
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
