// Creates a one-time thank-you discount code after a review is submitted.
// Whether this runs at all, and at what percentage/expiry, is a per-shop
// vendor setting (ShopSettings.reviewDiscount*) — not a hardcoded constant —
// so each shop opts in (or not) and picks its own numbers from
// /app/settings. See reviewRequests/sendThankYou.server.ts for where this
// gets called from the review-submission flow.
import db from "../db.server";
import { shopifyGraphql } from "../shopify/client";

const DISCOUNT_CODE_BASIC_CREATE = `#graphql
  mutation ReviewDiscountCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
      }
      userErrors {
        field
        code
        message
      }
    }
  }
`;

const CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids misreads

function randomSuffix(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)];
  return s;
}

function isUniqueConstraintError(err: unknown, field: string): boolean {
  const anyErr = err as { code?: string; meta?: { target?: unknown } } | null;
  if (!anyErr || anyErr.code !== "P2002") return false;
  const target = anyErr.meta?.target;
  return Array.isArray(target) ? target.includes(field) : typeof target === "string" && target.includes(field);
}

/**
 * Inserts the ReviewDiscount row before calling Shopify, retrying on a code
 * collision (rare, but the charset is only 33^6 wide) and bailing out if
 * another concurrent call already claimed this exact review (idempotency).
 */
async function reserveRow(
  shopId: string,
  reviewId: string,
  customerEmail: string,
  percentageOff: number,
  expiresAt: Date,
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.reviewDiscount.create({
        data: {
          shopId,
          reviewId,
          customerEmail,
          code: `REVIEW-${randomSuffix()}`,
          percentageOff,
          status: "PENDING",
          expiresAt,
        },
      });
    } catch (err) {
      if (isUniqueConstraintError(err, "reviewId")) return null; // another call owns this review
      if (!isUniqueConstraintError(err, "code") || attempt === 4) throw err;
      // else: code collision — loop and try a fresh random suffix
    }
  }
  return null;
}

export type ReviewDiscountResult = { code: string; percentageOff: number; expiresAt: Date };

/**
 * Idempotent: a review that already has a CREATED discount just returns it.
 * Never throws — a Shopify-side failure is caught, logged, and persisted as
 * a FAILED row (queryable for manual retry/follow-up) rather than bubbling
 * up and blocking the review-submission response or the thank-you email.
 * Returns null when there's nothing to create (feature off for this shop,
 * no customer email on the review, or the Shopify call failed).
 */
export async function createReviewDiscountForReview(reviewId: string): Promise<ReviewDiscountResult | null> {
  const existing = await db.reviewDiscount.findUnique({ where: { reviewId } });
  if (existing?.status === "CREATED") {
    return { code: existing.code, percentageOff: existing.percentageOff, expiresAt: existing.expiresAt };
  }
  if (existing?.status === "PENDING") return null; // another call is already handling this review

  const review = await db.review.findUnique({
    where: { id: reviewId },
    include: {
      shop: { include: { settings: true } },
      customer: true,
      reviewRequest: { include: { customer: true } },
    },
  });
  if (!review) return null;

  const settings = review.shop.settings;
  if (!settings?.reviewDiscountEnabled) return null;

  const email = review.customer?.email ?? review.reviewRequest?.customer?.email ?? null;
  if (!email) return null; // e.g. an anonymous storefront-widget review with no address to send to

  const percentageOff = settings.reviewDiscountPercentage;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + settings.reviewDiscountExpiryDays);

  const row = existing ?? (await reserveRow(review.shopId, reviewId, email, percentageOff, expiresAt));
  if (!row) return null;

  try {
    const data = await shopifyGraphql<{
      discountCodeBasicCreate: {
        codeDiscountNode: { id: string } | null;
        userErrors: Array<{ field: string[] | null; code: string; message: string }>;
      };
    }>(review.shop.domain, DISCOUNT_CODE_BASIC_CREATE, {
      basicCodeDiscount: {
        title: `Review thank-you — ${row.code}`,
        code: row.code,
        startsAt: new Date().toISOString(),
        endsAt: expiresAt.toISOString(),
        usageLimit: 1,
        appliesOncePerCustomer: true,
        customerSelection: { all: true },
        customerGets: {
          value: { percentage: percentageOff / 100 },
          items: { all: true },
        },
      },
    });

    const result = data.discountCodeBasicCreate;
    if (result.userErrors.length > 0) {
      throw new Error(result.userErrors.map((e) => e.message).join("; "));
    }
    if (!result.codeDiscountNode) {
      throw new Error("discountCodeBasicCreate returned no codeDiscountNode");
    }

    await db.reviewDiscount.update({
      where: { id: row.id },
      data: { status: "CREATED", shopifyDiscountId: result.codeDiscountNode.id },
    });

    return { code: row.code, percentageOff, expiresAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[review-discount] creation failed for review ${reviewId}:`, message);
    await db.reviewDiscount.update({
      where: { id: row.id },
      data: { status: "FAILED", failureReason: message.slice(0, 500) },
    });
    return null;
  }
}
