import { DEFAULT_RATING_SUMMARY_HTML, DEFAULT_RATING_SUMMARY_FIELDS, compileRatingSummaryTheme, renderRatingSummaryHtml } from "./app/reviewWidget/ratingSummaryTemplate";

const theme = compileRatingSummaryTheme(DEFAULT_RATING_SUMMARY_FIELDS);
console.log("compiled html:", theme.html);
console.log("compiled css:", theme.css);

const rendered = renderRatingSummaryHtml(theme.html, { count: 5, average: 4.6 }, DEFAULT_RATING_SUMMARY_FIELDS.countText);
console.log("rendered:", rendered);
