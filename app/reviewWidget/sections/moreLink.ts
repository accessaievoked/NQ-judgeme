import type { SectionModule } from "./types";
import { typographyControls, spacingControls, appearanceControls, positionControls } from "./controls";

// The "Show all N reviews →" link that appears once a product has more
// published reviews than apps.reviews.jsx's INLINE_REVIEW_LIMIT — wrapped in
// <!--MORE--> markers right after the item loop by sections/index.ts's
// composed DEFAULT_WIDGET_HTML, same as every other fixed piece. Its own
// SectionModule (rather than folding its CSS into reviewsList.ts, where it
// used to live with no dedicated target at all) is what makes it click-
// selectable and fully customizable — position, color, size, spacing, its
// own wording, and shown/hidden — in app.widget-editor.jsx, the same as any
// other fixed target.
export const moreLinkHtml = `<a class="jm-reviews__more" href="{{moreUrl}}">Show all {{count}} reviews →</a>`;

// Self-heals a shop's saved `html` (WidgetTheme.html) that predates this
// section existing as its own <!--MORE--> block — a template saved (via
// Save or Reset) back when DEFAULT_WIDGET_HTML didn't yet compose this in is
// a frozen snapshot from that moment, same staleness reasoning as every
// other "shop's saved html is a snapshot" comment in this codebase, so it
// can be missing the block entirely even though nothing about it is
// deletable going forward. Called wherever a shop's raw `html` is read or
// written (renderTemplate.ts's renderWidgetHtml, and app.widget-editor.jsx/
// app.widget-style.jsx's loaders+actions) so the link can never silently
// stay gone — it reappears (as its default text, until re-customized) the
// next time the widget renders or the template is opened/saved, instead of
// only being fixable by a full "Reset to default".
export function ensureMoreBlock(html: string): string {
  if (/<!--MORE-->/.test(html)) return html;
  return `${html}\n<!--MORE-->${moreLinkHtml}<!--/MORE-->`;
}

export const moreLinkSection: SectionModule = {
  target: "more",
  label: "Show more link",
  icon: "→",
  selector: ".jm-reviews__more",
  html: null,
  css: `.jm-reviews__more { display: inline-block; margin-top: 12px; color: #1a1a1a; font-weight: 600; text-decoration: none; }
.jm-reviews__more:hover { text-decoration: underline; }`,
  controls: [
    // Free text, same "content" mechanism the empty-state/summary text and
    // the "Custom text" block use (see app.widget-editor.jsx's
    // getFixedContent/setFixedContent) — edits this link's actual wording
    // (default "Show all {{count}} reviews →") directly in baseHtml instead
    // of it only being changeable by hand-editing raw HTML on
    // /app/widget-style. {{count}} is just literal text to the DOM, so it
    // survives editing here exactly like other tokens inside editable text
    // do elsewhere in this file.
    { key: "content", label: "Link text", type: "content", property: "__content", group: "Content" },
    // Deliberately NOT a delete/remove control: this link is a fixed
    // section (like every other entry in sections/index.ts's SECTIONS), so
    // the visual editor never offers a way to remove it — only hide it, via
    // plain `display: none`, same style-block mechanism as every other
    // appearance control. The <!--MORE--> markers themselves (and the link
    // markup between them) still always render into the template; whether
    // the link is visible on the storefront is purely this CSS toggle plus
    // renderTemplate.ts's own "are there more reviews than shown" check.
    {
      key: "visibility",
      label: "Visibility",
      type: "select",
      property: "display",
      group: "Content",
      options: [
        { value: "", label: "Shown" },
        { value: "none", label: "Hidden" },
      ],
    },
    ...typographyControls(),
    ...spacingControls(),
    ...appearanceControls(),
    ...positionControls(),
  ],
};
