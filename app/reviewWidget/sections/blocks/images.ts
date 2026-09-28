import type { BlockModule } from "../types";
import { spacingControls, positionControls } from "../controls";

// Same "wrapper-only addressable" limitation as avatar.ts/verified.ts: the
// {{images}} token (renderTemplate.ts) expands to its own
// .jm-reviews__item-images/.jm-reviews__item-image markup, styled by the
// fixed default CSS below rather than through this block's own controls.
// Renders to "" (renderTemplate.ts's imagesMarkup) for any review with no
// ReviewImage rows — ordinary reviews before this feature existed, or ones
// added without photos — so this block is safe to leave in the default
// template with no visual change until a review actually has photos.
export const imagesBlock: BlockModule = {
  type: "images",
  label: "Review photos",
  icon: "🖼",
  description: "The photos a shopper (or a CSV import — see /app/import) attached to their review, if any.",
  html: (id) => `<div class="jm-reviews__item-images-wrap" data-jm-block="${id}" data-jm-block-type="images">{{images}}</div>`,
  css: `.jm-reviews__item-images { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0; }
.jm-reviews__item-image { width: 56px; height: 56px; object-fit: cover; border-radius: 6px; }`,
  controls: [...spacingControls(), ...positionControls()],
};
