import { authenticate } from "../shopify.server";
import db from "../db.server";

import {
  DEFAULT_RATING_SUMMARY_HTML,
  DEFAULT_RATING_SUMMARY_FIELDS,
  compileRatingSummaryTheme,
  renderRatingSummaryHtml,
} from "../reviewWidget/ratingSummaryTemplate";

import {
  getCachedReviewSummary,
  setCachedReviewSummary,
  getCachedReviewSummaryTheme,
  setCachedReviewSummaryTheme,
} from "../reviewWidget/reviewCache.server";

function buildThemeFromFields(fields) {
  const compiled = compileRatingSummaryTheme(fields);

  return {
    html: compiled.html || DEFAULT_RATING_SUMMARY_HTML,
    css: compiled.css || "",
    countText: fields.countText || DEFAULT_RATING_SUMMARY_FIELDS.countText,
  };
}

async function getSummaryTheme(shopId) {
  // 1. Try Redis first.
  const cached = await getCachedReviewSummaryTheme(shopId);

  if (cached) {
    return cached;
  }

  // 2. Cache miss — load from database.
  const theme = await db.ratingSummaryTheme.findUnique({
    where: { shopId },
  });

  let result;

  if (!theme) {
    result = buildThemeFromFields(DEFAULT_RATING_SUMMARY_FIELDS);
  } else {
    result = {
      html: theme.html || DEFAULT_RATING_SUMMARY_HTML,
      css: theme.css || "",
      countText:
        theme.countText || DEFAULT_RATING_SUMMARY_FIELDS.countText,
    };
  }

  // 3. Save vendor theme in Redis with NO TTL.
  await setCachedReviewSummaryTheme(shopId, result);

  return result;
}

async function getReviewSummary(shopId, productId) {
  // 1. Try review statistics cache first.
  const cached = await getCachedReviewSummary(shopId, productId);

  if (cached) {
    return cached;
  }

  // 2. Cache miss — calculate from database.
  const agg = await db.review.aggregate({
    where: {
      productId,
      status: "PUBLISHED",
    },
    _count: {
      _all: true,
    },
    _avg: {
      rating: true,
    },
  });

  const result = {
    count: agg._count._all,
    average: agg._avg.rating,
  };

  // 3. Save review statistics in Redis.
  //
  // No EX/TTL here.
  // This cache lives until a published review changes the product's
  // published review data and invalidateReviewCache() deletes it.
  await setCachedReviewSummary(shopId, productId, result);

  return result;
}

function buildPayload(theme, data) {
  return {
    html: renderRatingSummaryHtml(
      theme.html,
      data,
      theme.countText,
    ),
    css: theme.css,
  };
}

const EMPTY_DATA = {
  count: 0,
  average: null,
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);

  // No authenticated shop — return default empty badge.
  if (!session) {
    const theme = {
      html: DEFAULT_RATING_SUMMARY_HTML,
      css: "",
      countText: DEFAULT_RATING_SUMMARY_FIELDS.countText,
    };

    return Response.json(
      buildPayload(theme, EMPTY_DATA),
    );
  }

  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  if (!productId) {
    return Response.json(
      { error: "productId is required" },
      { status: 400 },
    );
  }

  const shop = await db.shop.findUnique({
    where: {
      domain: session.shop,
    },
  });

  if (!shop) {
    const theme = {
      html: DEFAULT_RATING_SUMMARY_HTML,
      css: "",
      countText: DEFAULT_RATING_SUMMARY_FIELDS.countText,
    };

    return Response.json(
      buildPayload(theme, EMPTY_DATA),
    );
  }

  const product = await db.product.findUnique({
    where: {
      shopId_shopifyId: {
        shopId: shop.id,
        shopifyId: `gid://shopify/Product/${productId}`,
      },
    },
  });

  if (!product) {
    const theme = await getSummaryTheme(shop.id);

    return Response.json(
      buildPayload(theme, EMPTY_DATA),
    );
  }

  // These are now two independent cache lookups.
  //
  // Cache A:
  // review-summary:{shopId}:{productId}
  //
  // Cache B:
  // review-summary-theme:{shopId}
  const [reviewSummary, theme] = await Promise.all([
    getReviewSummary(shop.id, product.id),
    getSummaryTheme(shop.id),
  ]);

  return Response.json(
    buildPayload(theme, reviewSummary),
  );
};