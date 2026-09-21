// Plain data — no server-only logic — shared by the style-blocks compiler
// (reviewWidget/styleBlocks.server.ts) and the admin editor's dropdowns
// (routes/app.widget-style.jsx, which renders client-side too, hence this
// living outside any *.server.ts file).
//
// TARGETS/TARGET_ICONS are re-exports, not hardcoded here: each fixed piece
// of the widget (summary bar, reviews list, quick-rate box, ...) owns its
// own label/icon/selector in its own file under reviewWidget/sections/ (see
// that folder's index.ts), so adding a new one only means adding a section
// module, not touching this catalog too.
import { SECTION_TARGETS, SECTION_ICONS } from "./sections/index";

export const TARGETS = SECTION_TARGETS;
export const TARGET_ICONS = SECTION_ICONS;

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
  { value: "flex-direction", label: "Layout direction", hint: "row (horizontal) or column (vertical)" },
  { value: "align-items", label: "Cross-axis alignment", hint: "flex-start, center, flex-end" },
  { value: "justify-content", label: "Alignment", hint: "flex-start, center, flex-end" },
  { value: "display", label: "Display", hint: "flex, block, inline-block, none" },
  { value: "background-image", label: "Background image", hint: "e.g. url(https://...)" },
  { value: "background-size", label: "Background size", hint: "cover, contain" },
  { value: "background-position", label: "Background position", hint: "center, top, 50% 50%" },
  { value: "opacity", label: "Opacity", hint: "0 to 1, e.g. 0.5" },
  { value: "width", label: "Width", hint: "e.g. 100%, 240px" },
  { value: "height", label: "Height", hint: "e.g. auto, 120px" },
  { value: "grid-template-columns", label: "Grid columns", hint: "e.g. repeat(2, 1fr)" },
  { value: "line-height", label: "Line height", hint: "e.g. 1.5" },
] as const;

export type StyleBlock = { target: string; property: string; value: string };
