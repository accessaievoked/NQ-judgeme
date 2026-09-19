// Re-exported from styleCompiler.ts (no .server suffix) so the same
// compiler can also run client-side in the visual widget editor for instant
// preview. This file exists so existing server-only imports keep working.
export { compileStyleBlocks } from "./styleCompiler";
export type { StyleBlock } from "./styleCatalog";
