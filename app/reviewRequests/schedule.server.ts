import crypto from "node:crypto";
import db from "../db.server";
import { enqueueReviewRequestEmail } from "../queue.server";

// One row per product on the order, gated by that shop's ScheduleRule for
// `triggerType`. delayDays=0 sends as soon as the trigger fires. Extending
// to a new Shopify event just needs a new webhook + a call here with its
// topic string — no branching. Caller is expected to have already synced
// the order.
export async function createReviewRequestsForOrderTrigger(
  shopId: string,
  shopifyOrderId: string,
  triggerType: string,
): Promise<void> {
  const rule = await db.scheduleRule.findUnique({
    where: { shopId_triggerType: { shopId, triggerType } },
  });
  if (!rule || !rule.enabled) return;

  const order = await db.order.findUnique({
    where: { shopId_shopifyId: { shopId, shopifyId: shopifyOrderId } },
    include: { lineItems: true, customer: true },
  });
  if (!order || !order.customerId || !order.customer?.email) return;

  const scheduledAt = new Date();
  scheduledAt.setDate(scheduledAt.getDate() + rule.delayDays);

  const seenProducts = new Set<string>();
  for (const item of order.lineItems) {
    if (!item.productId || seenProducts.has(item.productId)) continue;
    seenProducts.add(item.productId);

    const reviewRequest = await db.reviewRequest.upsert({
      where: {
        orderId_productId_channel_triggerType: {
          orderId: order.id,
          productId: item.productId,
          channel: "email",
          triggerType,
        },
      },
      create: {
        shopId,
        orderId: order.id,
        customerId: order.customerId,
        productId: item.productId,
        triggerType,
        token: crypto.randomBytes(24).toString("base64url"),
        scheduledAt,
      },
      update: {},
    });

    if (reviewRequest.status === "PENDING") {
      const delayMs = Math.max(0, scheduledAt.getTime() - Date.now());
      await enqueueReviewRequestEmail({ reviewRequestId: reviewRequest.id }, delayMs);
    }
  }
}
