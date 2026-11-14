import { Prisma } from "@prisma/client";
import db from "../db.server";

export interface WebhookLedgerEntry {
  shopDomain: string;
  topic: string;
  webhookId: string;
  payload?: unknown;
}

export type RecordWebhookEventResult =
  | { isDuplicate: false; eventId: string }
  | { isDuplicate: true; eventId: string | null };

/**
 * Inserts a row into the webhook idempotency ledger. The unique constraint
 * on `webhookId` (Shopify's own event id) is the actual source of dedup
 * truth: if two deliveries race, only one insert succeeds and the other
 * gets a unique-constraint violation, which we translate into "duplicate,
 * do no further work" per the design doc's idempotency contract.
 */
export async function recordWebhookEvent(
  entry: WebhookLedgerEntry,
): Promise<RecordWebhookEventResult> {
  try {
    const event = await db.webhookEvent.create({
      data: {
        shopDomain: entry.shopDomain,
        topic: entry.topic,
        webhookId: entry.webhookId,
        payload: entry.payload as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return { isDuplicate: false, eventId: event.id };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // The ledger insert lost the race (a retried delivery, or one that
      // raced a duplicate webhookId). If the original attempt never made it
      // onto the queue — Redis was briefly down — this delivery is the only
      // chance to get it there, so hand the caller its id to re-queue.
      // enqueueWebhookEvent's fixed jobId makes re-queuing an
      // already-queued/processed event a safe no-op either way.
      const existing = await db.webhookEvent.findUnique({
        where: { webhookId: entry.webhookId },
        select: { id: true, status: true },
      });
      const shouldRequeue = existing?.status === "RECEIVED" || existing?.status === "FAILED";
      return { isDuplicate: true, eventId: shouldRequeue ? existing.id : null };
    }
    throw error;
  }
}

export async function markWebhookEventProcessed(id: string) {
  await db.webhookEvent.update({
    where: { id },
    data: { status: "PROCESSED", processedAt: new Date() },
  });
}

export async function markWebhookEventFailed(id: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await db.webhookEvent.update({
    where: { id },
    data: { status: "FAILED", error: message.slice(0, 2000) },
  });
}
