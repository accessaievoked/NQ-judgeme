// Fires right after a review is saved (see routes/r.$token.jsx action).
// Creates the vendor's thank-you discount (if that shop has it turned on —
// see ShopSettings.reviewDiscount*) and sends the thank-you email either
// way. Discount creation never blocks or fails this — see
// discounts/createReviewDiscount.server.ts for why.
import db from "../db.server";
import { sendEmail } from "../email/sender.server";
import { resolveTemplate } from "../email/templates.server";
import { createReviewDiscountForReview } from "../discounts/createReviewDiscount.server";

const DISCOUNT_SECTION_STYLE =
  "margin-top:24px;padding:16px;background:#f4f4f4;border-radius:8px;text-align:center;";

function discountSectionHtml(discount: { code: string; percentageOff: number; expiresAt: Date }): string {
  return `<div style="${DISCOUNT_SECTION_STYLE}">
    <p style="margin:0 0 8px;font-weight:600;">Here's ${discount.percentageOff}% off your next order:</p>
    <p style="margin:0 0 8px;font-size:20px;letter-spacing:1px;font-weight:700;">${discount.code}</p>
    <p style="margin:0;color:#666;font-size:13px;">Expires ${discount.expiresAt.toLocaleDateString()}</p>
  </div>`;
}

export async function sendReviewThankYouEmail(reviewId: string): Promise<void> {
  const review = await db.review.findUnique({
    where: { id: reviewId },
    include: {
      shop: true,
      product: true,
      customer: true,
      reviewRequest: { include: { customer: true } },
    },
  });
  if (!review) return;

  const customer = review.customer ?? review.reviewRequest?.customer ?? null;
  if (!customer?.email) return; // e.g. an anonymous storefront-widget review

  let discount = null;
  try {
    discount = await createReviewDiscountForReview(reviewId);
  } catch (error) {
    // Belt-and-suspenders — createReviewDiscountForReview already catches
    // its own Shopify/DB errors, but a thank-you email must never be
    // skipped just because the discount step misbehaved unexpectedly.
    console.error(`[review-thankyou] discount step threw for review ${reviewId}:`, error);
  }

  const { subject, html } = await resolveTemplate(review.shopId, "review_thankyou", {
    shopName: review.shop.domain,
    productTitle: review.product.title,
    customerName: customer.firstName ?? undefined,
    discountSection: discount ? discountSectionHtml(discount) : "",
  });

  await sendEmail({
    to: customer.email,
    toName: customer.firstName ?? undefined,
    subject,
    html,
  });
}
