// Shared field-builders each section/block module composes its own
// `controls` array from (see types.ts's SectionControl). These aren't a
// fixed set every section must use as-is — a module can drop fields it
// doesn't need, add bespoke ones (see e.g. summary.ts's star-color control
// that targets a different element), or not use these helpers at all.
import type { SectionControl } from "./types";

export const flexLayoutControls = (): SectionControl[] => [
  {
    key: "direction",
    label: "Direction",
    type: "select",
    property: "flex-direction",
    group: "Layout",
    options: [
      { value: "row", label: "Horizontal" },
      { value: "column", label: "Vertical" },
    ],
    onSet: (_value, setVal) => setVal("display", "flex"),
  },
  {
    key: "align",
    label: "Alignment",
    type: "select",
    property: "align-items",
    group: "Layout",
    options: [
      { value: "flex-start", label: "Left" },
      { value: "center", label: "Center" },
      { value: "flex-end", label: "Right" },
    ],
    onSet: (value, setVal) => setVal("justify-content", value),
  },
  { key: "gap", label: "Gap", type: "text", property: "gap", group: "Layout", placeholder: "e.g. 8px" },
];

export const sizeControls = (): SectionControl[] => [
  { key: "width", label: "Width", type: "text", property: "width", group: "Size", placeholder: "e.g. 100%, 240px" },
  { key: "maxWidth", label: "Max width", type: "text", property: "max-width", group: "Size", placeholder: "e.g. 640px, 100%" },
];

export const spacingControls = (): SectionControl[] => [
  { key: "padding", label: "Padding", type: "text", property: "padding", group: "Spacing", placeholder: "e.g. 12px, 8px 16px" },
  { key: "margin", label: "Margin", type: "text", property: "margin", group: "Spacing", placeholder: "e.g. 0 0 16px" },
];

export const typographyControls = (): SectionControl[] => [
  { key: "textAlign", label: "Text align", type: "select", property: "text-align", group: "Typography", options: [
      { value: "left", label: "Left" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
    ] },
  { key: "fontSize", label: "Font size", type: "text", property: "font-size", group: "Typography", placeholder: "e.g. 14px" },
  { key: "fontWeight", label: "Font weight", type: "text", property: "font-weight", group: "Typography", placeholder: "e.g. 400, 600, bold" },
  { key: "color", label: "Text color", type: "color", property: "color", group: "Typography" },
];

export const appearanceControls = (): SectionControl[] => [
  { key: "background", label: "Background color", type: "color", property: "background", group: "Appearance" },
  {
    key: "backgroundImage",
    label: "Background image",
    type: "image",
    property: "background-image",
    group: "Appearance",
    helpText: "Paste an image URL for now — direct upload (e.g. via Cloudinary) is coming later.",
  },
  {
    key: "border",
    label: "Border",
    type: "select",
    property: "border",
    group: "Appearance",
    options: [
      { value: "", label: "None" },
      { value: "1px solid #e1e1e1", label: "Solid" },
    ],
  },
  { key: "borderRadius", label: "Corner radius", type: "text", property: "border-radius", group: "Appearance", placeholder: "e.g. 8px, 999px" },
  { key: "opacity", label: "Opacity", type: "text", property: "opacity", group: "Appearance", placeholder: "e.g. 1, 0.5" },
];
