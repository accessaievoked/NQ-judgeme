import db from "../db.server";
import { syncCatalog } from "./catalog.server";
import { syncOrders } from "./orders.server";

const ORDER_BACKFILL_DAYS = 60;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The install-time sync: catalog first, then the last 60 days of orders.
 * Tracks progress on the Shop row so the dashboard can show sync status
 * without polling Shopify or the job queue directly.
 */
export async function runShopSync(
  shopId: string,
  shopDomain: string,
): Promise<void> {
  await db.shop.update({
    where: { id: shopId },
    data: { catalogSyncStatus: "RUNNING", syncError: null },
  });

  try {
    await syncCatalog(shopId, shopDomain);
    await db.shop.update({
      where: { id: shopId },
      data: { catalogSyncStatus: "COMPLETE", catalogSyncedAt: new Date() },
    });
  } catch (error) {
    await db.shop.update({
      where: { id: shopId },
      data: { catalogSyncStatus: "FAILED", syncError: errorMessage(error) },
    });
    throw error;
  }

  await db.shop.update({
    where: { id: shopId },
    data: { orderSyncStatus: "RUNNING" },
  });

  try {
    const since = new Date();
    since.setDate(since.getDate() - ORDER_BACKFILL_DAYS);
    await syncOrders(shopId, shopDomain, since);
    await db.shop.update({
      where: { id: shopId },
      data: { orderSyncStatus: "COMPLETE", orderSyncedAt: new Date() },
    });
  } catch (error) {
    await db.shop.update({
      where: { id: shopId },
      data: { orderSyncStatus: "FAILED", syncError: errorMessage(error) },
    });
    throw error;
  }
}
