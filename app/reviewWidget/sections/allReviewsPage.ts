import type { SectionModule } from "./types";
import { sizeControls, spacingControls, appearanceControls, typographyControls, flexLayoutControls } from "./controls";

// The public, paginated/searchable "all reviews" page
// (routes/apps.reviews.all.jsx) and its matching theme block
// (extensions/theme-widget/blocks/all-reviews.liquid) — edited from its own
// dedicated builder (routes/app.review-all-editor.jsx), exact same split as
// reviewWidget/sections/writeForm.ts is for the write-a-review page: this
// page's own chrome (heading, review count, search box, per-row wrapper/
// avatar/date, pagination) is its own flat, non-repeating set of targets,
// persisted on AllReviewsTheme instead of WidgetTheme. The review item's
// actual content pieces (stars/title/body/author) are deliberately NOT
// re-styled here — they keep the exact jm-reviews__item-* class names the
// inline widget's review card uses (see reviewWidget/sections/reviewCard.ts),
// so they're already styled by whatever's saved on WidgetTheme and stay in
// sync with the widget automatically, same as apps.reviews.all.jsx has
// always done.
export const allReviewsPageSection: SectionModule = {
  target: "allReviewsPage",
  label: "All reviews page",
  icon: "▤",
  selector: ".jm-reviews-page",
  html: null,
  css: `.jm-reviews-page { max-width: 720px; margin: 0 auto; }`,
  controls: [...sizeControls(), ...spacingControls(), ...appearanceControls()],
};

export const allReviewsHeadingSection: SectionModule = {
  target: "allReviewsPage-heading",
  label: "Heading",
  icon: "H",
  selector: ".jm-reviews-page__heading",
  html: null,
  css: `.jm-reviews-page__heading { font-size: 22px; font-weight: 700; margin: 0 0 4px; }`,
  controls: [...typographyControls(), ...spacingControls()],
};

export const allReviewsCountSection: SectionModule = {
  target: "allReviewsPage-count",
  label: "Review count text",
  icon: "#",
  selector: ".jm-reviews-page__count",
  html: null,
  css: `.jm-reviews-page__count { color: #666; margin: 0 0 20px; }`,
  controls: [...typographyControls(), ...spacingControls()],
};

export const allReviewsSearchSection: SectionModule = {
  target: "allReviewsPage-search",
  label: "Search box",
  icon: "⌕",
  selector: ".jm-reviews-page__search",
  html: null,
  css: `.jm-reviews-page__search { display: flex; gap: 8px; margin-bottom: 24px; }`,
  controls: [...flexLayoutControls(), ...spacingControls(), ...appearanceControls()],
};

export const allReviewsSearchInputSection: SectionModule = {
  target: "allReviewsPage-search-input",
  label: "Search field",
  icon: "▭",
  selector: ".jm-reviews-page__search-input",
  html: null,
  css: `.jm-reviews-page__search-input { flex: 1; padding: 10px 12px; border: 1px solid #ccc; border-radius: 6px; font: inherit; }`,
  controls: [...typographyControls(), ...sizeControls(), ...spacingControls(), ...appearanceControls()],
};

export const allReviewsSearchButtonSection: SectionModule = {
  target: "allReviewsPage-search-button",
  label: "Search button",
  icon: "▶",
  selector: ".jm-reviews-page__search-button",
  html: null,
  css: `.jm-reviews-page__search-button { padding: 10px 16px; border-radius: 6px; border: 0; background: #1a1a1a; color: #fff; font: inherit; cursor: pointer; }`,
  controls: [
    // Same "content" mechanism as moreLink.ts's link text and the
    // write-form/widget's other free-text fixed sections — this button's
    // label ("Search") is static wording, not data-driven, so it's
    // customizable the same way.
    { key: "content", label: "Button text", type: "content", property: "__content", group: "Content" },
    ...typographyControls(),
    ...sizeControls(),
    ...spacingControls(),
    ...appearanceControls(),
  ],
};

export const allReviewsItemSection: SectionModule = {
  target: "allReviewsPage-item",
  label: "Review row",
  icon: "▢",
  selector: ".jm-reviews-page__item",
  html: null,
  css: `.jm-reviews-page__item { border-top: 1px solid #eee; padding: 16px 0; }`,
  controls: [...sizeControls(), ...spacingControls(), ...appearanceControls()],
};

export const allReviewsItemHeadSection: SectionModule = {
  target: "allReviewsPage-item-head",
  label: "Review row header (avatar + name)",
  icon: "◫",
  selector: ".jm-reviews-page__item-head",
  html: null,
  css: `.jm-reviews-page__item-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }`,
  controls: [...flexLayoutControls(), ...spacingControls()],
};

export const allReviewsAvatarSection: SectionModule = {
  target: "allReviewsPage-avatar",
  label: "Avatar initials",
  icon: "◉",
  selector: ".jm-reviews-page__avatar",
  html: null,
  css: `.jm-reviews-page__avatar { width: 32px; height: 32px; font-size: 13px; }`,
  controls: [...sizeControls(), ...typographyControls(), ...appearanceControls()],
};

export const allReviewsDateSection: SectionModule = {
  target: "allReviewsPage-date",
  label: "Review date",
  icon: "◷",
  selector: ".jm-reviews-page__date",
  html: null,
  css: `.jm-reviews-page__date { color: #999; font-size: 12px; }`,
  controls: [...typographyControls()],
};

export const allReviewsEmptySection: SectionModule = {
  target: "allReviewsPage-empty",
  label: "No reviews found text",
  icon: "○",
  selector: ".jm-reviews-page__empty",
  html: null,
  css: `.jm-reviews-page__empty { color: #666; padding: 24px 0; }`,
  controls: [
    { key: "content", label: "Text", type: "content", property: "__content", group: "Content" },
    ...typographyControls(),
    ...spacingControls(),
  ],
};

// Covers the nav wrapper plus its numbered links/current-page span/ellipsis
// (.jm-reviews-page__num, __nav, __ellipsis, .is-current) — one target for
// all of it, same "style the whole thing together" granularity the write
// form's star picker container uses, since pagination's exact per-link
// markup is generated fresh from the current request's page/URL (see
// apps.reviews.all.jsx's paginationHtml), not stored template text.
export const allReviewsPaginationSection: SectionModule = {
  target: "allReviewsPage-pagination",
  label: "Pagination",
  icon: "‹›",
  selector: ".jm-reviews-page__pagination",
  html: null,
  css: `.jm-reviews-page__pagination { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 24px; }
.jm-reviews-page__num, .jm-reviews-page__nav { display: inline-flex; align-items: center; justify-content: center; min-width: 32px; height: 32px; padding: 0 8px; border-radius: 6px; text-decoration: none; color: #1a1a1a; }
.jm-reviews-page__num:hover, .jm-reviews-page__nav:hover { background: #f4f4f4; }
.jm-reviews-page__num.is-current { background: #1a1a1a; color: #fff; }
.jm-reviews-page__ellipsis { padding: 0 4px; color: #999; }`,
  controls: [...flexLayoutControls(), ...typographyControls(), ...spacingControls()],
};

export const ALL_REVIEWS_SECTIONS: SectionModule[] = [
  allReviewsPageSection,
  allReviewsHeadingSection,
  allReviewsCountSection,
  allReviewsSearchSection,
  allReviewsSearchInputSection,
  allReviewsSearchButtonSection,
  allReviewsItemSection,
  allReviewsItemHeadSection,
  allReviewsAvatarSection,
  allReviewsDateSection,
  allReviewsEmptySection,
  allReviewsPaginationSection,
];

// Deliberately NOT folded into a shop's saved AllReviewsTheme.css — same
// staleness reasoning as WRITE_FORM_DEFAULT_CSS (sections/writeForm.ts):
// apps.reviews.all.jsx always concatenates this fixed export first, then
// layers compileAllReviewsStyleBlocks(theme?.styleBlocks) on top, so a shop
// that saved before some future chrome piece existed still sees it styled
// instead of unstyled.
export const ALL_REVIEWS_DEFAULT_CSS = ALL_REVIEWS_SECTIONS.map((s) => s.css)
  .filter(Boolean)
  .join("\n");
