import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { recordWebhookEvent } from "../webhooks/ledger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic, webhookId, payload } =
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

  // Webhook requests can trigger multiple times and after an app has already
  // been uninstalled. If this webhook already ran, the session may have been
  // deleted previously — deleteMany/updateMany below are naturally no-ops then.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }
  await db.shop.updateMany({
    where: { domain: shop },
    data: { uninstalledAt: new Date() },
  });

  return new Response(null, { status: 200 });
};
