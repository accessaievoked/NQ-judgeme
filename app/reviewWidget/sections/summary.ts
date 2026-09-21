import type { SectionModule } from "./types";
import { flexLayoutControls, spacingControls, typographyControls } from "./controls";

// The "4.5 (12 reviews)" bar at the top of the widget. Its two pieces
// (stars, count text) are separately selectable below (own controls each),
// but the bar itself also exposes shortcuts straight to them (star color,
// count style) so a merchant doesn't have to hunt for the right element —
// those write to the "summary-stars"/"summary-count" targets via `target`.
export const summarySection: SectionModule = {
  target: "summary",
  label: "Summary bar (stars + count)",
  icon: "▤",
  selector: ".jm-reviews__summary",
  html: `<div class="jm-reviews__summary">
  <span class="jm-reviews__stars">{{averageStars}}</span>
  <span class="jm-reviews__count">{{averageValue}} ({{count}} {{reviewWord}})</span>
</div>`,
  css: `.jm-reviews__summary { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }`,
  controls: [
    ...flexLayoutControls(),
    ...spacingControls(),
    { key: "starColor", label: "Star color", type: "color", property: "color", target: "summary-stars", group: "Appearance" },
    { key: "countColor", label: "Count text color", type: "color", property: "color", target: "summary-count", group: "Appearance" },
    { key: "countSize", label: "Count text size", type: "text", property: "font-size", target: "summary-count", group: "Appearance", placeholder: "e.g. 14px" },
  ],
};

export const summaryStarsSection: SectionModule = {
  target: "summary-stars",
  label: "Summary stars",
  icon: "★",
  selector: ".jm-reviews__stars",
  html: null,
  css: `.jm-reviews__stars { color: #f5a623; letter-spacing: 1px; }`,
  controls: [...typographyControls(), ...spacingControls()],
};

export const summaryCountSection: SectionModule = {
  target: "summary-count",
  label: "Summary count text",
  icon: "＃",
  selector: ".jm-reviews__count",
  html: null,
  css: `.jm-reviews__count { color: #666; font-size: 14px; }`,
  controls: [
    {
      key: "content",
      label: "Text",
      type: "content",
      property: "__content",
      group: "Content",
      helpText: "Keep the {{averageValue}}, {{count}} and {{reviewWord}} placeholders — they're replaced with the real numbers; everything else is up to you.",
    },
    ...typographyControls(),
    ...spacingControls(),
  ],
};
