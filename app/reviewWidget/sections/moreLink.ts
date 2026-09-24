import type { SectionModule } from "./types";
import { typographyControls, spacingControls, appearanceControls, positionControls } from "./controls";

// The "Show all N reviews →" link that appears once a product has more
// published reviews than apps.reviews.jsx's INLINE_REVIEW_LIMIT — wrapped in
// <!--MORE--> markers right after the item loop by sections/index.ts's
// composed DEFAULT_WIDGET_HTML, same as every other fixed piece. Its own
// SectionModule (rather than folding its CSS into reviewsList.ts, where it
// used to live with no dedicated target at all) is what makes it click-
// selectable and fully customizable — position, color, size, spacing — in
// app.widget-editor.jsx, the same as any other fixed target.
export const moreLinkHtml = `<a class="jm-reviews__more" href="{{moreUrl}}">Show all {{count}} reviews →</a>`;

export const moreLinkSection: SectionModule = {
  target: "more",
  label: "Show more button",
  icon: "→",
  selector: ".jm-reviews__more",
  html: null,
  css: `.jm-reviews__more { display: inline-block; margin-top: 12px; color: #1a1a1a; font-weight: 600; text-decoration: none; }
.jm-reviews__more:hover { text-decoration: underline; }`,
  controls: [...typographyControls(), ...spacingControls(), ...appearanceControls(), ...positionControls()],
};
