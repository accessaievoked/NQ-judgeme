import type { SectionModule } from "./types";
import { sizeControls, spacingControls, appearanceControls } from "./controls";

// The outermost `.jm-reviews` wrapper — added by whoever calls
// renderWidgetHtml (the editor's iframe, apps.reviews.jsx), never part of
// the stored `html` itself, so this section contributes no markup of its
// own — just its base CSS and its own settings controls.
export const rootSection: SectionModule = {
  target: "root",
  label: "Whole widget",
  icon: "⬚",
  selector: ".jm-reviews",
  html: null,
  // position: relative so anything given "Free position" placement at the
  // top level of the widget (e.g. the Show more button — see moreLink.ts)
  // has a real positioned ancestor to be placed relative to, same reasoning
  // as styleCompiler.ts's STRUCTURAL_CSS for review cards.
  css: `.jm-reviews { font-family: inherit; max-width: 640px; position: relative; }`,
  controls: [
    {
      key: "align",
      label: "Item alignment",
      type: "select",
      property: "align-items",
      group: "Layout",
      options: [
        { value: "flex-start", label: "Left" },
        { value: "center", label: "Center" },
        { value: "flex-end", label: "Right" },
      ],
      onSet: (value, setVal) => {
        setVal("display", "flex");
        setVal("flex-direction", "column");
        // "Left"/"Center"/"Right" only means something relative to the
        // widget's own full available width — if something (a base
        // stylesheet, a raw-HTML customization) already centers or narrows
        // the widget itself (e.g. `max-width` + `margin: auto`), picking an
        // alignment would just reposition content inside that already-
        // centered box instead of the page's real edges. Claim the full
        // width first so alignment always means what it says; the Size/
        // Spacing groups below can re-narrow or re-center it afterward if
        // that's what's actually wanted.
        setVal("max-width", "100%");
        setVal("margin", "0");
      },
    },
    ...sizeControls(),
    ...spacingControls(),
    ...appearanceControls(),
  ],
};
