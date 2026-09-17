// app/routes/app.settings.jsx
import { useEffect, useRef, useState } from "react";
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
    return { rules: [], products: [], syncStatus: null, reviewSettings: null };
  }

  const shopSettings = await db.shopSettings.upsert({
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
    reviewSettings: {
      autoPublishEnabled: shopSettings.autoPublishEnabled,
      autoPublishMinRating: shopSettings.autoPublishMinRating,
    },
    reminderDays: shopSettings.reminderDays,
    discountSettings: {
      reviewDiscountEnabled: shopSettings.reviewDiscountEnabled,
      reviewDiscountPercentage: shopSettings.reviewDiscountPercentage,
      reviewDiscountExpiryDays: shopSettings.reviewDiscountExpiryDays,
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

  if (intent === "save-review-settings") {
    const autoPublishEnabled = formData.get("autoPublishEnabled") === "on";
    const autoPublishMinRating = Math.min(5, Math.max(1, Number(formData.get("autoPublishMinRating")) || 4));

    await db.shopSettings.upsert({
      where: { shopId: shop.id },
      create: { shopId: shop.id, autoPublishEnabled, autoPublishMinRating },
      update: { autoPublishEnabled, autoPublishMinRating },
    });
    return { ok: true, intent };
  }

  if (intent === "save-reminders") {
    // Blank/0 slots are dropped, not kept as 0 — a reminder step can't fire
    // same-day (that's what the original request email is for). Capped to
    // 3 steps total to keep this from turning into spam.
    const reminderDays = ["reminderDay1", "reminderDay2", "reminderDay3"]
      .map((key) => Number(formData.get(key)))
      .filter((n) => Number.isInteger(n) && n >= 1)
      .slice(0, 3);

    await db.shopSettings.upsert({
      where: { shopId: shop.id },
      create: { shopId: shop.id, reminderDays },
      update: { reminderDays },
    });
    return { ok: true, intent, reminderDays };
  }

  if (intent === "save-discount") {
    const reviewDiscountEnabled = formData.get("reviewDiscountEnabled") === "on";
    const reviewDiscountPercentage = Math.min(100, Math.max(1, Number(formData.get("reviewDiscountPercentage")) || 10));
    const reviewDiscountExpiryDays = Math.max(1, Number(formData.get("reviewDiscountExpiryDays")) || 30);

    await db.shopSettings.upsert({
      where: { shopId: shop.id },
      create: { shopId: shop.id, reviewDiscountEnabled, reviewDiscountPercentage, reviewDiscountExpiryDays },
      update: { reviewDiscountEnabled, reviewDiscountPercentage, reviewDiscountExpiryDays },
    });
    return { ok: true, intent };
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

function ReviewSettingsSection({ reviewSettings }) {
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  if (fetcher.data?.ok && fetcher.data.intent === "save-review-settings") {
    shopify.toast.show("Review moderation settings saved");
  }

  return (
    <s-section heading="Review moderation">
      <s-paragraph>
        By default every submitted review sits in the Reviews queue as
        Pending until you publish it. Turn this on to skip that queue for
        high-rated reviews.
      </s-paragraph>
      <fetcher.Form method="POST">
        <input type="hidden" name="intent" value="save-review-settings" />
        <s-stack direction="inline" gap="base">
          <s-switch
            label="Auto-publish high-rated reviews"
            name="autoPublishEnabled"
            defaultChecked={reviewSettings.autoPublishEnabled}
          ></s-switch>
          <s-number-field
            label="Minimum star rating to auto-publish"
            name="autoPublishMinRating"
            defaultValue={reviewSettings.autoPublishMinRating}
            min={1}
            max={5}
          ></s-number-field>
          <s-button type="submit">Save</s-button>
        </s-stack>
      </fetcher.Form>
    </s-section>
  );
}

const MAX_REMINDERS = 3;

// A dynamic "add a block, set its days, remove it" list rather than a fixed
// form — vendor decides how many reminder steps to chain (up to 3) and how
// many days after the previous step each one waits.
function ReminderSettingsSection({ reminderDays }) {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [steps, setSteps] = useState(reminderDays.length ? reminderDays : []);
  // How many steps were on the form at submit time, so we can tell after
  // the fact whether the server dropped any (0/blank days) and say so.
  const submittedCountRef = useRef(0);
  const [droppedCount, setDroppedCount] = useState(0);

  useEffect(() => {
    if (fetcher.data?.ok && fetcher.data.intent === "save-reminders") {
      const saved = fetcher.data.reminderDays;
      const dropped = submittedCountRef.current - saved.length;
      setSteps(saved);
      if (dropped > 0) {
        setDroppedCount(dropped);
        shopify.toast.show(
          `Saved, but ${dropped} reminder${dropped === 1 ? "" : "s"} left at 0 days ${dropped === 1 ? "was" : "were"} dropped`,
          { isError: true },
        );
      } else {
        setDroppedCount(0);
        shopify.toast.show("Reminder schedule saved");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  const addStep = () => setSteps((s) => [...s, 3]);
  const removeStep = (index) => setSteps((s) => s.filter((_, i) => i !== index));

  return (
    <s-section heading="Review reminders">
      <s-paragraph>
        If a customer hasn&apos;t left a review yet, remind them by email. Each
        block waits the given number of days after the *previous* step (the
        first waits that many days after the original request email), then
        sends another reminder. Stops the moment they actually review — up
        to {MAX_REMINDERS} reminders, to keep it from turning into spam.
      </s-paragraph>
      <s-paragraph color="subdued">
        Days must be at least 1 — a block left at 0 (or emptied out) won&apos;t
        be saved.
      </s-paragraph>
      {droppedCount > 0 ? (
        <s-banner tone="warning">
          {droppedCount} reminder{droppedCount === 1 ? "" : "s"} weren&apos;t saved because {droppedCount === 1 ? "its days field was" : "their days fields were"} 0 or blank.
        </s-banner>
      ) : null}

      <fetcher.Form
        method="POST"
        onSubmit={() => {
          submittedCountRef.current = steps.length;
        }}
      >
        <input type="hidden" name="intent" value="save-reminders" />
        <s-stack direction="block" gap="base">
          {steps.map((days, index) => (
            <s-stack key={index} direction="inline" gap="tight">
              <s-text>Reminder {index + 1} — wait</s-text>
              <s-number-field
                label="Days"
                labelAccessibilityVisibility="exclusive"
                name={`reminderDay${index + 1}`}
                defaultValue={days}
                min={1}
              ></s-number-field>
              <s-text>days, then send</s-text>
              <s-button variant="tertiary" onClick={() => removeStep(index)}>Remove</s-button>
            </s-stack>
          ))}

          {steps.length === 0 ? (
            <s-paragraph>No reminders configured — customers only get the original request.</s-paragraph>
          ) : null}

          <s-stack direction="inline" gap="tight">
            {steps.length < MAX_REMINDERS ? (
              <s-button onClick={addStep}>+ Add reminder block</s-button>
            ) : null}
            <s-button type="submit" variant="primary">Save</s-button>
          </s-stack>
        </s-stack>
      </fetcher.Form>
    </s-section>
  );
}

function DiscountSettingsSection({ discountSettings }) {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [enabled, setEnabled] = useState(discountSettings.reviewDiscountEnabled);

  if (fetcher.data?.ok && fetcher.data.intent === "save-discount") {
    shopify.toast.show("Review discount settings saved");
  }

  return (
    <s-section heading="Review discount">
      <s-paragraph>
        Optionally thank customers for reviewing with a one-time discount
        code, emailed alongside the thank-you note. It&apos;s a single-use code
        (one redemption total, once per customer) generated fresh per
        review — off by default.
      </s-paragraph>
      <fetcher.Form method="POST">
        <input type="hidden" name="intent" value="save-discount" />
        <s-stack direction="block" gap="base">
          <s-switch
            label="Send a discount code for reviews"
            name="reviewDiscountEnabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          ></s-switch>

          {enabled ? (
            <s-stack direction="inline" gap="base">
              <s-number-field
                label="Percent off"
                name="reviewDiscountPercentage"
                defaultValue={discountSettings.reviewDiscountPercentage}
                min={1}
                max={100}
              ></s-number-field>
              <s-number-field
                label="Valid for (days)"
                name="reviewDiscountExpiryDays"
                defaultValue={discountSettings.reviewDiscountExpiryDays}
                min={1}
              ></s-number-field>
            </s-stack>
          ) : null}

          <s-button type="submit" variant="primary">Save</s-button>
        </s-stack>
      </fetcher.Form>
    </s-section>
  );
}

export default function Settings() {
  const { rules, products, syncStatus, reviewSettings, reminderDays, discountSettings } = useLoaderData();
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

      {reviewSettings ? <ReviewSettingsSection reviewSettings={reviewSettings} /> : null}

      <ReminderSettingsSection reminderDays={reminderDays ?? []} />

      {discountSettings ? <DiscountSettingsSection discountSettings={discountSettings} /> : null}

      <s-section heading="Product management">
        <s-stack direction="inline" gap="base">
          <s-paragraph>
            Products sync from Shopify automatically on load. Sync now if a
            change isn&apos;t showing up yet.
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
