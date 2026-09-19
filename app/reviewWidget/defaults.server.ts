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
<div class="jm-reviews__item" data-jm-block="item" data-jm-block-type="container">
  <div class="jm-reviews__item-stars" data-jm-block="item-stars" data-jm-block-type="stars">{{stars}}</div>
  <div class="jm-reviews__item-title" data-jm-block="item-title" data-jm-block-type="title">{{title}}</div>
  <div class="jm-reviews__item-body" data-jm-block="item-body" data-jm-block-type="body">{{body}}</div>
  <div class="jm-reviews__item-author" data-jm-block="item-author" data-jm-block-type="author">{{author}}</div>
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
.jm-reviews__item-avatar { display: inline-flex; margin: 4px 0; }
.jm-reviews__item-avatar-initials { width: 28px; height: 28px; border-radius: 999px; background: #e4e4e7; color: #52525b; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; }
.jm-reviews__item-verified { margin: 4px 0; }
.jm-reviews__item-verified-badge { color: #2e7d32; font-size: 12px; font-weight: 600; }
.jm-reviews__item-group { display: flex; align-items: center; gap: 8px; }
.jm-reviews__empty { color: #666; }
.jm-rate { margin: 12px 0 20px; }
.jm-rate__stars { display: flex; gap: 4px; }
.jm-rate__star { font-size: 24px; line-height: 1; background: none; border: 0; padding: 0; cursor: pointer; color: #ccc; }
.jm-rate__star.is-selected { color: #f5a623; }
.jm-rate__form { display: flex; flex-direction: column; gap: 8px; max-width: 320px; margin-top: 8px; }
.jm-rate__form input, .jm-rate__form textarea { padding: 8px; border: 1px solid #ccc; border-radius: 6px; font: inherit; }
.jm-rate__form button { align-self: flex-start; background: #1a1a1a; color: #fff; border: 0; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
.jm-rate__thanks { color: #2e7d32; font-weight: 600; }`;
