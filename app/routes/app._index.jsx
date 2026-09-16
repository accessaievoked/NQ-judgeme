// app/routes/app._index.jsx
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });

  if (!shop) {
    return { shop: null, counts: null };
  }

  const [productCount, orderCount, customerCount] = await Promise.all([
    db.product.count({ where: { shopId: shop.id } }),
    db.order.count({ where: { shopId: shop.id } }),
    db.customer.count({ where: { shopId: shop.id } }),
  ]);

  return {
    shop: {
      catalogSyncStatus: shop.catalogSyncStatus,
      orderSyncStatus: shop.orderSyncStatus,
      catalogSyncedAt: shop.catalogSyncedAt,
      orderSyncedAt: shop.orderSyncedAt,
      syncError: shop.syncError,
    },
    counts: { productCount, orderCount, customerCount },
  };
};

const STATUS_TONE = {
  PENDING: undefined,
  RUNNING: "info",
  COMPLETE: "success",
  FAILED: "critical",
};

const STATUS_LABEL = {
  PENDING: "Queued",
  RUNNING: "Syncing…",
  COMPLETE: "Synced",
  FAILED: "Failed",
};

function SyncStatusSection({ shop, counts }) {
  if (!shop) {
    return (
      <s-section heading="Store sync">
        <s-paragraph>
          Waiting for installation to finish setting up your shop record.
        </s-paragraph>
      </s-section>
    );
  }

  return (
    <s-section heading="Store sync">
      <s-stack direction="inline" gap="base">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="tight">
            <s-text>Catalog</s-text>
            <s-badge tone={STATUS_TONE[shop.catalogSyncStatus]}>
              {STATUS_LABEL[shop.catalogSyncStatus]}
            </s-badge>
            <s-text>{counts?.productCount ?? 0} products synced</s-text>
          </s-stack>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="tight">
            <s-text>Orders (last 60 days)</s-text>
            <s-badge tone={STATUS_TONE[shop.orderSyncStatus]}>
              {STATUS_LABEL[shop.orderSyncStatus]}
            </s-badge>
            <s-text>{counts?.orderCount ?? 0} orders synced</s-text>
          </s-stack>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="tight">
            <s-text>Customers</s-text>
            <s-text>{counts?.customerCount ?? 0} synced</s-text>
          </s-stack>
        </s-box>
      </s-stack>

      {shop.syncError ? (
        <s-banner tone="critical" heading="Last sync error">
          <s-paragraph>{shop.syncError}</s-paragraph>
        </s-banner>
      ) : null}
    </s-section>
  );
}

export default function Index() {
  const { shop, counts } = useLoaderData();

  return (
    <s-page heading="Judge.me Reviews">
      <s-badge tone="success">Free Plan</s-badge>
      <s-badge tone="info">15-day free trial available</s-badge>

      <s-button slot="secondary-actions">Request improvements</s-button>

      <SyncStatusSection shop={shop} counts={counts} />

      <s-section>
        <s-stack direction="inline" gap="tight">
          <s-text>2 of 6 tasks complete</s-text>
        </s-stack>
        <s-heading>Setup guide</s-heading>
        <s-paragraph>Welcome to Judge.me. Let's get your store up and running.</s-paragraph>

        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="tight">
            <s-badge tone="success">✓</s-badge>
            <s-text>Enable Judge.me on your store</s-text>
          </s-stack>

          <s-stack direction="inline" gap="tight">
            <s-badge tone="success">✓</s-badge>
            <s-text>Enable Reviews Widget</s-text>
          </s-stack>

          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="tight">
              <s-text>Customize the review widget</s-text>
              <s-paragraph>Change the look and feel of your review display to match your brand.</s-paragraph>
              <s-button variant="primary">Go to Widget settings</s-button>
            </s-stack>
          </s-box>

          <s-stack direction="inline" gap="tight">
            <s-badge>○</s-badge>
            <s-text>Add store logo and check email styling</s-text>
          </s-stack>

          <s-stack direction="inline" gap="tight">
            <s-badge>○</s-badge>
            <s-text>Grab your free Judge.me Awesome trial</s-text>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section>
        <s-stack direction="inline" gap="base">
          <s-heading>Welcome to Judge.me</s-heading>
        </s-stack>

        <s-stack direction="inline" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text>Reviews</s-text>
              <s-heading>0 — 0%</s-heading>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text>Average rating</s-text>
              <s-heading>0 — 0%</s-heading>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text>Requests sent</s-text>
              <s-heading>0 — 0%</s-heading>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text>Revenue from</s-text>
              <s-heading>$0 — 0%</s-heading>
            </s-stack>
          </s-box>
        </s-stack>

        <s-stack direction="inline" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text>Tasks</s-text>
              <s-badge tone="success">You're all caught up!</s-badge>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text>Widgets</s-text>
              <s-badge tone="success">Embed enabled</s-badge>
              <s-badge tone="success">1 active</s-badge>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text>Requests</s-text>
              <s-badge tone="success">Requests enabled</s-badge>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};