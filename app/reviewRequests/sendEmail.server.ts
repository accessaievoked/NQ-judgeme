import db from "../db.server";
import { sendEmail } from "../email/sender.server";
import { resolveTemplate } from "../email/templates.server";
import { getAppUrl } from "../appConfig.server";
import { enqueueReviewReminder } from "../queue.server";

export async function processReviewRequestEmail(reviewRequestId: string): Promise<void> {
  const reviewRequest = await db.reviewRequest.findUnique({
    where: { id: reviewRequestId },
    include: { customer: true, product: true, shop: { include: { settings: true } } },
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

  // Kick off the no-review-yet reminder chain if this shop has one
  // configured. processReviewReminder (sendReminder.server.ts) re-checks
  // for an actual review before ever sending, so this is safe to schedule
  // unconditionally here.
  const reminderDays = reviewRequest.shop.settings?.reminderDays ?? [];
  let pendingReminderJobId: string | null = null;
  if (reminderDays.length > 0) {
    const delayMs = Math.max(1, reminderDays[0]) * 24 * 60 * 60 * 1000;
    pendingReminderJobId = await enqueueReviewReminder(
      { reviewRequestId: reviewRequest.id, reminderIndex: 0 },
      delayMs,
    );
  }

  await db.reviewRequest.update({
    where: { id: reviewRequest.id },
    data: { status: "SENT", sentAt: new Date(), pendingReminderJobId },
  });
}
