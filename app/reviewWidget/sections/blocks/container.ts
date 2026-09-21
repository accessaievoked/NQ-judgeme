import type { BlockModule } from "../types";
import { flexLayoutControls, sizeControls, spacingControls, appearanceControls, positionControls } from "../controls";

export const containerBlock: BlockModule = {
  type: "container",
  label: "Section",
  icon: "▢",
  description: "A group other blocks (or nested sections) can be dropped into.",
  container: true,
  html: (id) => `<div class="jm-reviews__item-group" data-jm-block="${id}" data-jm-block-type="container"></div>`,
  // position: relative so this section is a containing block for anything
  // positioned absolutely inside it, same reasoning as the review card
  // itself (see reviewCard.ts).
  css: `.jm-reviews__item-group { position: relative; display: flex; align-items: center; gap: 8px; }`,
  controls: [...flexLayoutControls(), ...sizeControls(), ...spacingControls(), ...appearanceControls(), ...positionControls()],
};
