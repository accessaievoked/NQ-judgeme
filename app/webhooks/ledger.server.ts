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
  | { isDuplicate: true; eventId: null };

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
      return { isDuplicate: true, eventId: null };
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
