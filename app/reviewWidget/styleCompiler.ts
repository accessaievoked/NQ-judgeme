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

// Structural, not stylistic — every "Free position" block needs SOME
// positioned ancestor to be placed relative to, or it falls back to the
// whole document (a block can render outside the widget, even outside the
// preview iframe entirely). This can't just live in reviewCard.ts/
// container.ts's own default CSS: every caller of compileStyleBlocks joins
// its output AFTER a shop's *saved* `theme.css` (apps.reviews.jsx,
// app.widget-style.jsx, app.widget-editor.jsx all do
// `[css, compileStyleBlocks(...)].join(...)`), and that saved css is a snapshot
// frozen at whatever the defaults were the last time the shop hit Save —
// unrelated later fixes to the *default* CSS never reach a shop that
// already has a row. Emitting this rule from compileStyleBlocks itself,
// unconditionally, means it's always present, in every render path, last in
// the cascade (so it wins over anything stale before it), regardless of what
// any given shop's saved theme.css does or doesn't contain.
const STRUCTURAL_CSS = `.jm-reviews__item, .jm-reviews__item-group { position: relative; }`;

export function compileStyleBlocks(blocks: StyleBlock[] | null | undefined): string {
  if (!blocks || blocks.length === 0) return STRUCTURAL_CSS;

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

  const compiled = Array.from(byTarget.entries())
    .map(([selector, decls]) => `${selector} {\n${decls.join("\n")}\n}`)
    .join("\n");

  return `${STRUCTURAL_CSS}\n${compiled}`;
}
