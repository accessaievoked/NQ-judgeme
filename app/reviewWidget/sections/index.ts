// Aggregates every section module in this folder into the handful of
// things the rest of the app needs: the default html/css for a shop that
// hasn't customized its widget (reviewWidget/defaults.server.ts), the
// TARGETS/icons catalog the style compiler and editor use
// (reviewWidget/styleCatalog.ts), and which controls the editor's settings
// panel should render for a given selection (app.widget-editor.jsx).
//
// Each module owns its own default markup + CSS + its own settings
// controller (the `controls` array — see types.ts/controls.ts); this file
// just lists them in render order and concatenates. Adding a new fixed
// piece of the widget means adding one file here and one line in SECTIONS
// below — nothing else has to change.
import type { SectionModule, SectionControl } from "./types";
import { rootSection } from "./root";
import { summarySection, summaryStarsSection, summaryCountSection } from "./summary";
import { emptyStateSection } from "./emptyState";
import { reviewCardSection, reviewCardChildTargets } from "./reviewCard";
import { reviewsListSection, moreLinkHtml, moreLinkCss } from "./reviewsList";
import { BLOCK_MODULES, blockModuleFor, BLOCKS_DEFAULT_CSS, avatarInitialsTarget } from "./blocks";

// Render order for both the composed default template (HTML) and the
// composed default stylesheet (CSS) below. The inline quick-rate box used
// to live here (rate.ts) — pulled out on purpose: leaving a review is
// moving to its own dedicated page instead of an inline widget control.
export const SECTIONS: SectionModule[] = [
  rootSection,
  summarySection,
  summaryStarsSection,
  summaryCountSection,
  emptyStateSection,
  reviewCardSection,
  ...reviewCardChildTargets,
  avatarInitialsTarget,
  reviewsListSection,
];

export function sectionFor(target: string) {
  return SECTIONS.find((s) => s.target === target) || null;
}

// { value, label, selector } — same shape reviewWidget/styleCatalog.ts's
// TARGETS used to hardcode, now derived from the section modules above.
export const SECTION_TARGETS = SECTIONS.map((s) => ({ value: s.target, label: s.label, selector: s.selector }));
export const SECTION_ICONS: Record<string, string> = Object.fromEntries(SECTIONS.map((s) => [s.target, s.icon]));

// The widget editor's settings panel calls one of these to find out exactly
// which fields to render for the current selection — a fixed target looks
// itself up directly, a review-card block looks itself up by type (since
// many instances of one type share a single controller).
export function controlsForTarget(target: string): SectionControl[] {
  return sectionFor(target)?.controls ?? [];
}

export function controlsForBlockType(type: string): SectionControl[] {
  return blockModuleFor(type)?.controls ?? [];
}

// The seed markup/CSS for a shop that hasn't customized its review widget
// yet — see reviewWidget/defaults.server.ts, which just re-exports these.
// Mirrors what extensions/theme-widget used to render as hardcoded HTML, so
// turning on customization doesn't change how any existing storefront
// looks — every section below reproduces exactly the markup/CSS it used to
// contribute when this was one flat file.
export const DEFAULT_WIDGET_HTML = `${summarySection.html}
<!--EMPTY-->
${emptyStateSection.html}
<!--/EMPTY-->
<!--ITEM-->
${reviewCardSection.html}
<!--/ITEM-->
<!--MORE-->
${moreLinkHtml}
<!--/MORE-->`;

export const DEFAULT_WIDGET_CSS = [
  rootSection.css,
  reviewsListSection.css,
  summarySection.css,
  summaryStarsSection.css,
  summaryCountSection.css,
  reviewCardSection.css,
  BLOCKS_DEFAULT_CSS,
  emptyStateSection.css,
  moreLinkCss,
]
  .filter(Boolean)
  .join("\n");

export { BLOCK_MODULES, blockModuleFor };
