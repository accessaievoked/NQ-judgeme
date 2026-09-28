// Compiles the "all reviews" page's style blocks into real CSS — the
// AllReviewsTheme-backed counterpart to reviewWidget/reviewFormStyleCompiler.ts
// (which does the same for ReviewFormTheme/the write-a-review page) and
// reviewWidget/styleCompiler.ts (WidgetTheme/the inline widget). Kept
// entirely separate on purpose, same reasoning as reviewFormStyleCompiler.ts:
// this page's targets (reviewWidget/sections/allReviewsPage.ts) are only
// ever reachable from its own builder (app.review-all-editor.jsx), not
// app.widget-editor's sidebar or click-to-select preview.
//
// No .server suffix: shared by the storefront renderer
// (routes/apps.reviews.all.jsx) and the builder's client-side preview
// (routes/app.review-all-editor.jsx).
import { PROPERTIES, type StyleBlock } from "./styleCatalog";
import { ALL_REVIEWS_SECTIONS } from "./sections/allReviewsPage";

// { value, label, selector, icon } — same shape reviewFormStyleCompiler.ts's
// REVIEW_FORM_TARGETS has, built directly from each SectionModule.
export const ALL_REVIEWS_TARGETS = ALL_REVIEWS_SECTIONS.map((s) => ({
  value: s.target,
  label: s.label,
  selector: s.selector,
  icon: s.icon,
}));

const TARGET_SELECTORS: Record<string, string> = Object.fromEntries(ALL_REVIEWS_TARGETS.map((t) => [t.value, t.selector]));
const PROPERTY_NAMES = new Set<string>(PROPERTIES.map((p) => p.value));

function sanitizeValue(value: string): string {
  // Blocks are meant to hold a single CSS value, not extra rules — strip
  // anything that could close the declaration/rule early.
  return value.replace(/[;{}]/g, "").trim();
}

export function compileAllReviewsStyleBlocks(blocks: StyleBlock[] | null | undefined): string {
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
