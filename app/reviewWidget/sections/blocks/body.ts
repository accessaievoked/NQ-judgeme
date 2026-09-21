import type { BlockModule } from "../types";
import { typographyControls, sizeControls, spacingControls, appearanceControls } from "../controls";

export const bodyBlock: BlockModule = {
  type: "body",
  label: "Body text",
  icon: "¶",
  description: "The review's written text.",
  html: (id) => `<div class="jm-reviews__item-body" data-jm-block="${id}" data-jm-block-type="body">{{body}}</div>`,
  css: `.jm-reviews__item-body { margin: 4px 0; color: #333; }`,
  controls: [
    ...typographyControls(),
    { key: "lineHeight", label: "Line height", type: "text", property: "line-height", group: "Typography", placeholder: "e.g. 1.5" },
    ...sizeControls(),
    ...spacingControls(),
    ...appearanceControls(),
  ],
};
