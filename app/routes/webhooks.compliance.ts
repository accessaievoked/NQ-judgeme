// Shopify's three mandatory privacy webhooks (required for App Store
// review): customers/data_request, customers/redact, shop/redact. Subscribed
// together via shopify.app.toml's [webhooks].compliance_topics, all hitting
// this one route, dispatched on `topic` — same ledger-dedup pattern as the
// other webhook routes.
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { recordWebhookEvent } from "../webhooks/ledger.server";
import { cancelReviewReminder } from "../queue.server";

interface CompliancePayload {
  shop_id?: number;
  shop_domain?: string;
  customer?: { id?: number | string; email?: string; phone?: string };
  orders_to_redact?: number[];
}

async function redactCustomer(shopDomain: string, customerId: number | string) {
  const shop = await db.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop) return;

  const shopifyId = `gid://shopify/Customer/${customerId}`;
  const customer = await db.customer.findUnique({
    where: { shopId_shopifyId: { shopId: shop.id, shopifyId } },
  });
  if (!customer) return;

  // Cancel any pending reminder emails for this customer's review requests
  // before anonymising them, so the worker doesn't send a reminder for a
  // request whose customer record is about to be nulled out.
  const pendingRequests = await db.reviewRequest.findMany({
    where: { customerId: customer.id, pendingReminderJobId: { not: null } },
    select: { id: true, pendingReminderJobId: true },
  });
  for (const reviewRequest of pendingRequests) {
    if (reviewRequest.pendingReminderJobId) {
      await cancelReviewReminder(reviewRequest.pendingReminderJobId);
    }
  }
  await db.reviewRequest.updateMany({
    where: { customerId: customer.id, status: { in: ["PENDING", "SENT", "REMINDED_1", "REMINDED_2", "REMINDED_3"] } },
    data: { status: "CANCELLED", cancelledAt: new Date(), pendingReminderJobId: null },
  });

  await db.review.updateMany({
    where: { customerId: customer.id },
    data: { authorName: null, customerId: null },
  });

  await db.customer.delete({ where: { id: customer.id } });
}

async function redactShop(shopDomain: string) {
  // Cascades to every row the Shop relation owns (settings, products,
  // customers, orders, review requests, reviews, …) per the schema's
  // onDelete: Cascade.
  await db.shop.deleteMany({ where: { domain: shopDomain } });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, webhookId, payload } = await authenticate.webhook(request);

  const { isDuplicate } = await recordWebhookEvent({
    shopDomain: shop,
    topic,
    webhookId,
    payload,
  });
  if (isDuplicate) {
    return new Response(null, { status: 200 });
  }

  const data = payload as CompliancePayload;

  switch (topic) {
    case "CUSTOMERS_REDACT":
      if (data.customer?.id != null) {
        await redactCustomer(shop, data.customer.id);
      }
      break;
    case "SHOP_REDACT":
      await redactShop(shop);
      break;
    case "CUSTOMERS_DATA_REQUEST":
      // No automated export — the merchant fulfils the request directly;
      // this just logs receipt so there's a record it was handled.
      console.log(`customers/data_request received for ${shop}, customer ${data.customer?.id}`);
      break;
    default:
      break;
  }

  return new Response(null, { status: 200 });
};
