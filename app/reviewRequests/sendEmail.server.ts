import db from "../db.server";
import { sendEmail } from "../email/sender.server";
import { resolveTemplate } from "../email/templates.server";

export async function processReviewRequestEmail(reviewRequestId: string): Promise<void> {
  const reviewRequest = await db.reviewRequest.findUnique({
    where: { id: reviewRequestId },
    include: { customer: true, product: true, shop: true },
  });
  if (!reviewRequest || reviewRequest.status !== "PENDING") return;
  if (!reviewRequest.customer?.email || !reviewRequest.product) return;

  const reviewUrl = `${process.env.SHOPIFY_APP_URL ?? ""}/r/${reviewRequest.token}`;

  await sendEmail({
    to: reviewRequest.customer.email,
    toName: reviewRequest.customer.firstName ?? undefined,
    ...resolveTemplate(reviewRequest.triggerType, {
      shopName: reviewRequest.shop.domain,
      productTitle: reviewRequest.product.title,
      reviewUrl,
      customerName: reviewRequest.customer.firstName ?? undefined,
    }),
  });

  await db.reviewRequest.update({
    where: { id: reviewRequest.id },
    data: { status: "SENT", sentAt: new Date() },
  });
}
