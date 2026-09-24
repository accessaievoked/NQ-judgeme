import type { SectionModule } from "./types";
import { sizeControls, spacingControls, appearanceControls, typographyControls, positionControls } from "./controls";

// The public, no-token "write a review" page (routes/apps.reviews.write.jsx)
// and its matching theme block (extensions/theme-widget/blocks/write-review.liquid)
// — edited from its own dedicated builder (routes/app.review-form-editor.jsx),
// not app.widget-editor (that page's click-to-select iframe only knows the
// read-only list's <!--ITEM--> template, and its sidebar explicitly excludes
// these targets — see its WRITE_FORM_TARGET_VALUES). These controls still
// write the same {target, property, value} row shape as everything else in
// reviewWidget/, compiled by the same compileStyleBlocks() — just persisted
// on ReviewFormTheme.styleBlocks instead of WidgetTheme.styleBlocks, and
// rendered into the write-review page's own <style> tag.
export const writeFormSection: SectionModule = {
  target: "writeForm",
  label: "Write a review (form page)",
  icon: "✎",
  selector: ".jm-write-review",
  html: null,
  css: `.jm-write-review { font-family: inherit; max-width: 480px; margin: 0 auto; padding: 32px 20px; }
.jm-write-review__heading { font-size: 22px; font-weight: 700; margin: 0 0 4px; }
.jm-write-review__subheading { color: #666; margin: 0 0 24px; }
.jm-write-review__field { display: block; margin-bottom: 16px; }
.jm-write-review__label { display: block; font-weight: 600; margin-bottom: 4px; }
.jm-write-review__error { color: #c0392b; margin-bottom: 12px; }
.jm-write-review__done { text-align: center; padding: 40px 20px; }`,
  controls: [
    ...sizeControls(),
    ...spacingControls(),
    ...appearanceControls(),
    ...positionControls(),
    { key: "headingColor", label: "Heading color", type: "color", property: "color", target: "writeForm-heading", group: "Shortcuts" },
    { key: "starColor", label: "Star color (filled)", type: "color", property: "color", target: "writeForm-stars-filled", group: "Shortcuts" },
    { key: "submitBg", label: "Submit button color", type: "color", property: "background", target: "writeForm-submit", group: "Shortcuts" },
  ],
};

export const writeFormHeadingSection: SectionModule = {
  target: "writeForm-heading",
  label: "Write-a-review heading",
  icon: "H",
  selector: ".jm-write-review__heading",
  html: null,
  css: "",
  controls: [...typographyControls(), ...spacingControls()],
};

// The star picker's two "faces" — empty and filled — are separate targets
// with their own selectors (`.jm-write-review__star` vs the more specific
// `.jm-write-review__star.is-selected`), same "fill color" / "empty color"
// split the rating-summary badge uses (RatingSummaryTheme.starColor/
// emptyStarColor). Keeping them as two distinct {target, property} rows
// (rather than both writing "color" on the same target, which is what this
// used to do — the filled-star shortcut below and this section's own color
// control silently overwrote each other, and even when set, the shortcut's
// lower-specificity selector always lost to `.is-selected` in the cascade)
// means a merchant can set both, either, or neither, independently, and
// what's saved for one can never clobber the other.
export const writeFormStarsSection: SectionModule = {
  target: "writeForm-stars",
  label: "Write-a-review star picker (empty)",
  icon: "☆",
  selector: ".jm-write-review__star",
  html: null,
  css: `.jm-write-review__star { font-size: 32px; cursor: pointer; color: #ddd; background: none; border: 0; padding: 0; line-height: 1; }
.jm-write-review__star.is-selected { color: #f5a623; }`,
  controls: [
    { key: "size", label: "Star size", type: "size", property: "font-size", group: "Typography" },
    { key: "unselectedColor", label: "Empty star color", type: "color", property: "color", group: "Typography" },
  ],
};

export const writeFormStarsFilledSection: SectionModule = {
  target: "writeForm-stars-filled",
  label: "Write-a-review star picker (filled)",
  icon: "★",
  selector: ".jm-write-review__star.is-selected",
  html: null,
  css: "",
  controls: [{ key: "filledColor", label: "Filled star color", type: "color", property: "color", group: "Typography" }],
};

export const writeFormInputSection: SectionModule = {
  target: "writeForm-input",
  label: "Write-a-review text fields",
  icon: "▭",
  selector: ".jm-write-review__input, .jm-write-review__textarea",
  html: null,
  css: `.jm-write-review__input, .jm-write-review__textarea { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #ccc; border-radius: 6px; font: inherit; }`,
  controls: [...typographyControls(), ...spacingControls(), ...appearanceControls()],
};

export const writeFormSubmitSection: SectionModule = {
  target: "writeForm-submit",
  label: "Write-a-review submit button",
  icon: "▶",
  selector: ".jm-write-review__submit",
  html: null,
  css: `.jm-write-review__submit { background: #1a1a1a; color: #fff; border: 0; padding: 12px 24px; border-radius: 6px; font-weight: 600; cursor: pointer; }`,
  controls: [...typographyControls(), ...sizeControls(), ...spacingControls(), ...appearanceControls()],
};

// Deliberately NOT folded into DEFAULT_WIDGET_CSS/a shop's saved
// WidgetTheme.css — that field is the review-*list* widget's raw-HTML coder
// mode (a different template entirely) and, per reviewCache.server.ts's
// staleness lesson, a shop's saved css is a snapshot frozen at whatever
// defaults existed the last time they hit Save. If this page's base styling
// lived there, every shop that saved before this feature existed would see
// a completely unstyled form. apps.reviews.write.jsx instead always
// concatenates this fixed export first, then layers
// compileStyleBlocks(theme?.styleBlocks) on top for actual customizations —
// styleBlocks is read fresh from the DB's JSON column on every request, so
// it can never go stale the way a raw text blob can.
export const WRITE_FORM_DEFAULT_CSS = [
  writeFormSection.css,
  writeFormHeadingSection.css,
  writeFormStarsSection.css,
  writeFormStarsFilledSection.css,
  writeFormInputSection.css,
  writeFormSubmitSection.css,
]
  .filter(Boolean)
  .join("\n");
