import type { BlockModule } from "../types";
import { sizeControls, spacingControls, appearanceControls } from "../controls";

export const starsBlock: BlockModule = {
  type: "stars",
  label: "Stars",
  icon: "★",
  description: "This review's star rating.",
  html: (id) => `<div class="jm-reviews__item-stars" data-jm-block="${id}" data-jm-block-type="stars">{{stars}}</div>`,
  css: `.jm-reviews__item-stars { color: #f5a623; font-size: 14px; }`,
  controls: [
    { key: "color", label: "Star color", type: "color", property: "color", group: "Typography" },
    { key: "fontSize", label: "Star size", type: "text", property: "font-size", group: "Typography", placeholder: "e.g. 14px" },
    { key: "letterSpacing", label: "Spacing between stars", type: "text", property: "letter-spacing", group: "Typography", placeholder: "e.g. 1px" },
    ...sizeControls(),
    ...spacingControls(),
    ...appearanceControls(),
  ],
};
