import { Worker } from "bullmq";
import redis from "../app/redis.server";
import {
  SHOP_SYNC_QUEUE,
  WEBHOOK_QUEUE,
  REVIEW_REQUEST_EMAIL_QUEUE,
  REVIEW_REMINDER_QUEUE,
  REVIEW_THANKYOU_QUEUE,
  type ShopSyncJobData,
  type WebhookEventJobData,
  type ReviewRequestEmailJobData,
  type ReviewReminderJobData,
  type ReviewThankYouJobData,
} from "../app/queue.server";
import { runShopSync } from "../app/sync/runShopSync.server";
import { processWebhookEvent } from "../app/webhooks/processEvent.server";
import { processReviewRequestEmail } from "../app/reviewRequests/sendEmail.server";
import { processReviewReminder } from "../app/reviewRequests/sendReminder.server";
import { sendReviewThankYouEmail } from "../app/reviewRequests/sendThankYou.server";

const syncWorker = new Worker<ShopSyncJobData>(
  SHOP_SYNC_QUEUE,
  async (job) => {
    await runShopSync(job.data.shopId, job.data.shopDomain);
  },
  { connection: redis, concurrency: 2 },
);

const webhookWorker = new Worker<WebhookEventJobData>(
  WEBHOOK_QUEUE,
  async (job) => {
    await processWebhookEvent(job.data.webhookEventId);
  },
  { connection: redis, concurrency: 5 },
);

const reviewRequestEmailWorker = new Worker<ReviewRequestEmailJobData>(
  REVIEW_REQUEST_EMAIL_QUEUE,
  async (job) => {
    await processReviewRequestEmail(job.data.reviewRequestId);
  },
  { connection: redis, concurrency: 5 },
);

const reviewReminderWorker = new Worker<ReviewReminderJobData>(
  REVIEW_REMINDER_QUEUE,
  async (job) => {
    await processReviewReminder(job.data.reviewRequestId, job.data.reminderIndex);
  },
  { connection: redis, concurrency: 5 },
);

const reviewThankYouWorker = new Worker<ReviewThankYouJobData>(
  REVIEW_THANKYOU_QUEUE,
  async (job) => {
    await sendReviewThankYouEmail(job.data.reviewId);
  },
  { connection: redis, concurrency: 5 },
);

for (const worker of [syncWorker, webhookWorker, reviewRequestEmailWorker, reviewReminderWorker, reviewThankYouWorker]) {
  worker.on("failed", (job, err) => {
    console.error(
      `[worker:${worker.name}] job ${job?.id} failed: ${err.message}`,
    );
  });
  worker.on("completed", (job) => {
    console.log(`[worker:${worker.name}] job ${job.id} completed`);
  });
}

console.log(
  `Workers started: ${SHOP_SYNC_QUEUE}, ${WEBHOOK_QUEUE}, ${REVIEW_REQUEST_EMAIL_QUEUE}, ${REVIEW_REMINDER_QUEUE}, ${REVIEW_THANKYOU_QUEUE}`,
);

async function shutdown() {
  console.log("Shutting down workers...");
  await Promise.all([
    syncWorker.close(),
    webhookWorker.close(),
    reviewRequestEmailWorker.close(),
    reviewReminderWorker.close(),
    reviewThankYouWorker.close(),
  ]);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
