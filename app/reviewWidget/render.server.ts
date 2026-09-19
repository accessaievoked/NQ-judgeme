// Re-exported from renderTemplate.ts (no .server suffix) so the same
// renderer can also run client-side in the visual widget editor for instant
// preview. This file exists so existing server-only imports keep working.
export { renderWidgetHtml } from "./renderTemplate";
export type { WidgetReview, WidgetData } from "./renderTemplate";
