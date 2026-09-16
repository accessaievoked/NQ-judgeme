import { shopifyGraphql } from "./client";
import type { ShopifyOrderNode, ShopifyOrdersPage } from "./types";

const ORDER_FIELDS = `
  id
  name
  email
  processedAt
  cancelledAt
  displayFinancialStatus
  displayFulfillmentStatus
  currentTotalPriceSet { shopMoney { amount currencyCode } }
  customer { id email firstName lastName }
  lineItems(first: 50) {
    edges {
      node {
        id
        title
        quantity
        product { id }
        variant { id }
      }
    }
  }
`;

const ORDERS_QUERY = `#graphql
  query BackfillOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: PROCESSED_AT) {
      edges {
        cursor
        node { ${ORDER_FIELDS} }
      }
      pageInfo { hasNextPage }
    }
  }
`;

const ORDER_BY_ID_QUERY = `#graphql
  query GetOrder($id: ID!) {
    order(id: $id) { ${ORDER_FIELDS} }
  }
`;

/** Fetches a single order by its Shopify GID, e.g. for webhook-driven syncs. */
export async function fetchOrderById(
  shopDomain: string,
  shopifyOrderId: string,
): Promise<ShopifyOrderNode | null> {
  const data = await shopifyGraphql<{ order: ShopifyOrderNode | null }>(
    shopDomain,
    ORDER_BY_ID_QUERY,
    { id: shopifyOrderId },
  );
  return data.order;
}

const PAGE_SIZE = 50;

/**
 * Pages through orders processed on/after `sinceDate`, invoking `onPage` for
 * each page. Relies on the store's default 60-day `read_orders` access
 * window — do not pass a window wider than that without also requesting the
 * `read_all_orders` scope (which needs Shopify approval).
 */
export async function fetchOrdersSince(
  shopDomain: string,
  sinceDate: Date,
  onPage: (orders: ShopifyOrderNode[]) => Promise<void>,
): Promise<number> {
  const isoDate = sinceDate.toISOString().slice(0, 10);
  const query = `processed_at:>='${isoDate}'`;

  let after: string | undefined;
  let hasNextPage = true;
  let total = 0;

  while (hasNextPage) {
    const data = await shopifyGraphql<ShopifyOrdersPage>(
      shopDomain,
      ORDERS_QUERY,
      { first: PAGE_SIZE, after, query },
    );

    const nodes = data.orders.edges.map((edge) => edge.node);
    if (nodes.length > 0) {
      await onPage(nodes);
      total += nodes.length;
    }

    hasNextPage = data.orders.pageInfo.hasNextPage;
    after = data.orders.edges.at(-1)?.cursor;
  }

  return total;
}
