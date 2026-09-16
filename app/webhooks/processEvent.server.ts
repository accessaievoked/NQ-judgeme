import db from "../db.server";
import { syncOrderById } from "../sync/orders.server";
import { createReviewRequestsForOrderTrigger } from "../reviewRequests/schedule.server";
import { markWebhookEventFailed, markWebhookEventProcessed } from "./ledger.server";

const ORDER_TRIGGER_TOPICS = new Set(["orders/create", "orders/paid", "orders/fulfilled"]);

// shopify.app.toml subscribes with "orders/paid" but the running webhook
// context reports the topic back as "ORDERS_PAID" — normalize so ledger
// rows, ScheduleRule.triggerType, and this check all agree on one format.
function normalizeTopic(topic: string): string {
  return topic.toLowerCase().replace(/_/g, "/");
}

// Runs inside the worker, dispatching a ledgered event to the handler for
// its topic. Order-lifecycle topics all go through the same generic
// trigger-scheduling path — adding a new one is just adding its topic here
// and a webhook subscription in shopify.app.toml.
export async function processWebhookEvent(webhookEventId: string): Promise<void> {
  const event = await db.webhookEvent.findUnique({ where: { id: webhookEventId } });
  if (!event) return;

  const topic = normalizeTopic(event.topic);

  try {
    await db.webhookEvent.update({ where: { id: event.id }, data: { status: "PROCESSING" } });

    if (ORDER_TRIGGER_TOPICS.has(topic)) {
      const shop = await db.shop.findUnique({ where: { domain: event.shopDomain } });
      if (!shop) {
        // May race the afterAuth hook — throw so BullMQ retries with backoff.
        throw new Error(`No Shop found for domain ${event.shopDomain}`);
      }

      const payload = event.payload as { id?: number | string } | null;
      if (payload?.id != null) {
        const shopifyOrderId = `gid://shopify/Order/${payload.id}`;
        await syncOrderById(shop.id, shop.domain, shopifyOrderId);
        await createReviewRequestsForOrderTrigger(shop.id, shopifyOrderId, topic);
      }
    }

    await markWebhookEventProcessed(event.id);
  } catch (error) {
    await markWebhookEventFailed(event.id, error);
    throw error;
  }
}
