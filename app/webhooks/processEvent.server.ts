import db from "../db.server";
import { syncOrderById } from "../sync/orders.server";
import { createReviewRequestsForOrder } from "../reviewRequests/schedule.server";
import {
  markWebhookEventFailed,
  markWebhookEventProcessed,
} from "./ledger.server";

/**
 * Dispatches a ledgered webhook event to the code that actually does the
 * work. Runs inside the worker, never inside the HTTP webhook request.
 */
export async function processWebhookEvent(webhookEventId: string): Promise<void> {
  const event = await db.webhookEvent.findUnique({
    where: { id: webhookEventId },
  });
  if (!event) return;

  try {
    await db.webhookEvent.update({
      where: { id: event.id },
      data: { status: "PROCESSING" },
    });

    switch (event.topic) {
      case "orders/paid": {
        const shop = await db.shop.findUnique({
          where: { domain: event.shopDomain },
        });
        if (!shop) {
          // Shop row may not exist yet if this races the OAuth afterAuth
          // hook. Throw so BullMQ retries with backoff instead of dropping
          // the event.
          throw new Error(`No Shop found for domain ${event.shopDomain}`);
        }

        const payload = event.payload as { id?: number | string } | null;
        if (payload?.id != null) {
          const shopifyOrderId = `gid://shopify/Order/${payload.id}`;
          await syncOrderById(shop.id, shop.domain, shopifyOrderId);
        }
        break;
      }
      case "orders/fulfilled": {
        const shop = await db.shop.findUnique({
          where: { domain: event.shopDomain },
        });
        if (!shop) {
          throw new Error(`No Shop found for domain ${event.shopDomain}`);
        }

        const payload = event.payload as { id?: number | string } | null;
        if (payload?.id != null) {
          const shopifyOrderId = `gid://shopify/Order/${payload.id}`;
          await createReviewRequestsForOrder(shop.id, shop.domain, shopifyOrderId);
        }
        break;
      }
      default:
        break;
    }

    await markWebhookEventProcessed(event.id);
  } catch (error) {
    await markWebhookEventFailed(event.id, error);
    throw error;
  }
}
