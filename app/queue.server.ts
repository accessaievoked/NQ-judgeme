import { Queue } from "bullmq";
import redis from "./redis.server";

export const SHOP_SYNC_QUEUE = "shop-sync";
export const WEBHOOK_QUEUE = "webhook-events";
export const REVIEW_REQUEST_EMAIL_QUEUE = "review-request-email";
export const REVIEW_REMINDER_QUEUE = "review-reminder-email";
export const REVIEW_THANKYOU_QUEUE = "review-thankyou-email";

export interface ShopSyncJobData {
  shopId: string;
  shopDomain: string;
}

export interface WebhookEventJobData {
  webhookEventId: string;
}

export interface ReviewRequestEmailJobData {
  reviewRequestId: string;
}

export interface ReviewReminderJobData {
  reviewRequestId: string;
  // 0-based index into the shop's ShopSettings.reminderDays array — which
  // reminder this job *is*. The worker uses it both to know which delay it
  // just fired at and, incremented, to look up the delay for the next one.
  reminderIndex: number;
}

export interface ReviewThankYouJobData {
  reviewId: string;
}

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
};

export const shopSyncQueue = new Queue<ShopSyncJobData>(SHOP_SYNC_QUEUE, {
  connection: redis,
  defaultJobOptions,
});

export const webhookQueue = new Queue<WebhookEventJobData>(WEBHOOK_QUEUE, {
  connection: redis,
  defaultJobOptions,
});

export const reviewRequestEmailQueue = new Queue<ReviewRequestEmailJobData>(
  REVIEW_REQUEST_EMAIL_QUEUE,
  { connection: redis, defaultJobOptions },
);

export const reviewReminderQueue = new Queue<ReviewReminderJobData>(
  REVIEW_REMINDER_QUEUE,
  { connection: redis, defaultJobOptions },
);

export const reviewThankYouQueue = new Queue<ReviewThankYouJobData>(
  REVIEW_THANKYOU_QUEUE,
  { connection: redis, defaultJobOptions },
);

/**
 * Queues the full install-time sync (catalog + 60-day order backfill) for a
 * shop. Uses a stable jobId so a second trigger while one is already queued
 * or running is a no-op instead of a duplicate sync.
 */
export async function enqueueShopSync(data: ShopSyncJobData) {
  await shopSyncQueue.add("sync", data, { jobId: `shop-sync-${data.shopId}` });
}

/**
 * Queues processing for a single ledgered webhook event. Uses the
 * WebhookEvent row's id as the jobId, so re-enqueuing the same event (e.g. a
 * retried HTTP delivery that raced the ledger insert) is a no-op.
 */
export async function enqueueWebhookEvent(data: WebhookEventJobData) {
  await webhookQueue.add("process", data, {
    jobId: `webhook-event-${data.webhookEventId}`,
  });
}

/** Schedules a review-request email to fire `delayMs` from now. */
export async function enqueueReviewRequestEmail(
  data: ReviewRequestEmailJobData,
  delayMs: number,
) {
  await reviewRequestEmailQueue.add("send", data, {
    jobId: `review-request-email-${data.reviewRequestId}`,
    delay: delayMs,
  });
}

/**
 * Schedules one no-review-yet reminder. jobId is per (request, index) so the
 * chain can never double-book the same step, and returns that id so the
 * caller can stash it as ReviewRequest.pendingReminderJobId for cancellation.
 */
export async function enqueueReviewReminder(
  data: ReviewReminderJobData,
  delayMs: number,
): Promise<string> {
  const jobId = `review-reminder-${data.reviewRequestId}-${data.reminderIndex}`;
  await reviewReminderQueue.add("send", data, { jobId, delay: delayMs });
  return jobId;
}

/** Best-effort cancel of a pending (not yet running) reminder job. */
export async function cancelReviewReminder(jobId: string): Promise<void> {
  await reviewReminderQueue.remove(jobId).catch(() => {});
}

/**
 * Queues the post-submission discount+thank-you email. Backgrounded (rather
 * than awaited inline in the review-submission request) so the shopper's
 * "Submit review" click doesn't wait on a Shopify Admin API round-trip plus
 * an SMTP send, and so a transient failure gets BullMQ's automatic retries
 * instead of just failing silently on that one request.
 */
export async function enqueueReviewThankYou(data: ReviewThankYouJobData) {
  await reviewThankYouQueue.add("send", data, {
    jobId: `review-thankyou-${data.reviewId}`,
  });
}
