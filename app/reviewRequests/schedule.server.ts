import crypto from "node:crypto";
import db from "../db.server";
import { syncOrderById } from "../sync/orders.server";
import { enqueueReviewRequestEmail } from "../queue.server";

const REQUEST_DELAY_DAYS = 14; // matches Judge.me's default "send after 14 days"

/**
 * Runs when an order is fulfilled: makes sure the order is up to date, then
 * creates one ReviewRequest per distinct product on the order (skips
 * products we don't have a local mirror row for) and schedules its email.
 * Idempotent — re-running for the same order/product/channel just no-ops
 * via the ReviewRequest unique constraint.
 */
export async function createReviewRequestsForOrder(
  shopId: string,
  shopDomain: string,
  shopifyOrderId: string,
): Promise<void> {
  await syncOrderById(shopId, shopDomain, shopifyOrderId);

  const order = await db.order.findUnique({
    where: { shopId_shopifyId: { shopId, shopifyId: shopifyOrderId } },
    include: { lineItems: true, customer: true },
  });
  if (!order || !order.customerId || !order.customer?.email) return;

  const scheduledAt = new Date();
  scheduledAt.setDate(scheduledAt.getDate() + REQUEST_DELAY_DAYS);

  const seenProducts = new Set<string>();
  for (const item of order.lineItems) {
    if (!item.productId || seenProducts.has(item.productId)) continue;
    seenProducts.add(item.productId);

    const reviewRequest = await db.reviewRequest.upsert({
      where: {
        orderId_productId_channel: {
          orderId: order.id,
          productId: item.productId,
          channel: "email",
        },
      },
      create: {
        shopId,
        orderId: order.id,
        customerId: order.customerId,
        productId: item.productId,
        token: crypto.randomBytes(24).toString("base64url"),
        scheduledAt,
      },
      update: {},
    });

    if (reviewRequest.status === "PENDING") {
      const delayMs = Math.max(0, scheduledAt.getTime() - Date.now());
      await enqueueReviewRequestEmail(
        { reviewRequestId: reviewRequest.id },
        delayMs,
      );
    }
  }
}
