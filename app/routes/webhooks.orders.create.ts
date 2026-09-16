import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { recordWebhookEvent } from "../webhooks/ledger.server";
import { enqueueWebhookEvent } from "../queue.server";

/** Same thin receipt pattern as orders/paid and orders/fulfilled. */
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
