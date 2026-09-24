// Compiles the "write a review" form page's style blocks into real CSS — the
// ReviewFormTheme-backed counterpart to reviewWidget/styleCompiler.ts, kept
// entirely separate on purpose: that file's TARGETS come from
// reviewWidget/sections/index.ts's SECTIONS list, which only ever describes
// the read-only reviews-*list* widget (WidgetTheme) that app.widget-editor.jsx
// edits. The write-form's 5 targets used to be folded into that same SECTIONS
// list/TARGETS catalog (reachable only from the widget editor's sidebar, not
// its click-to-select preview) — pulled out into their own module here so
// the write-form template has its own independent target catalog, and
// app.widget-editor.jsx's underlying data has no knowledge of it at all
// anymore, not just a hidden sidebar entry.
//
// No .server suffix: shared by the storefront renderer
// (routes/apps.reviews.write.jsx) and the review-form builder's client-side
// preview (routes/app.review-form-editor.jsx), same split as
// styleCompiler.ts/styleBlocks.server.ts.
import { PROPERTIES, type StyleBlock } from "./styleCatalog";
import {
  writeFormSection,
  writeFormHeadingSection,
  writeFormStarsSection,
  writeFormStarsFilledSection,
  writeFormInputSection,
  writeFormSubmitSection,
} from "./sections/writeForm";

// The write-form's own flat target list — { value, label, selector, icon } —
// same shape reviewWidget/styleCatalog.ts's TARGETS has, built directly from
// each SectionModule instead of via the shared SECTIONS registry.
// writeFormStarsFilledSection is listed BEFORE writeFormStarsSection on
// purpose: its selector (".jm-write-review__star.is-selected") is a strict
// subset of the empty one's (".jm-write-review__star") — a filled star
// element matches both — and the click-to-select iframe in
// app.review-form-editor.jsx walks this list in order and takes the first
// match, so the more specific one has to come first or a click on a filled
// star would always resolve to "empty star" instead.
export const REVIEW_FORM_TARGETS = [
  writeFormSection,
  writeFormHeadingSection,
  writeFormStarsFilledSection,
  writeFormStarsSection,
  writeFormInputSection,
  writeFormSubmitSection,
].map((s) => ({ value: s.target, label: s.label, selector: s.selector, icon: s.icon }));

const TARGET_SELECTORS: Record<string, string> = Object.fromEntries(REVIEW_FORM_TARGETS.map((t) => [t.value, t.selector]));
const PROPERTY_NAMES = new Set<string>(PROPERTIES.map((p) => p.value));

function sanitizeValue(value: string): string {
  // Blocks are meant to hold a single CSS value, not extra rules — strip
  // anything that could close the declaration/rule early.
  return value.replace(/[;{}]/g, "").trim();
}

export function compileReviewFormStyleBlocks(blocks: StyleBlock[] | null | undefined): string {
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
