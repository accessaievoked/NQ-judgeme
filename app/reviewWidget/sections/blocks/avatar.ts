import type { BlockModule, SectionModule } from "../types";
import { spacingControls } from "../controls";

// Shows the reviewer's initials for now — a real uploaded profile picture
// may replace this later (e.g. via Cloudinary), but the circle/initials
// look is the only option today.
export const avatarBlock: BlockModule = {
  type: "avatar",
  label: "Avatar",
  icon: "◍",
  description: "Initials circle for the reviewer (profile pictures may come later).",
  html: (id) => `<div class="jm-reviews__item-avatar" data-jm-block="${id}" data-jm-block-type="avatar">{{avatar}}</div>`,
  // box-sizing: border-box so the "Text padding" control (below) eats into
  // the fixed width/height instead of growing past them — keeps it a
  // perfect circle no matter how much padding is set.
  css: `.jm-reviews__item-avatar { display: inline-flex; margin: 4px 0; }
.jm-reviews__item-avatar-initials { box-sizing: border-box; width: 28px; height: 28px; border-radius: 999px; background: #e4e4e7; color: #52525b; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; }`,
  controls: [
    ...spacingControls(),
    {
      key: "avatarBg",
      label: "Circle background",
      type: "color",
      property: "background",
      target: "avatar-initials",
      group: "Avatar circle",
      helpText: "Shows the reviewer's initials for now — profile pictures may be supported later.",
    },
    { key: "avatarColor", label: "Initials text color", type: "color", property: "color", target: "avatar-initials", group: "Avatar circle" },
    {
      key: "avatarSize",
      label: "Circle size",
      type: "text",
      property: "width",
      target: "avatar-initials",
      group: "Avatar circle",
      placeholder: "e.g. 28px",
      onSet: (value, setVal) => setVal("height", value),
    },
    { key: "avatarFontSize", label: "Initials text size", type: "text", property: "font-size", target: "avatar-initials", group: "Avatar circle", placeholder: "e.g. 12px" },
    {
      key: "avatarRadius",
      label: "Corner roundness",
      type: "text",
      property: "border-radius",
      target: "avatar-initials",
      group: "Avatar circle",
      placeholder: "e.g. 999px (circle), 8px (rounded square)",
    },
    { key: "avatarPadding", label: "Text padding", type: "text", property: "padding", target: "avatar-initials", group: "Avatar circle", placeholder: "e.g. 4px" },
  ],
};

// The initials circle isn't its own block (it's generated per-review inside
// {{avatar}}, same markup every time — see renderTemplate.ts's
// avatarMarkup()), so it can't carry a unique data-jm-block id the way a
// real block does. This registers its shared class as a style-block target
// anyway (see sections/index.ts) purely so avatarBlock's controls above can
// write to it via `target: "avatar-initials"` — every avatar circle across
// the widget shares one look, which is fine since a card only ever has one.
export const avatarInitialsTarget: SectionModule = {
  target: "avatar-initials",
  label: "Avatar circle",
  icon: "◍",
  selector: ".jm-reviews__item-avatar-initials",
  html: null,
  css: "",
  controls: [],
};
