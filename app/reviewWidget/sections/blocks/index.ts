// Aggregates every block droppable inside a review card — one file per
// type in this folder, each owning its own markup factory, default CSS and
// which editor settings groups apply to it (see ../types.ts). This is the
// "review card" section's palette; reviewWidget/blockTypes.ts re-exports
// this in the shape the editor already imports.
import { starsBlock } from "./stars";
import { titleBlock } from "./title";
import { bodyBlock } from "./body";
import { authorBlock } from "./author";
import { avatarBlock, avatarInitialsTarget } from "./avatar";
import { verifiedBlock } from "./verified";
import { textBlock } from "./text";
import { containerBlock } from "./container";

export const BLOCK_MODULES = [starsBlock, titleBlock, bodyBlock, authorBlock, avatarBlock, verifiedBlock, textBlock, containerBlock];

export function blockModuleFor(type: string) {
  return BLOCK_MODULES.find((b) => b.type === type) || null;
}

export const BLOCKS_DEFAULT_CSS = BLOCK_MODULES.map((b) => b.css).join("\n");

export { starsBlock, titleBlock, bodyBlock, authorBlock, avatarBlock, avatarInitialsTarget, verifiedBlock, textBlock, containerBlock };
