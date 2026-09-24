// app/routes/app.rating-summary-editor.jsx — admin builder for the
// storefront "star rating + review count" summary badge (RatingSummaryTheme).
// Two modes, exactly like app.email-templates.jsx's Normal/Raw-HTML split:
// "Blocks" is a handful of point-and-click controls (colors, size,
// alignment, show/hide the count text) that get compiled into html/css on
// save; "Raw HTML/CSS" hands full control of the markup to the merchant.
// Either way the storefront (apps.reviews.summary.jsx) just renders whatever
// ends up in the saved html/css columns — it doesn't know or care which mode
// produced them.
import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  DEFAULT_RATING_SUMMARY_HTML,
  DEFAULT_RATING_SUMMARY_FIELDS,
  compileRatingSummaryTheme,
  renderRatingSummaryHtml,
  ratingSummaryCss,
} from "../reviewWidget/ratingSummaryTemplate";
import { invalidateShopReviewCache } from "../reviewWidget/reviewCache.server";

const PREVIEW_DATA = { count: 128, average: 4.6 };

const ALIGN_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

function fieldsFromTheme(theme) {
  return {
    starColor: theme?.starColor ?? DEFAULT_RATING_SUMMARY_FIELDS.starColor,
    emptyStarColor: theme?.emptyStarColor ?? DEFAULT_RATING_SUMMARY_FIELDS.emptyStarColor,
    textColor: theme?.textColor ?? DEFAULT_RATING_SUMMARY_FIELDS.textColor,
    fontSize: theme?.fontSize ?? DEFAULT_RATING_SUMMARY_FIELDS.fontSize,
    align: theme?.align ?? DEFAULT_RATING_SUMMARY_FIELDS.align,
    showCount: theme?.showCount ?? DEFAULT_RATING_SUMMARY_FIELDS.showCount,
    countText: theme?.countText ?? DEFAULT_RATING_SUMMARY_FIELDS.countText,
  };
}

function buildState(theme) {
  const fields = fieldsFromTheme(theme);
  return {
    mode: theme?.mode ?? "blocks",
    fields,
    html: theme?.html ?? DEFAULT_RATING_SUMMARY_HTML,
    css: theme?.css ?? ratingSummaryCss(fields),
    isCustom: Boolean(theme),
  };
}

function withPreview(state) {
  try {
    return { ...state, previewHtml: renderRatingSummaryHtml(state.html, PREVIEW_DATA, state.fields.countText), previewError: "" };
  } catch (err) {
    return { ...state, previewHtml: "", previewError: String(err?.message || err) };
  }
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return withPreview(buildState(null));

  const theme = await db.ratingSummaryTheme.findUnique({ where: { shopId: shop.id } });
  return withPreview(buildState(theme));
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { ok: false };

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "reset") {
    await db.ratingSummaryTheme.deleteMany({ where: { shopId: shop.id } });
    await invalidateShopReviewCache(shop.id);
    return { ok: true, intent, ...withPreview(buildState(null)) };
  }

  const mode = formData.get("mode") === "html" ? "html" : "blocks";

  let data;
  if (mode === "html") {
    const html = String(formData.get("html") || "").slice(0, 20000);
    const css = String(formData.get("css") || "").slice(0, 20000);
    const fields = fieldsFromTheme(await db.ratingSummaryTheme.findUnique({ where: { shopId: shop.id } }));
    data = { mode, html, css, ...fields };
  } else {
    const fields = {
      starColor: String(formData.get("starColor") || DEFAULT_RATING_SUMMARY_FIELDS.starColor).slice(0, 40),
      emptyStarColor: String(formData.get("emptyStarColor") || DEFAULT_RATING_SUMMARY_FIELDS.emptyStarColor).slice(0, 40),
      textColor: String(formData.get("textColor") || DEFAULT_RATING_SUMMARY_FIELDS.textColor).slice(0, 40),
      fontSize: Math.min(Math.max(Number(formData.get("fontSize")) || DEFAULT_RATING_SUMMARY_FIELDS.fontSize, 8), 48),
      align: ["left", "center", "right"].includes(formData.get("align")) ? formData.get("align") : "left",
      showCount: formData.get("showCount") === "true",
      countText: String(formData.get("countText") || DEFAULT_RATING_SUMMARY_FIELDS.countText).slice(0, 200),
    };
    const compiled = compileRatingSummaryTheme(fields);
    data = { mode, html: compiled.html, css: compiled.css, ...fields };
  }

  const theme = await db.ratingSummaryTheme.upsert({
    where: { shopId: shop.id },
    create: { shopId: shop.id, ...data },
    update: data,
  });
  await invalidateShopReviewCache(shop.id);

  return { ok: true, intent: "save", ...withPreview(buildState(theme)) };
};

// Plain native <input type="color">/<select>, not Shopify's <s-text-field
// type="color">/<s-select> — same reliability reason app.widget-editor.jsx's
// Field/NativeSelect and app.reviews.jsx's AddReviewForm use native controls
// (see those files' header comments): controlled-value updates on the
// Polaris web components aren't reliable outside the real embedded admin
// runtime this gets previewed in during development.
function ColorField({ label, name, defaultValue }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div>
      <s-text>{label}</s-text>
      <s-stack direction="inline" gap="tight" style={{ alignItems: "center", marginTop: 4 }}>
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => setValue(e.target.value)}
          title={label}
          style={{ width: 36, height: 36, padding: 0, border: "1px solid #ccc", borderRadius: 6, cursor: "pointer", background: "none", flexShrink: 0 }}
        />
        <input type="text" name={name} value={value} onChange={(e) => setValue(e.target.value)} style={{ flex: 1, padding: "6px 8px" }} />
      </s-stack>
    </div>
  );
}

function BlocksForm({ state, fetcher }) {
  const fields = state.fields;
  return (
    <fetcher.Form method="POST">
      <input type="hidden" name="mode" value="blocks" />
      <s-stack direction="block" gap="base">
        <s-stack direction="inline" gap="base">
          <ColorField label="Star color" name="starColor" defaultValue={fields.starColor} />
          <ColorField label="Empty star color" name="emptyStarColor" defaultValue={fields.emptyStarColor} />
          <ColorField label="Text color" name="textColor" defaultValue={fields.textColor} />
        </s-stack>
        <s-stack direction="inline" gap="base">
          <s-number-field label="Text size (px)" name="fontSize" min={8} max={48} defaultValue={fields.fontSize}></s-number-field>
          <div>
            <s-text>Alignment</s-text>
            <div>
              <select name="align" defaultValue={fields.align} style={{ padding: "6px 8px", marginTop: 4 }}>
                {ALIGN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </s-stack>
        <s-switch label="Show review count text" name="showCount" value="true" defaultChecked={fields.showCount}></s-switch>
        <s-text-field
          label="Count text"
          name="countText"
          defaultValue={fields.countText}
          details="Tokens: {{count}}, {{reviewWord}}, {{averageValue}}"
        ></s-text-field>
        <s-stack direction="inline" gap="tight">
          <s-button type="submit" variant="primary">Save</s-button>
          {state.isCustom ? (
            <s-button
              type="submit"
              name="intent"
              value="reset"
              onClick={(e) => {
                if (!confirm("Reset the rating summary badge to default?")) e.preventDefault();
              }}
            >
              Reset to default
            </s-button>
          ) : null}
        </s-stack>
      </s-stack>
    </fetcher.Form>
  );
}

function RawForm({ state, fetcher }) {
  return (
    <fetcher.Form method="POST">
      <input type="hidden" name="mode" value="html" />
      <s-stack direction="block" gap="base">
        <s-paragraph>
          Tokens: <code>{"{{averageStars}} {{averageValue}} {{count}} {{reviewWord}} {{countText}}"}</code>.
          Stars render as <code>{"<span class=\"jm-rating-summary__star--filled|empty\">"}</code> so filled/empty
          can be colored separately in CSS.
        </s-paragraph>
        <s-text-area label="HTML" name="html" rows={8} defaultValue={state.html}></s-text-area>
        <s-text-area label="CSS" name="css" rows={12} defaultValue={state.css}></s-text-area>
        <s-stack direction="inline" gap="tight">
          <s-button type="submit" variant="primary">Save</s-button>
          {state.isCustom ? (
            <s-button
              type="submit"
              name="intent"
              value="reset"
              onClick={(e) => {
                if (!confirm("Reset the rating summary badge to default?")) e.preventDefault();
              }}
            >
              Reset to default
            </s-button>
          ) : null}
        </s-stack>
      </s-stack>
    </fetcher.Form>
  );
}

export default function RatingSummaryEditor() {
  const loaderData = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [mode, setMode] = useState(loaderData.mode);

  if (fetcher.data?.ok && fetcher.data.intent === "save") shopify.toast.show("Rating summary badge saved");
  if (fetcher.data?.ok && fetcher.data.intent === "reset") shopify.toast.show("Rating summary badge reset to default");

  const state = fetcher.data?.ok ? fetcher.data : loaderData;

  return (
    <s-page heading="Rating summary badge">
      <s-section heading="Star + review count badge">
        <s-paragraph>
          A compact &quot;★★★★☆ (128 reviews)&quot; badge for anywhere a merchant wants
          just the rating at a glance — collection grids, cart, headers —
          separate from the full review list widget. Add the{" "}
          <strong>Rating summary</strong> block to any section in the Theme
          Editor to place it.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-text>Editor:</s-text>
          <s-stack direction="inline" gap="tight">
            <s-button variant={mode === "blocks" ? "primary" : "tertiary"} onClick={() => setMode("blocks")}>
              Blocks
            </s-button>
            <s-button variant={mode === "html" ? "primary" : "tertiary"} onClick={() => setMode("html")}>
              Raw HTML/CSS
            </s-button>
          </s-stack>
        </s-stack>

        {mode === "blocks" ? <BlocksForm state={state} fetcher={fetcher} /> : <RawForm state={state} fetcher={fetcher} />}
      </s-section>

      <s-section heading="Preview">
        {state.previewError ? (
          <s-banner tone="critical">{state.previewError}</s-banner>
        ) : (
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
            <style>{state.css}</style>
            <div dangerouslySetInnerHTML={{ __html: state.previewHtml }} />
          </div>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
