// Re-exports the default widget template/CSS composed from
// reviewWidget/sections/* (one file per section — see sections/index.ts's
// header comment for why). This file exists so existing server-only imports
// keep working, same as styleBlocks.server.ts's re-export of styleCompiler.
export { DEFAULT_WIDGET_HTML, DEFAULT_WIDGET_CSS } from "./sections/index";
