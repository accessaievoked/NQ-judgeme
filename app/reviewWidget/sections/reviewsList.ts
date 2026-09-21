import type { SectionModule } from "./types";
import { sizeControls, spacingControls, appearanceControls } from "./controls";

// Wraps every rendered review card. renderTemplate.ts always adds this
// wrapper around the <!--ITEM--> repeats at render time — it's never part
// of the stored `html` — so this section contributes no static markup, only
// its default CSS/controls (its own stacked-vs-grid layout controller) and
// the "Show all N reviews" link's markup, which sections/index.ts wraps in
// <!--MORE--> markers right after it in the composed template.
export const reviewsListSection: SectionModule = {
  target: "list",
  label: "Reviews list (all cards)",
  icon: "▦",
  selector: ".jm-reviews__list",
  html: null,
  css: `.jm-reviews__list { display: flex; flex-direction: column; gap: 12px; }`,
  controls: [
    {
      key: "layout",
      label: "Layout",
      type: "select",
      property: "display",
      group: "Reviews layout",
      options: [
        { value: "flex", label: "Stacked (one per row)" },
        { value: "grid", label: "Grid" },
      ],
      onSet: (value, setVal) => setVal("flex-direction", value === "flex" ? "column" : ""),
    },
    {
      key: "columns",
      label: "Columns",
      type: "select",
      property: "grid-template-columns",
      group: "Reviews layout",
      options: [
        { value: "repeat(2, 1fr)", label: "2 per row" },
        { value: "repeat(3, 1fr)", label: "3 per row" },
        { value: "repeat(4, 1fr)", label: "4 per row" },
      ],
      showIf: (getVal) => getVal("display") === "grid",
    },
    { key: "gap", label: "Gap between cards", type: "text", property: "gap", group: "Reviews layout", placeholder: "e.g. 16px" },
    ...sizeControls(),
    ...spacingControls(),
    ...appearanceControls(),
  ],
};

export const moreLinkHtml = `<a class="jm-reviews__more" href="{{moreUrl}}">Show all {{count}} reviews →</a>`;
export const moreLinkCss = `.jm-reviews__more { display: inline-block; margin-top: 12px; color: #1a1a1a; font-weight: 600; text-decoration: none; }
.jm-reviews__more:hover { text-decoration: underline; }`;
