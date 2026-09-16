import { shopifyGraphql } from "./client";
import type { ShopifyProductNode, ShopifyProductsPage } from "./types";

const PRODUCTS_QUERY = `#graphql
  query BackfillProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          title
          handle
          status
          vendor
          productType
          featuredImage { url }
          variants(first: 50) {
            edges {
              node {
                id
                title
                sku
                price
              }
            }
          }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`;

const PAGE_SIZE = 50;

/**
 * Pages through a shop's full product catalog, invoking `onPage` once per
 * page so callers can upsert incrementally instead of holding the whole
 * catalog in memory. Cursor pagination is deliberate here over bulk
 * operations: at typical SMB catalog sizes the extra bulk-operation
 * lifecycle (start job, poll, download JSONL) buys nothing and this stays a
 * simple, synchronous call the worker can retry per-page.
 */
export async function fetchAllProducts(
  shopDomain: string,
  onPage: (products: ShopifyProductNode[]) => Promise<void>,
): Promise<number> {
  let after: string | undefined;
  let hasNextPage = true;
  let total = 0;

  while (hasNextPage) {
    const data = await shopifyGraphql<ShopifyProductsPage>(
      shopDomain,
      PRODUCTS_QUERY,
      { first: PAGE_SIZE, after },
    );

    const nodes = data.products.edges.map((edge) => edge.node);
    if (nodes.length > 0) {
      await onPage(nodes);
      total += nodes.length;
    }

    hasNextPage = data.products.pageInfo.hasNextPage;
    after = data.products.edges.at(-1)?.cursor;
  }

  return total;
}
