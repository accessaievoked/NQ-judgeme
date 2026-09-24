import type { SectionModule } from "./types";
import { sizeControls, spacingControls, appearanceControls } from "./controls";

// Wraps every rendered review card. renderTemplate.ts always adds this
// wrapper around the <!--ITEM--> repeats at render time — it's never part
// of the stored `html` — so this section contributes no static markup, only
// its default CSS/controls (its own stacked-vs-grid layout controller). The
// "Show all N reviews" link now lives in its own module (moreLink.ts) with
// its own selectable target.
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
        { value: "flex", label: "Flex" },
        { value: "grid", label: "Grid" },
      ],
      // Switching layout mode resets the other mode's own direction so
      // stale flex-direction/grid-auto-flow values from before don't leak
      // into the newly-chosen mode's rendering.
      onSet: (value, setVal) => {
        setVal("flex-direction", value === "flex" ? "column" : "");
        setVal("grid-auto-flow", "");
        if (value !== "grid") setVal("grid-template-columns", "");
      },
    },
    {
      key: "flexDirection",
      label: "Direction",
      type: "select",
      property: "flex-direction",
      group: "Reviews layout",
      options: [
        { value: "column", label: "Vertical (one review per row)" },
        { value: "row", label: "Horizontal (reviews side by side)" },
      ],
      showIf: (getVal) => getVal("display") === "flex",
    },
    {
      key: "gridDirection",
      label: "Direction",
      type: "select",
      property: "grid-auto-flow",
      group: "Reviews layout",
      options: [
        { value: "row", label: "Fill across, then down" },
        { value: "column", label: "Fill down, then across" },
      ],
      showIf: (getVal) => getVal("display") === "grid",
    },
    {
      key: "columns",
      label: "Columns per row",
      type: "number",
      property: "grid-template-columns",
      group: "Reviews layout",
      min: 1,
      max: 8,
      step: 1,
      showIf: (getVal) => getVal("display") === "grid",
      toValue: (raw) => `repeat(${Math.max(1, Number(raw) || 1)}, 1fr)`,
      fromValue: (stored) => stored.match(/repeat\((\d+)/)?.[1] || "3",
    },
    {
      key: "wrap",
      label: "Wrap onto new lines",
      type: "select",
      property: "flex-wrap",
      group: "Reviews layout",
      options: [
        { value: "wrap", label: "Yes" },
        { value: "nowrap", label: "No — scroll/overflow instead" },
      ],
      showIf: (getVal) => getVal("display") === "flex" && getVal("flex-direction") === "row",
    },
    { key: "gap", label: "Gap between cards", type: "size", property: "gap", group: "Reviews layout", placeholder: "e.g. 16" },
    ...sizeControls(),
    ...spacingControls(),
    ...appearanceControls(),
  ],
};
