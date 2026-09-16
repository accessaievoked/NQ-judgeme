import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { recordWebhookEvent } from "../webhooks/ledger.server";
import { enqueueWebhookEvent } from "../queue.server";

/**
 * Thin receipt handler: verify HMAC (done inside `authenticate.webhook`),
 * ledger the event for idempotency, enqueue the real work, return 200.
 * No Shopify/database sync work happens in this request.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, webhookId, payload } = await authenticate.webhook(request);

  const { isDuplicate, eventId } = await recordWebhookEvent({
    shopDomain: shop,
    topic,
    webhookId,
    payload,
  });

  if (!isDuplicate && eventId) {
    await enqueueWebhookEvent({ webhookEventId: eventId });
  }

  return new Response(null, { status: 200 });
};
