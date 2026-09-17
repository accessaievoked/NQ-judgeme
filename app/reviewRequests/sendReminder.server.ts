import db from "../db.server";
import { sendEmail } from "../email/sender.server";
import { resolveTemplate } from "../email/templates.server";
import { getAppUrl } from "../appConfig.server";
import { enqueueReviewReminder } from "../queue.server";

const REMINDER_STATUS = ["REMINDED_1", "REMINDED_2", "REMINDED_3"] as const;
const MAX_REMINDERS = 3;

function reminderAtField(reminderIndex: number): "firstReminderAt" | "secondReminderAt" | "thirdReminderAt" {
  if (reminderIndex === 0) return "firstReminderAt";
  if (reminderIndex === 1) return "secondReminderAt";
  return "thirdReminderAt";
}

/**
 * Fires reminder #`reminderIndex` (0-based) for a review request, then
 * chains the next one if the shop has more configured and we haven't hit
 * MAX_REMINDERS. Safe to run even if a review showed up in the meantime, or
 * even if this job somehow fires after cancellation was attempted and
 * missed — the review/status check below is the source of truth, not
 * whether this job merely exists.
 */
export async function processReviewReminder(
  reviewRequestId: string,
  reminderIndex: number,
): Promise<void> {
  const reviewRequest = await db.reviewRequest.findUnique({
    where: { id: reviewRequestId },
    include: { customer: true, product: true, shop: { include: { settings: true } }, review: true },
  });
  if (!reviewRequest) return;

  // The one check that matters: has this actually been reviewed (or
  // otherwise closed out) since this reminder was scheduled? If so, this is
  // exactly the "cancellation didn't land" fallback path — stop here,
  // send nothing, schedule nothing further.
  if (reviewRequest.review || reviewRequest.status === "COMPLETED" || reviewRequest.status === "CANCELLED") {
    if (reviewRequest.pendingReminderJobId) {
      await db.reviewRequest.update({ where: { id: reviewRequest.id }, data: { pendingReminderJobId: null } });
    }
    return;
  }

  if (!reviewRequest.customer?.email || !reviewRequest.product) return;
  if (reminderIndex < 0 || reminderIndex >= MAX_REMINDERS) return;

  const reviewUrl = `${await getAppUrl()}/r/${reviewRequest.token}`;
  const { subject, html } = await resolveTemplate(reviewRequest.shopId, "review_reminder", {
    shopName: reviewRequest.shop.domain,
    productTitle: reviewRequest.product.title,
    reviewUrl,
    customerName: reviewRequest.customer.firstName ?? undefined,
    reminderNumber: reminderIndex + 1,
  });

  await sendEmail({
    to: reviewRequest.customer.email,
    toName: reviewRequest.customer.firstName ?? undefined,
    subject,
    html,
  });

  const reminderDays = reviewRequest.shop.settings?.reminderDays ?? [];
  const nextIndex = reminderIndex + 1;
  const hasNextStep = nextIndex < MAX_REMINDERS && nextIndex < reminderDays.length;

  let nextJobId: string | null = null;
  if (hasNextStep) {
    const delayMs = Math.max(1, reminderDays[nextIndex]) * 24 * 60 * 60 * 1000;
    nextJobId = await enqueueReviewReminder({ reviewRequestId: reviewRequest.id, reminderIndex: nextIndex }, delayMs);
  }

  await db.reviewRequest.update({
    where: { id: reviewRequest.id },
    data: {
      status: REMINDER_STATUS[reminderIndex],
      [reminderAtField(reminderIndex)]: new Date(),
      pendingReminderJobId: nextJobId,
    },
  });
}
