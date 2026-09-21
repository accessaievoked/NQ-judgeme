import type { BlockModule, SectionModule } from "../types";
import { spacingControls, positionControls } from "../controls";

// Built-in icon choices for "Icon" mode (below) — plain inline SVGs, so no
// upload/hosting is needed to use one. Each is a full data: URI ready to go
// straight into `background-image: url(...)`. "Custom icon URL" (its own
// control) covers anything not in this short list.
const ICON_PRESETS: Record<string, string> = {
  user: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='12' cy='7' r='4'/%3E%3C/svg%3E`,
  star: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23ffffff'%3E%3Cpolygon points='12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9'/%3E%3C/svg%3E`,
  heart: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23ffffff'%3E%3Cpath d='M12 21s-6.7-4.35-9.3-8.1C1 10.1 1.8 6.6 4.9 5.3 7 4.4 9.3 5 12 8c2.7-3 5-3.6 7.1-2.7 3.1 1.3 3.9 4.8 2.2 7.6C18.7 16.65 12 21 12 21z'/%3E%3C/svg%3E`,
  check: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E`,
  bag: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z'/%3E%3Cpath d='M3 6h18'/%3E%3Cpath d='M16 10a4 4 0 0 1-8 0'/%3E%3C/svg%3E`,
};

export const avatarBlock: BlockModule = {
  type: "avatar",
  label: "Avatar",
  icon: "◍",
  description: "Initials circle for the reviewer, or a chosen icon instead.",
  html: (id) => `<div class="jm-reviews__item-avatar" data-jm-block="${id}" data-jm-block-type="avatar">{{avatar}}</div>`,
  // box-sizing: border-box so the "Text padding" control (below) eats into
  // the fixed width/height instead of growing past them — keeps it a
  // perfect circle no matter how much padding is set.
  css: `.jm-reviews__item-avatar { display: inline-flex; margin: 4px 0; }
.jm-reviews__item-avatar-initials { box-sizing: border-box; width: 28px; height: 28px; border-radius: 999px; background: #e4e4e7; color: #52525b; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; background-repeat: no-repeat; background-position: center; background-size: 60%; }`,
  controls: [
    ...spacingControls(),
    {
      key: "avatarBg",
      label: "Circle background",
      type: "color",
      property: "background",
      target: "avatar-initials",
      group: "Avatar circle",
      helpText: "Also shows behind an icon, if one's chosen below.",
    },
    { key: "avatarColor", label: "Initials text color", type: "color", property: "color", target: "avatar-initials", group: "Avatar circle" },
    {
      key: "avatarSize",
      label: "Circle size",
      type: "size",
      property: "width",
      target: "avatar-initials",
      group: "Avatar circle",
      placeholder: "e.g. 28",
      onSet: (value, setVal) => setVal("height", value),
    },
    { key: "avatarFontSize", label: "Initials text size", type: "size", property: "font-size", target: "avatar-initials", group: "Avatar circle", placeholder: "e.g. 12" },
    {
      key: "avatarRadius",
      label: "Corner roundness",
      type: "size",
      property: "border-radius",
      target: "avatar-initials",
      group: "Avatar circle",
      placeholder: "e.g. 999 for a circle, 8 for rounded square",
    },
    { key: "avatarPadding", label: "Text padding", type: "size", property: "padding", target: "avatar-initials", group: "Avatar circle", placeholder: "e.g. 4" },
    {
      key: "avatarIconPreset",
      label: "Icon",
      type: "select",
      property: "background-image",
      target: "avatar-initials",
      group: "Icon (instead of initials)",
      options: [
        { value: "", label: "Off — show initials" },
        { value: "user", label: "👤 Person" },
        { value: "star", label: "★ Star" },
        { value: "heart", label: "♥ Heart" },
        { value: "check", label: "✓ Check" },
        { value: "bag", label: "🛍 Bag" },
        { value: "custom", label: "Custom icon URL…" },
      ],
      // The stored value is the actual background-image (a data: URI or
      // url(...)) — this select just offers friendly shortcuts to it. Picking
      // a preset writes its icon directly; picking "custom" leaves the image
      // property alone and reveals the URL field below to fill it in instead.
      onSet: (value, setVal) => {
        if (value === "custom" || value === "") return;
        setVal("background-image", `url("${ICON_PRESETS[value]}")`);
        setVal("color", "transparent");
      },
    },
    {
      key: "avatarIconUrl",
      label: "Custom icon URL",
      type: "image",
      property: "background-image",
      target: "avatar-initials",
      group: "Icon (instead of initials)",
      helpText: "A small square image or icon works best.",
      showIf: (getVal) => {
        const v = getVal("background-image");
        return v === "" || (Boolean(v) && !Object.values(ICON_PRESETS).some((icon) => v.includes(icon)));
      },
    },
    ...positionControls(),
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
