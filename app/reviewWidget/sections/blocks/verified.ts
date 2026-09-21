import type { BlockModule } from "../types";
import { spacingControls, positionControls } from "../controls";

// Same limitation as avatar.ts: only the wrapper is addressable, so the
// badge's own color/weight stay in its default CSS above.
export const verifiedBlock: BlockModule = {
  type: "verified",
  label: "Verified badge",
  icon: "✓",
  description: "Shows only for verified buyers.",
  html: (id) => `<div class="jm-reviews__item-verified" data-jm-block="${id}" data-jm-block-type="verified">{{verified}}</div>`,
  css: `.jm-reviews__item-verified { margin: 4px 0; }
.jm-reviews__item-verified-badge { color: #2e7d32; font-size: 12px; font-weight: 600; }`,
  controls: [...spacingControls(), ...positionControls()],
};
