// Redis-backed cache for the two hot, read-heavy storefront endpoints
// (apps.reviews.jsx's inline widget JSON, apps.reviews.all.jsx's paginated
// page) so a busy product page doesn't hit Postgres on every pageview.
// Redis is already a hard dependency of this app (queue.server.ts's BullMQ
// queues need it), so no extra fallback/guarding is needed here.
//
// Invalidation is deliberately blunt: any create or status change for a
// product's reviews wipes *everything* cached for that product (the inline
// widget, every cached page number, every cached search query) rather than
// trying to patch just the affected entry. Reviews change rarely compared to
// how often they're read, so correctness-by-simplicity here is worth far
// more than the marginal cache-hit-rate loss from occasionally over-clearing.
import redis from "../redis.server";

const TTL_SECONDS = 5 * 60;
const NAMESPACE = "jm:reviews";

function widgetKey(shopId: string, productId: string): string {
  return `${NAMESPACE}:widget:${shopId}:${productId}`;
}

function summaryKey(shopId: string, productId: string): string {
  return `${NAMESPACE}:summary:${shopId}:${productId}`;
}

// Search query is part of the key (not just the page number) since a
// query changes which rows land on "page 2" entirely.
function allPageKey(shopId: string, productId: string, page: number, q: string): string {
  return `${NAMESPACE}:all:${shopId}:${productId}:${page}:${q}`;
}

// The pattern every allPageKey for a product matches, regardless of page/q —
// used only by invalidation below.
function allPagePattern(shopId: string, productId: string): string {
  return `${NAMESPACE}:all:${shopId}:${productId}:*`;
}

export type CachedWidget = { html: string; css: string };

export async function getCachedWidget(shopId: string, productId: string): Promise<CachedWidget | null> {
  const raw = await redis.get(widgetKey(shopId, productId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setCachedWidget(shopId: string, productId: string, data: CachedWidget): Promise<void> {
  await redis.set(widgetKey(shopId, productId), JSON.stringify(data), "EX", TTL_SECONDS);
}

export type CachedSummary = { html: string; css: string };

// Same shape/TTL as the inline widget cache above, keyed separately since a
// storefront can embed the summary badge on pages (collections, cart) that
// never fetch the full widget, and vice versa.
export async function getCachedSummary(shopId: string, productId: string): Promise<CachedSummary | null> {
  const raw = await redis.get(summaryKey(shopId, productId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setCachedSummary(shopId: string, productId: string, data: CachedSummary): Promise<void> {
  await redis.set(summaryKey(shopId, productId), JSON.stringify(data), "EX", TTL_SECONDS);
}

export async function getCachedAllPage(shopId: string, productId: string, page: number, q: string): Promise<string | null> {
  return redis.get(allPageKey(shopId, productId, page, q));
}

export async function setCachedAllPage(shopId: string, productId: string, page: number, q: string, html: string): Promise<void> {
  await redis.set(allPageKey(shopId, productId, page, q), html, "EX", TTL_SECONDS);
}

// Call this after ANY write that changes what a product's published reviews
// look like: a new review created (any of the three submission paths — the
// inline rate widget, the emailed /r/:token form, the public write-review
// page) or an admin publish/hide/etc. status change. `redis.keys()` does a
// full-namespace scan, which is fine at this app's scale but would need
// switching to SCAN before it saw production traffic at real volume.
export async function invalidateReviewCache(shopId: string, productId: string): Promise<void> {
  const pattern = allPagePattern(shopId, productId);
  const [pageKeys] = await Promise.all([
    redis.keys(pattern),
    redis.del(widgetKey(shopId, productId)),
    redis.del(summaryKey(shopId, productId)),
  ]);
  if (pageKeys.length) await redis.del(...pageKeys);
}

// Widget styling (WidgetTheme) is shop-wide, not per-product, so saving or
// resetting it in /app/widget-editor or /app/widget-style can't target one
// product's cache key the way a new review can — it has to sweep every
// cached entry for the shop instead. Called from both those routes' save
// and reset actions so a merchant never has to wait out the TTL to see
// their own change reflected on the storefront.
export async function invalidateShopReviewCache(shopId: string): Promise<void> {
  const keys = await redis.keys(`${NAMESPACE}:*:${shopId}:*`);
  if (keys.length) await redis.del(...keys);
}
