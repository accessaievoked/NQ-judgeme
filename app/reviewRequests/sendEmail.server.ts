import db from "../db.server";
import { sendEmail } from "../email/sender.server";
import { resolveTemplate } from "../email/templates.server";
import { getAppUrl } from "../appConfig.server";

export async function processReviewRequestEmail(reviewRequestId: string): Promise<void> {
  const reviewRequest = await db.reviewRequest.findUnique({
    where: { id: reviewRequestId },
    include: { customer: true, product: true, shop: true },
  });
  if (!reviewRequest || reviewRequest.status !== "PENDING") return;
  if (!reviewRequest.customer?.email || !reviewRequest.product) return;

  const reviewUrl = `${await getAppUrl()}/r/${reviewRequest.token}`;

  const { subject, html } = await resolveTemplate(reviewRequest.shopId, reviewRequest.triggerType, {
    shopName: reviewRequest.shop.domain,
    productTitle: reviewRequest.product.title,
    reviewUrl,
    customerName: reviewRequest.customer.firstName ?? undefined,
  });

  await sendEmail({
    to: reviewRequest.customer.email,
    toName: reviewRequest.customer.firstName ?? undefined,
    subject,
    html,
  });

  await db.reviewRequest.update({
    where: { id: reviewRequest.id },
    data: { status: "SENT", sentAt: new Date() },
  });
}
