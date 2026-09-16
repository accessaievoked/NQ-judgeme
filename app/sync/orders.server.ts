import { Prisma } from "@prisma/client";
import db from "../db.server";
import { fetchOrderById, fetchOrdersSince } from "../shopify/orders";
import type { ShopifyOrderNode } from "../shopify/types";

export interface OrderSyncResult {
  orderCount: number;
  customerCount: number;
}

/**
 * Upserts one Shopify order (and the customer/line items it references) into
 * Postgres. Idempotent on Shopify's own IDs — shared by both the bulk
 * backfill and the single-order webhook sync so there is exactly one place
 * that knows how to turn a `ShopifyOrderNode` into local rows.
 */
export async function upsertOrderNode(
  shopId: string,
  order: ShopifyOrderNode,
): Promise<{ customerShopifyId: string | null }> {
  let customerId: string | undefined;
  let customerShopifyId: string | null = null;

  if (order.customer) {
    const dbCustomer = await db.customer.upsert({
      where: { shopId_shopifyId: { shopId, shopifyId: order.customer.id } },
      create: {
        shopId,
        shopifyId: order.customer.id,
        email: order.customer.email,
        firstName: order.customer.firstName,
        lastName: order.customer.lastName,
      },
      update: {
        email: order.customer.email,
        firstName: order.customer.firstName,
        lastName: order.customer.lastName,
        syncedAt: new Date(),
      },
    });
    customerId = dbCustomer.id;
    customerShopifyId = order.customer.id;
  }

  const money = order.currentTotalPriceSet.shopMoney;
  const dbOrder = await db.order.upsert({
    where: { shopId_shopifyId: { shopId, shopifyId: order.id } },
    create: {
      shopId,
      shopifyId: order.id,
      name: order.name,
      customerId,
      email: order.email,
      currencyCode: money.currencyCode,
      totalPrice: new Prisma.Decimal(money.amount),
      financialStatus: order.displayFinancialStatus,
      fulfillmentStatus: order.displayFulfillmentStatus,
      processedAt: order.processedAt ? new Date(order.processedAt) : null,
      cancelledAt: order.cancelledAt ? new Date(order.cancelledAt) : null,
    },
    update: {
      customerId,
      email: order.email,
      currencyCode: money.currencyCode,
      totalPrice: new Prisma.Decimal(money.amount),
      financialStatus: order.displayFinancialStatus,
      fulfillmentStatus: order.displayFulfillmentStatus,
      processedAt: order.processedAt ? new Date(order.processedAt) : null,
      cancelledAt: order.cancelledAt ? new Date(order.cancelledAt) : null,
      syncedAt: new Date(),
    },
  });

  for (const edge of order.lineItems.edges) {
    const lineItem = edge.node;

    const [product, variant] = await Promise.all([
      lineItem.product
        ? db.product.findUnique({
            where: {
              shopId_shopifyId: { shopId, shopifyId: lineItem.product.id },
            },
            select: { id: true },
          })
        : null,
      lineItem.variant
        ? db.variant.findUnique({
            where: {
              shopId_shopifyId: { shopId, shopifyId: lineItem.variant.id },
            },
            select: { id: true },
          })
        : null,
    ]);

    await db.orderLineItem.upsert({
      where: {
        orderId_shopifyId: { orderId: dbOrder.id, shopifyId: lineItem.id },
      },
      create: {
        shopId,
        orderId: dbOrder.id,
        shopifyId: lineItem.id,
        productId: product?.id,
        variantId: variant?.id,
        title: lineItem.title,
        quantity: lineItem.quantity,
      },
      update: {
        productId: product?.id,
        variantId: variant?.id,
        title: lineItem.title,
        quantity: lineItem.quantity,
      },
    });
  }

  return { customerShopifyId };
}

/**
 * Mirrors orders processed on/after `sinceDate` into Postgres. Idempotent on
 * Shopify's own IDs, so re-running for an overlapping window (e.g. a webhook
 * update for an order already backfilled) updates rather than duplicates.
 */
export async function syncOrders(
  shopId: string,
  shopDomain: string,
  sinceDate: Date,
): Promise<OrderSyncResult> {
  let orderCount = 0;
  const seenCustomers = new Set<string>();

  await fetchOrdersSince(shopDomain, sinceDate, async (orders) => {
    for (const order of orders) {
      const { customerShopifyId } = await upsertOrderNode(shopId, order);
      if (customerShopifyId) seenCustomers.add(customerShopifyId);
      orderCount += 1;
    }
  });

  return { orderCount, customerCount: seenCustomers.size };
}

/** Fetches and upserts a single order by its Shopify GID (webhook-driven sync). */
export async function syncOrderById(
  shopId: string,
  shopDomain: string,
  shopifyOrderId: string,
): Promise<void> {
  const order = await fetchOrderById(shopDomain, shopifyOrderId);
  if (!order) return;
  await upsertOrderNode(shopId, order);
}
