// Shared field-builders each section/block module composes its own
// `controls` array from (see types.ts's SectionControl). These aren't a
// fixed set every section must use as-is — a module can drop fields it
// doesn't need, add bespoke ones (see e.g. summary.ts's star-color control
// that targets a different element), or not use these helpers at all.
import type { SectionControl } from "./types";

// Shared by every "size" (one number + unit) and "box" (four numbers + unit,
// one per side) control — and by app.widget-editor.jsx's ControlField, which
// renders them — so a merchant never has to type a unit by hand: a plain
// number field sits next to a px/%/rem/em dropdown, and the two combine into
// the actual CSS value ("12px") behind the scenes.
export const SIZE_UNITS = ["px", "%", "rem", "em"];

export function parseSizeValue(raw: string | null | undefined): { num: string; unit: string } {
  const match = String(raw ?? "").trim().match(/^(-?\d*\.?\d+)\s*(px|%|rem|em)?$/);
  if (!match) return { num: "", unit: "px" };
  return { num: match[1], unit: match[2] || "px" };
}

export function formatSizeValue(num: string | number, unit: string): string {
  if (num === "" || num == null) return "";
  return `${num}${unit}`;
}

// A "box" control's stored value is still a single plain CSS shorthand
// string (e.g. padding: "4px 8px 4px 8px") — always written out as all four
// sides once edited here, never collapsed back to the 1/2/3-value shorthand
// forms, so each side's own field always round-trips to exactly what it
// showed. Handles reading a value that WAS saved in shorthand form already
// (hand-written raw CSS, or an older save) by expanding it the same way CSS
// itself would.
export function parseBoxValue(raw: string | null | undefined): [string, string, string, string] {
  const parts = String(raw ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ["", "", "", ""];
  if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
  if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
  if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
  return [parts[0], parts[1], parts[2], parts[3]];
}

export function formatBoxValue(sides: [string, string, string, string]): string {
  if (sides.every((s) => !s)) return "";
  return sides.map((s) => s || "0px").join(" ");
}

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
  { key: "gap", label: "Gap", type: "size", property: "gap", group: "Layout" },
];

export const sizeControls = (): SectionControl[] => [
  { key: "width", label: "Width", type: "size", property: "width", group: "Size", placeholder: "e.g. 100" },
  { key: "maxWidth", label: "Max width", type: "size", property: "max-width", group: "Size", placeholder: "e.g. 640" },
];

// Each side gets its own number+unit field — no shorthand syntax ("8px 16px")
// to remember, and mixed units per side (e.g. top in px, left in %) work
// fine since each is stored/read independently (see parseBoxValue/formatBoxValue).
export const spacingControls = (): SectionControl[] => [
  { key: "padding", label: "Padding", type: "box", property: "padding", group: "Spacing", helpText: "Inner spacing, one side at a time" },
  { key: "margin", label: "Margin", type: "box", property: "margin", group: "Spacing", helpText: "Outer spacing / move, one side at a time" },
];

export const typographyControls = (): SectionControl[] => [
  { key: "textAlign", label: "Text align", type: "select", property: "text-align", group: "Typography", options: [
      { value: "left", label: "Left" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
    ] },
  { key: "fontSize", label: "Font size", type: "size", property: "font-size", group: "Typography", placeholder: "e.g. 14" },
  { key: "fontWeight", label: "Font weight", type: "text", property: "font-weight", group: "Typography", placeholder: "e.g. 400, 600, bold" },
  { key: "color", label: "Text color", type: "color", property: "color", group: "Typography" },
];

// Two ways to place a block: left in the normal flow (its order in the
// sidebar tree/HTML decides where it lands — reorder with Move up/down,
// reparent with Move into, both already in the Position group above the
// tree) — or lifted into free positioning, typed in manually here or
// dragged directly in the preview (see EDITOR_SCRIPT's drag handling in
// app.widget-editor.jsx, active whenever the selected element's computed
// position is "absolute"). Both stay available at once — switching a block
// to "Free position" doesn't remove it from the tree or change what it's
// inside, it only changes how that one block is placed within its parent
// (which is why every container a block can land in — the review card and
// the "Section" block type — sets `position: relative` in its own default
// css, making it the positioning anchor).
export const positionControls = (): SectionControl[] => [
  {
    key: "positionMode",
    label: "Placement",
    type: "select",
    property: "position",
    group: "Placement",
    options: [
      { value: "", label: "In normal flow (default)" },
      { value: "absolute", label: "Free position (type or drag)" },
    ],
    onSet: (value, setVal) => {
      if (value !== "absolute") {
        setVal("top", "");
        setVal("right", "");
        setVal("bottom", "");
        setVal("left", "");
        setVal("z-index", "");
      }
    },
  },
  {
    key: "top",
    label: "Top",
    type: "size",
    property: "top",
    group: "Placement",
    placeholder: "e.g. 8",
    showIf: (getVal) => getVal("position") === "absolute",
  },
  {
    key: "left",
    label: "Left",
    type: "size",
    property: "left",
    group: "Placement",
    placeholder: "e.g. 8",
    showIf: (getVal) => getVal("position") === "absolute",
  },
  {
    key: "right",
    label: "Right",
    type: "size",
    property: "right",
    group: "Placement",
    placeholder: "e.g. 8",
    showIf: (getVal) => getVal("position") === "absolute",
  },
  {
    key: "bottom",
    label: "Bottom",
    type: "size",
    property: "bottom",
    group: "Placement",
    placeholder: "e.g. 8",
    showIf: (getVal) => getVal("position") === "absolute",
  },
  {
    key: "zIndex",
    label: "Stack order",
    type: "text",
    property: "z-index",
    group: "Placement",
    placeholder: "e.g. 1",
    showIf: (getVal) => getVal("position") === "absolute",
  },
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
  { key: "borderRadius", label: "Corner radius", type: "size", property: "border-radius", group: "Appearance", placeholder: "e.g. 8" },
  { key: "opacity", label: "Opacity", type: "text", property: "opacity", group: "Appearance", placeholder: "e.g. 1, 0.5" },
];
