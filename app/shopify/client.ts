import { unauthenticated } from "../shopify.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

export class ShopifyGraphqlError extends Error {
  errors: unknown;

  constructor(message: string, errors: unknown) {
    super(message);
    this.name = "ShopifyGraphqlError";
    this.errors = errors;
  }
}

/**
 * Runs a callback with an authenticated Admin API context for a shop, outside
 * of an HTTP request (background jobs, workers). Resolves the shop's offline
 * access token via the same session storage the OAuth flow already writes to.
 */
export async function withShopAdmin<T>(
  shopDomain: string,
  fn: (admin: AdminApiContext) => Promise<T>,
): Promise<T> {
  const { admin } = await unauthenticated.admin(shopDomain);
  return fn(admin);
}

/**
 * Runs a single GraphQL query/mutation against a shop's Admin API and returns
 * its `data`. Retries automatically on throttling (handled by the underlying
 * Shopify client via `tries`). Throws `ShopifyGraphqlError` on GraphQL-level
 * errors (the HTTP-level `GraphqlQueryError` from `admin.graphql` propagates
 * as-is).
 */
export async function shopifyGraphql<T = unknown>(
  shopDomain: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  return withShopAdmin(shopDomain, async (admin) => {
    const response = await admin.graphql(query, {
      variables,
      tries: 3,
    });
    const body = (await response.json()) as { data?: T; errors?: unknown };

    if (body.errors) {
      throw new ShopifyGraphqlError(
        "Shopify GraphQL request returned errors",
        body.errors,
      );
    }
    if (!body.data) {
      throw new ShopifyGraphqlError(
        "Shopify GraphQL request returned no data",
        body,
      );
    }
    return body.data;
  });
}
