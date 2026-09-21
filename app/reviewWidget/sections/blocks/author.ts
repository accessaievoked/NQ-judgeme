import type { BlockModule } from "../types";
import { typographyControls, sizeControls, spacingControls, appearanceControls, positionControls } from "../controls";

export const authorBlock: BlockModule = {
  type: "author",
  label: "Author",
  icon: "@",
  description: "Reviewer's name.",
  html: (id) => `<div class="jm-reviews__item-author" data-jm-block="${id}" data-jm-block-type="author">{{author}}</div>`,
  css: `.jm-reviews__item-author { color: #888; font-size: 12px; }`,
  controls: [...typographyControls(), ...sizeControls(), ...spacingControls(), ...appearanceControls(), ...positionControls()],
};
