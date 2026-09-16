import db from "../db.server";
import { sendReviewRequestEmail } from "../email/sender.server";

/** Runs when a review request's scheduled send time arrives. */
export async function processReviewRequestEmail(
  reviewRequestId: string,
): Promise<void> {
  const reviewRequest = await db.reviewRequest.findUnique({
    where: { id: reviewRequestId },
    include: { customer: true, product: true, shop: true },
  });
  if (!reviewRequest || reviewRequest.status !== "PENDING") return;
  if (!reviewRequest.customer?.email || !reviewRequest.product) return;

  await sendReviewRequestEmail({
    to: reviewRequest.customer.email,
    productTitle: reviewRequest.product.title,
    token: reviewRequest.token,
    shopDomain: reviewRequest.shop.domain,
  });

  await db.reviewRequest.update({
    where: { id: reviewRequest.id },
    data: { status: "SENT", sentAt: new Date() },
  });
}
