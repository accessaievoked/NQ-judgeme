// Re-exports the review-card block palette from reviewWidget/sections/blocks
// (one file per block type — see sections/index.ts's header comment) in the
// shape the widget editor (app.widget-editor.jsx) already imports:
// BLOCK_TYPES (an array) and blockTypeFor(type). This file exists so that
// existing import keeps working unchanged.
import { BLOCK_MODULES, blockModuleFor } from "./sections/blocks";

export type BlockType = {
  type: string;
  label: string;
  icon: string;
  description: string;
  container?: boolean;
  html: (id: string) => string;
};

export const BLOCK_TYPES: BlockType[] = BLOCK_MODULES;

export function blockTypeFor(type: string) {
  return blockModuleFor(type);
}
