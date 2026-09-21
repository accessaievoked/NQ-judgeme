import type { SectionModule } from "./types";
import { starsBlock, titleBlock, bodyBlock, authorBlock } from "./blocks";
import { flexLayoutControls, sizeControls, spacingControls, appearanceControls } from "./controls";

// The repeating per-review card, wrapped in <!--ITEM--> markers by
// sections/index.ts's composer. It's a "container" block itself (like any
// block the "+ Add section" palette can create), just a fixed, un-removable
// one — its default children are built from the same block modules the
// palette offers, tagged with fixed ids ("item-stars" etc.) instead of
// generated ones, so a fresh review card looks identical to one you'd build
// by hand from the palette.
export const reviewCardSection: SectionModule = {
  target: "item",
  label: "Review card",
  icon: "▢",
  selector: ".jm-reviews__item",
  html: `<div class="jm-reviews__item" data-jm-block="item" data-jm-block-type="container">
  ${starsBlock.html("item-stars")}
  ${titleBlock.html("item-title")}
  ${bodyBlock.html("item-body")}
  ${authorBlock.html("item-author")}
</div>`,
  // position: relative so any block added inside — in normal flow or given
  // "Free position" (see controls.ts's positionControls) — is positioned
  // relative to the card itself, not the whole page — it stays contained
  // inside the card instead of escaping it. display: flex column + a gap
  // is the default stack layout (same idea as containerBlock's own
  // default below) so a fresh card's stars/title/body/author never touch —
  // each block's own small built-in margin used to be the only spacing.
  css: `.jm-reviews__item { position: relative; display: flex; flex-direction: column; gap: 8px; border: 1px solid #eee; border-radius: 8px; padding: 16px; }`,
  controls: [...flexLayoutControls(), ...sizeControls(), ...spacingControls(), ...appearanceControls()],
};

// The default children above are also individually selectable/stylable —
// same block types as the palette, just at fixed ids so they're always
// present. These entries exist purely for the "Widget" fixed-target list in
// app.widget-editor.jsx's sidebar; their controls come from the block
// modules directly (blockTypeFor("stars"), etc.), not duplicated here.
export const reviewCardChildTargets: SectionModule[] = [
  { target: "item-stars", label: "Review stars", icon: starsBlock.icon, selector: ".jm-reviews__item-stars", html: null, css: "", controls: starsBlock.controls },
  { target: "item-title", label: "Review title", icon: titleBlock.icon, selector: ".jm-reviews__item-title", html: null, css: "", controls: titleBlock.controls },
  { target: "item-body", label: "Review body text", icon: bodyBlock.icon, selector: ".jm-reviews__item-body", html: null, css: "", controls: bodyBlock.controls },
  { target: "item-author", label: "Review author name", icon: authorBlock.icon, selector: ".jm-reviews__item-author", html: null, css: "", controls: authorBlock.controls },
];
