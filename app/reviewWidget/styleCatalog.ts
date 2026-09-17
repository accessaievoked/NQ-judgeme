// Plain data — no server-only logic — shared by the style-blocks compiler
// (reviewWidget/styleBlocks.server.ts) and the admin editor's dropdowns
// (routes/app.widget-style.jsx, which renders client-side too, hence this
// living outside any *.server.ts file).
export const TARGETS = [
  { value: "root", label: "Whole widget", selector: ".jm-reviews" },
  { value: "summary", label: "Summary bar (stars + count)", selector: ".jm-reviews__summary" },
  { value: "summary-stars", label: "Summary stars", selector: ".jm-reviews__stars" },
  { value: "summary-count", label: "Summary count text", selector: ".jm-reviews__count" },
  { value: "item", label: "Each review (box)", selector: ".jm-reviews__item" },
  { value: "item-stars", label: "Review stars", selector: ".jm-reviews__item-stars" },
  { value: "item-title", label: "Review title", selector: ".jm-reviews__item-title" },
  { value: "item-body", label: "Review body text", selector: ".jm-reviews__item-body" },
  { value: "item-author", label: "Review author name", selector: ".jm-reviews__item-author" },
  { value: "empty", label: "\"No reviews yet\" text", selector: ".jm-reviews__empty" },
  { value: "rate", label: "Quick-rate box", selector: ".jm-rate" },
  { value: "rate-star", label: "Quick-rate stars", selector: ".jm-rate__star" },
  { value: "rate-form", label: "Quick-rate form", selector: ".jm-rate__form" },
] as const;

export const PROPERTIES = [
  { value: "color", label: "Text color", hint: "e.g. #f5a623, rgb(20,20,20), red" },
  { value: "background", label: "Background", hint: "e.g. #fff, #f4f4f4, transparent" },
  { value: "font-size", label: "Text size", hint: "e.g. 14px, 1.2em" },
  { value: "font-weight", label: "Text weight", hint: "e.g. 400, 600, bold" },
  { value: "text-align", label: "Text alignment", hint: "left, center, right" },
  { value: "padding", label: "Inner spacing (padding)", hint: "e.g. 12px, 8px 16px" },
  { value: "margin", label: "Outer spacing / move (margin)", hint: "e.g. 0 0 16px, -8px 0 0 (negative = move up/left)" },
  { value: "gap", label: "Space between children", hint: "e.g. 8px" },
  { value: "border-radius", label: "Corner rounding (shape)", hint: "e.g. 4px, 999px for a pill" },
  { value: "border", label: "Border (shape)", hint: "e.g. 1px solid #eee" },
  { value: "box-shadow", label: "Shadow (shape)", hint: "e.g. 0 1px 4px rgba(0,0,0,.1)" },
  { value: "max-width", label: "Max width", hint: "e.g. 640px, 100%" },
  { value: "letter-spacing", label: "Letter spacing", hint: "e.g. 1px" },
] as const;

export type StyleBlock = { target: string; property: string; value: string };
