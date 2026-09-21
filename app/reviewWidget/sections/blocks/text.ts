import type { BlockModule } from "../types";
import { typographyControls, sizeControls, spacingControls, appearanceControls } from "../controls";

// Free-form static text, unlike every other block here — those all resolve
// from a review's {{token}} (stars/title/body/author/...), so their content
// isn't meant to be hand-edited. This one's whole point is a merchant typing
// their own words (a label, a callout, marketing copy) into the review
// card, hence the "content" control (app.widget-editor.jsx edits the
// block's actual text in itemHtml for this control type, instead of
// writing a style-block row like every other control does).
export const textBlock: BlockModule = {
  type: "text",
  label: "Custom text",
  icon: "Abc",
  description: "Your own editable text — not tied to review data.",
  html: (id) => `<div class="jm-reviews__item-text" data-jm-block="${id}" data-jm-block-type="text">Custom text</div>`,
  css: `.jm-reviews__item-text {}`,
  controls: [
    { key: "content", label: "Text", type: "content", property: "__content", group: "Content" },
    ...typographyControls(),
    ...sizeControls(),
    ...spacingControls(),
    ...appearanceControls(),
  ],
};
