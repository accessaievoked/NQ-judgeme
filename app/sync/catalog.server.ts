import { Prisma } from "@prisma/client";
import db from "../db.server";
import { fetchAllProducts } from "../shopify/products";

export interface CatalogSyncResult {
  productCount: number;
  variantCount: number;
}

/**
 * Mirrors a shop's full product catalog into Postgres. Idempotent: running
 * it twice upserts on Shopify's own IDs rather than creating duplicates.
 */
export async function syncCatalog(
  shopId: string,
  shopDomain: string,
): Promise<CatalogSyncResult> {
  let productCount = 0;
  let variantCount = 0;

  await fetchAllProducts(shopDomain, async (products) => {
    for (const product of products) {
      const dbProduct = await db.product.upsert({
        where: { shopId_shopifyId: { shopId, shopifyId: product.id } },
        create: {
          shopId,
          shopifyId: product.id,
          title: product.title,
          handle: product.handle,
          status: product.status,
          vendor: product.vendor,
          productType: product.productType,
          imageUrl: product.featuredImage?.url ?? null,
        },
        update: {
          title: product.title,
          handle: product.handle,
          status: product.status,
          vendor: product.vendor,
          productType: product.productType,
          imageUrl: product.featuredImage?.url ?? null,
          syncedAt: new Date(),
        },
      });
      productCount += 1;

      for (const edge of product.variants.edges) {
        const variant = edge.node;
        await db.variant.upsert({
          where: { shopId_shopifyId: { shopId, shopifyId: variant.id } },
          create: {
            shopId,
            productId: dbProduct.id,
            shopifyId: variant.id,
            title: variant.title,
            sku: variant.sku,
            price: variant.price ? new Prisma.Decimal(variant.price) : null,
          },
          update: {
            productId: dbProduct.id,
            title: variant.title,
            sku: variant.sku,
            price: variant.price ? new Prisma.Decimal(variant.price) : null,
            syncedAt: new Date(),
          },
        });
        variantCount += 1;
      }
    }
  });

  return { productCount, variantCount };
}
