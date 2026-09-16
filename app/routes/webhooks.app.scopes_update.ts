import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { recordWebhookEvent } from "../webhooks/ledger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop, webhookId } =
    await authenticate.webhook(request);

  const { isDuplicate } = await recordWebhookEvent({
    shopDomain: shop,
    topic,
    webhookId,
    payload,
  });
  if (isDuplicate) {
    return new Response(null, { status: 200 });
  }

  const current = payload.current;

  if (session) {
    await db.session.update({
      where: { id: session.id },
      data: { scope: current.toString() },
    });
  }

  return new Response(null, { status: 200 });
};
