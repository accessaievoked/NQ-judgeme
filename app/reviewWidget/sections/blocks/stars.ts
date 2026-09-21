import type { BlockModule } from "../types";
import { sizeControls, spacingControls, appearanceControls, positionControls } from "../controls";

export const starsBlock: BlockModule = {
  type: "stars",
  label: "Stars",
  icon: "★",
  description: "This review's star rating.",
  html: (id) => `<div class="jm-reviews__item-stars" data-jm-block="${id}" data-jm-block-type="stars">{{stars}}</div>`,
  css: `.jm-reviews__item-stars { color: #f5a623; font-size: 14px; }`,
  controls: [
    { key: "color", label: "Star color", type: "color", property: "color", group: "Typography" },
    { key: "fontSize", label: "Star size", type: "size", property: "font-size", group: "Typography", placeholder: "e.g. 14" },
    { key: "letterSpacing", label: "Spacing between stars", type: "size", property: "letter-spacing", group: "Typography", placeholder: "e.g. 1" },
    ...sizeControls(),
    ...spacingControls(),
    ...appearanceControls(),
    ...positionControls(),
  ],
};
