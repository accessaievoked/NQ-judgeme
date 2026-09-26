import redis from "../redis.server";

const TTL_SECONDS = 5 * 60;
const NAMESPACE = "jm:reviews";

// Existing cache keys — keep these unchanged.
function widgetKey(shopId: string, productId: string): string {
  return `${NAMESPACE}:widget:${shopId}:${productId}`;
}

function summaryKey(shopId: string, productId: string): string {
  return `${NAMESPACE}:summary:${shopId}:${productId}`;
}

function allPageKey(
  shopId: string,
  productId: string,
  page: number,
  q: string,
): string {
  return `${NAMESPACE}:all:${shopId}:${productId}:${page}:${q}`;
}

function allPagePattern(shopId: string, productId: string): string {
  return `${NAMESPACE}:all:${shopId}:${productId}:*`;
}

// -----------------------------------------------------------------------------
// NEW: Rating-summary data cache
// One cache per shop + product.
// Stores only review count + average rating.
// -----------------------------------------------------------------------------

const REVIEW_SUMMARY_NAMESPACE = "review-summary";
const REVIEW_SUMMARY_THEME_NAMESPACE = "review-summary-theme";

function reviewSummaryKey(shopId: string, productId: string): string {
  return `${REVIEW_SUMMARY_NAMESPACE}:${shopId}:${productId}`;
}

function reviewSummaryThemeKey(shopId: string): string {
  return `${REVIEW_SUMMARY_THEME_NAMESPACE}:${shopId}`;
}

export type CachedReviewSummary = {
  count: number;
  average: number | null;
};

export async function getCachedReviewSummary(
  shopId: string,
  productId: string,
): Promise<CachedReviewSummary | null> {
  const raw = await redis.get(reviewSummaryKey(shopId, productId));

  if (!raw) return null;

  try {
    return JSON.parse(raw) as CachedReviewSummary;
  } catch {
    return null;
  }
}

export async function setCachedReviewSummary(
  shopId: string,
  productId: string,
  data: CachedReviewSummary,
): Promise<void> {
  await redis.set(
    reviewSummaryKey(shopId, productId),
    JSON.stringify(data),
  );
}

// -----------------------------------------------------------------------------
// NEW: Rating-summary theme cache
// One cache per shop/vendor.
// No TTL.
// It remains until the merchant saves or resets the rating-summary theme.
// -----------------------------------------------------------------------------

export type CachedReviewSummaryTheme = {
  html: string;
  css: string;
  countText: string | null;
};

export async function getCachedReviewSummaryTheme(
  shopId: string,
): Promise<CachedReviewSummaryTheme | null> {
  const raw = await redis.get(reviewSummaryThemeKey(shopId));

  if (!raw) return null;

  try {
    return JSON.parse(raw) as CachedReviewSummaryTheme;
  } catch {
    return null;
  }
}

export async function setCachedReviewSummaryTheme(
  shopId: string,
  data: CachedReviewSummaryTheme,
): Promise<void> {
  // Intentionally NO TTL.
  await redis.set(
    reviewSummaryThemeKey(shopId),
    JSON.stringify(data),
  );
}

export async function invalidateReviewSummary(
  shopId: string,
  productId: string,
): Promise<void> {
  await redis.del(reviewSummaryKey(shopId, productId));
}

export async function invalidateReviewSummaryTheme(
  shopId: string,
): Promise<void> {
  await redis.del(reviewSummaryThemeKey(shopId));
}

// -----------------------------------------------------------------------------
// Existing widget cache
// -----------------------------------------------------------------------------

export type CachedWidget = {
  html: string;
  css: string;
};

export async function getCachedWidget(
  shopId: string,
  productId: string,
): Promise<CachedWidget | null> {
  const raw = await redis.get(widgetKey(shopId, productId));

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setCachedWidget(
  shopId: string,
  productId: string,
  data: CachedWidget,
): Promise<void> {
  await redis.set(
    widgetKey(shopId, productId),
    JSON.stringify(data),
    "EX",
    TTL_SECONDS,
  );
}

// -----------------------------------------------------------------------------
// Existing summary cache
// Kept unchanged so existing review widget behavior is not broken.
// -----------------------------------------------------------------------------

export type CachedSummary = {
  html: string;
  css: string;
};

export async function getCachedSummary(
  shopId: string,
  productId: string,
): Promise<CachedSummary | null> {
  const raw = await redis.get(summaryKey(shopId, productId));

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setCachedSummary(
  shopId: string,
  productId: string,
  data: CachedSummary,
): Promise<void> {
  await redis.set(
    summaryKey(shopId, productId),
    JSON.stringify(data),
    "EX",
    TTL_SECONDS,
  );
}

// -----------------------------------------------------------------------------
// Existing all-pages cache
// -----------------------------------------------------------------------------

export async function getCachedAllPage(
  shopId: string,
  productId: string,
  page: number,
  q: string,
): Promise<string | null> {
  return redis.get(allPageKey(shopId, productId, page, q));
}

export async function setCachedAllPage(
  shopId: string,
  productId: string,
  page: number,
  q: string,
  html: string,
): Promise<void> {
  await redis.set(
    allPageKey(shopId, productId, page, q),
    html,
    "EX",
    TTL_SECONDS,
  );
}

// -----------------------------------------------------------------------------
// Existing product review invalidation
//
// IMPORTANT:
// This still clears the existing widget + all-page caches.
// It ALSO clears the new review-summary data cache.
// It does NOT touch the vendor's rating-summary HTML/CSS theme cache.
// -----------------------------------------------------------------------------

export async function invalidateReviewCache(
  shopId: string,
  productId: string,
): Promise<void> {
  const pattern = allPagePattern(shopId, productId);

  const [pageKeys] = await Promise.all([
    redis.keys(pattern),

    // Existing caches.
    redis.del(widgetKey(shopId, productId)),
    redis.del(summaryKey(shopId, productId)),

    // NEW rating-summary data cache.
    redis.del(reviewSummaryKey(shopId, productId)),
  ]);

  if (pageKeys.length) {
    await redis.del(...pageKeys);
  }
}

// -----------------------------------------------------------------------------
// Existing full-shop invalidation.
// Kept because other review/widget functionality may still use it.
// -----------------------------------------------------------------------------

export async function invalidateShopReviewCache(
  shopId: string,
): Promise<void> {
  const keys = await redis.keys(`${NAMESPACE}:*:${shopId}:*`);

  if (keys.length) {
    await redis.del(...keys);
  }
}