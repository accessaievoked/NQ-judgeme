import type { BlockModule } from "../types";
import { typographyControls, sizeControls, spacingControls, appearanceControls, positionControls } from "../controls";

export const titleBlock: BlockModule = {
  type: "title",
  label: "Title",
  icon: "T",
  description: "The review's title.",
  html: (id) => `<div class="jm-reviews__item-title" data-jm-block="${id}" data-jm-block-type="title">{{title}}</div>`,
  css: `.jm-reviews__item-title { font-weight: 600; margin: 4px 0; }`,
  controls: [...typographyControls(), ...sizeControls(), ...spacingControls(), ...appearanceControls(), ...positionControls()],
};
