import { Queue } from "bullmq";
import redis from "./redis.server";

export const SHOP_SYNC_QUEUE = "shop-sync";
export const WEBHOOK_QUEUE = "webhook-events";
export const REVIEW_REQUEST_EMAIL_QUEUE = "review-request-email";

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
