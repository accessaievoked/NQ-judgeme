// app/routes/app.settings.jsx
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { enqueueShopSync } from "../queue.server";

// Default rules seeded for a new shop. Add more trigger types here as more
// webhooks get wired up (matching shopify.app.toml subscriptions).
const DEFAULT_RULES = [
  { triggerType: "orders/paid", label: "On order paid", delayDays: 0, enabled: false },
  { triggerType: "orders/fulfilled", label: "On order fulfilled", delayDays: 14, enabled: true },
];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });

  if (!shop) {
    return { rules: [], products: [], syncStatus: null };
  }

  await db.shopSettings.upsert({
    where: { shopId: shop.id },
    create: { shopId: shop.id },
    update: {},
  });

  for (const defaults of DEFAULT_RULES) {
    await db.scheduleRule.upsert({
      where: { shopId_triggerType: { shopId: shop.id, triggerType: defaults.triggerType } },
      create: { shopId: shop.id, triggerType: defaults.triggerType, delayDays: defaults.delayDays, enabled: defaults.enabled },
      update: {},
    });
  }

  // Re-queue a catalog sync on every page load; stable jobId means this
  // never piles up while one's already running.
  try {
    await enqueueShopSync({ shopId: shop.id, shopDomain: shop.domain });
  } catch {
    // best-effort
  }

  const [rules, products] = await Promise.all([
    db.scheduleRule.findMany({ where: { shopId: shop.id } }),
    db.product.findMany({
      where: { shopId: shop.id },
      orderBy: { title: "asc" },
      include: {
        _count: { select: { variants: true, reviewRequests: true, reviews: true } },
        reviews: { where: { status: "PUBLISHED" }, select: { rating: true } },
      },
    }),
  ]);

  return {
    rules: DEFAULT_RULES.map((defaults) => {
      const rule = rules.find((r) => r.triggerType === defaults.triggerType);
      return { ...defaults, ...rule };
    }),
    products: products.map((product) => {
      const ratings = product.reviews.map((r) => r.rating);
      const avgRating = ratings.length
        ? (ratings.reduce((sum, r) => sum + r, 0) / ratings.length).toFixed(1)
        : null;
      return {
        id: product.id,
        title: product.title,
        imageUrl: product.imageUrl,
        status: product.status,
        variantCount: product._count.variants,
        requestCount: product._count.reviewRequests,
        reviewCount: product._count.reviews,
        avgRating,
      };
    }),
    syncStatus: {
      catalogSyncStatus: shop.catalogSyncStatus,
      catalogSyncedAt: shop.catalogSyncedAt,
    },
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { ok: false, error: "Shop not found yet" };

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "sync-now") {
    await enqueueShopSync({ shopId: shop.id, shopDomain: shop.domain });
    return { ok: true, intent };
  }

  if (intent === "save-rule") {
    const triggerType = String(formData.get("triggerType"));
    const enabled = formData.get("enabled") === "on";
    const delayDays = Math.max(0, Number(formData.get("delayDays")) || 0);

    await db.scheduleRule.upsert({
      where: { shopId_triggerType: { shopId: shop.id, triggerType } },
      create: { shopId: shop.id, triggerType, enabled, delayDays },
      update: { enabled, delayDays },
    });
    return { ok: true, intent, triggerType };
  }

  return { ok: false, error: "Unknown action" };
};

function RuleRow({ rule }) {
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  if (fetcher.data?.ok && fetcher.data.intent === "save-rule" && fetcher.data.triggerType === rule.triggerType) {
    shopify.toast.show(`${rule.label} saved`);
  }

  return (
    <fetcher.Form method="POST">
      <input type="hidden" name="intent" value="save-rule" />
      <input type="hidden" name="triggerType" value={rule.triggerType} />
      <s-stack direction="inline" gap="base">
        <s-switch label={rule.label} name="enabled" defaultChecked={rule.enabled}></s-switch>
        <s-number-field
          label="Days after trigger (0 = immediately)"
          name="delayDays"
          defaultValue={rule.delayDays}
          min={0}
        ></s-number-field>
        <s-button type="submit">Save</s-button>
      </s-stack>
    </fetcher.Form>
  );
}

export default function Settings() {
  const { rules, products, syncStatus } = useLoaderData();
  const syncFetcher = useFetcher();
  const shopify = useAppBridge();

  if (syncFetcher.data?.ok && syncFetcher.data.intent === "sync-now") {
    shopify.toast.show("Sync queued — refresh in a moment");
  }

  return (
    <s-page heading="Settings">
      <s-section heading="Request scheduling">
        <s-paragraph>
          One rule per Shopify event. 0 days sends as soon as the event
          fires — handy for testing.
        </s-paragraph>
        <s-stack direction="block" gap="base">
          {rules.map((rule) => (
            <RuleRow key={rule.triggerType} rule={rule} />
          ))}
        </s-stack>
      </s-section>

      <s-section heading="Product management">
        <s-stack direction="inline" gap="base">
          <s-paragraph>
            Products sync from Shopify automatically on load. Sync now if a
            change isn't showing up yet.
          </s-paragraph>
          <syncFetcher.Form method="POST">
            <input type="hidden" name="intent" value="sync-now" />
            <s-button type="submit">Sync now</s-button>
          </syncFetcher.Form>
        </s-stack>

        {syncStatus ? (
          <s-text>
            Catalog: {syncStatus.catalogSyncStatus}
            {syncStatus.catalogSyncedAt ? ` — last synced ${new Date(syncStatus.catalogSyncedAt).toLocaleString()}` : ""}
          </s-text>
        ) : null}

        {products.length === 0 ? (
          <s-paragraph>No products synced yet.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header listSlot="secondary">Status</s-table-header>
              <s-table-header listSlot="secondary">Variants</s-table-header>
              <s-table-header listSlot="secondary">Av. rating</s-table-header>
              <s-table-header listSlot="secondary">Reviews</s-table-header>
              <s-table-header listSlot="secondary">Requests</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {products.map((product) => (
                <s-table-row key={product.id}>
                  <s-table-cell>
                    <s-stack direction="inline" gap="tight">
                      {product.imageUrl ? (
                        <s-thumbnail src={product.imageUrl} alt={product.title} size="small" />
                      ) : null}
                      <s-link href={`/app/products/${product.id}`}>{product.title}</s-link>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{product.status ?? "—"}</s-table-cell>
                  <s-table-cell>{product.variantCount}</s-table-cell>
                  <s-table-cell>{product.avgRating ?? "None"}</s-table-cell>
                  <s-table-cell>{product.reviewCount || "None"}</s-table-cell>
                  <s-table-cell>{product.requestCount}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
