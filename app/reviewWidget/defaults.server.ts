// Seed markup/CSS for a shop that hasn't customized its review widget yet.
// Mirrors what extensions/theme-widget used to render as hardcoded HTML —
// kept identical on purpose so turning on customization doesn't change how
// any existing storefront looks. See render.server.ts for the token/marker
// syntax this `html` string uses.
export const DEFAULT_WIDGET_HTML = `<div class="jm-reviews__summary">
  <span class="jm-reviews__stars">{{averageStars}}</span>
  <span class="jm-reviews__count">{{averageValue}} ({{count}} {{reviewWord}})</span>
</div>
{{rateWidget}}
<!--EMPTY-->
<p class="jm-reviews__empty">No reviews yet. Be the first to leave one!</p>
<!--/EMPTY-->
<!--ITEM-->
<div class="jm-reviews__item">
  <div class="jm-reviews__item-stars">{{stars}}</div>
  <div class="jm-reviews__item-title">{{title}}</div>
  <div class="jm-reviews__item-body">{{body}}</div>
  <div class="jm-reviews__item-author">{{author}}</div>
</div>
<!--/ITEM-->`;

export const DEFAULT_WIDGET_CSS = `.jm-reviews { font-family: inherit; max-width: 640px; }
.jm-reviews__summary { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.jm-reviews__stars { color: #f5a623; letter-spacing: 1px; }
.jm-reviews__count { color: #666; font-size: 14px; }
.jm-reviews__item { border-top: 1px solid #eee; padding: 12px 0; }
.jm-reviews__item-stars { color: #f5a623; font-size: 14px; }
.jm-reviews__item-title { font-weight: 600; margin: 4px 0; }
.jm-reviews__item-body { margin: 4px 0; color: #333; }
.jm-reviews__item-author { color: #888; font-size: 12px; }
.jm-reviews__empty { color: #666; }
.jm-rate { margin: 12px 0 20px; }
.jm-rate__stars { display: flex; gap: 4px; }
.jm-rate__star { font-size: 24px; line-height: 1; background: none; border: 0; padding: 0; cursor: pointer; color: #ccc; }
.jm-rate__star.is-selected { color: #f5a623; }
.jm-rate__form { display: flex; flex-direction: column; gap: 8px; max-width: 320px; margin-top: 8px; }
.jm-rate__form input, .jm-rate__form textarea { padding: 8px; border: 1px solid #ccc; border-radius: 6px; font: inherit; }
.jm-rate__form button { align-self: flex-start; background: #1a1a1a; color: #fff; border: 0; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
.jm-rate__thanks { color: #2e7d32; font-weight: 600; }`;
