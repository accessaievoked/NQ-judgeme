import type { SectionModule } from "./types";
import { typographyControls, spacingControls } from "./controls";

// Shown instead of the reviews list when a product has none yet — wrapped
// in <!--EMPTY--> markers by sections/index.ts's composer (see
// renderTemplate.ts for what those markers do).
export const emptyStateSection: SectionModule = {
  target: "empty",
  label: '"No reviews yet" text',
  icon: "∅",
  selector: ".jm-reviews__empty",
  html: `<p class="jm-reviews__empty">No reviews yet. Be the first to leave one!</p>`,
  css: `.jm-reviews__empty { color: #666; }`,
  controls: [
    { key: "content", label: "Text", type: "content", property: "__content", group: "Content" },
    ...typographyControls(),
    ...spacingControls(),
  ],
};
