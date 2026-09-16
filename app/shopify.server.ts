import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import db from "./db.server";
import { enqueueShopSync } from "./queue.server";
import { setAppUrl } from "./appConfig.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(db),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    afterAuth: async ({ session }) => {
      const shop = await db.shop.upsert({
        where: { domain: session.shop },
        create: { domain: session.shop },
        update: { uninstalledAt: null },
      });

      await enqueueShopSync({ shopId: shop.id, shopDomain: shop.domain });
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

// This process gets the live tunnel URL from `shopify app dev`; the worker
// process doesn't, so save it to the DB for the worker to read instead.
if (process.env.SHOPIFY_APP_URL) {
  setAppUrl(process.env.SHOPIFY_APP_URL).catch((err) => {
    console.error("Failed to persist app URL:", err);
  });
}

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
