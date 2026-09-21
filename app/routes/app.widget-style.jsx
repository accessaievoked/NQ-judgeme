// app/routes/app.widget-style.jsx — raw HTML/CSS "coder mode" for the
// storefront review widget (WidgetTheme), for merchants who want full
// control of the template. Point-and-click styling (including the style
// blocks this page used to let you build with dropdowns) now lives in the
// visual editor at /app/widget-editor — this page just edits the underlying
// template those blocks compile onto, plus a preview of the saved result.
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { DEFAULT_WIDGET_HTML, DEFAULT_WIDGET_CSS } from "../reviewWidget/defaults.server";
import { renderWidgetHtml } from "../reviewWidget/render.server";
import { compileStyleBlocks } from "../reviewWidget/styleBlocks.server";
import { invalidateShopReviewCache } from "../reviewWidget/reviewCache.server";

const PREVIEW_DATA = {
  count: 2,
  average: 4.5,
  reviews: [
    { rating: 5, title: "Love it", body: "Exactly what I needed.", authorName: "Jordan", customer: null },
    { rating: 4, title: "Pretty good", body: "Would buy again.", authorName: null, customer: { firstName: "Sam", lastName: "R." } },
  ],
};

function buildState(theme) {
  return {
    html: theme?.html ?? DEFAULT_WIDGET_HTML,
    css: theme?.css ?? DEFAULT_WIDGET_CSS,
    styleBlocks: Array.isArray(theme?.styleBlocks) ? theme.styleBlocks : [],
    isCustom: Boolean(theme),
  };
}

function withPreview(state) {
  try {
    const previewCss = [state.css, compileStyleBlocks(state.styleBlocks)].filter(Boolean).join("\n\n");
    return { ...state, previewHtml: renderWidgetHtml(state.html, PREVIEW_DATA), previewCss, previewError: "" };
  } catch (err) {
    return { ...state, previewHtml: "", previewCss: state.css, previewError: String(err?.message || err) };
  }
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return withPreview(buildState(null));

  const theme = await db.widgetTheme.findUnique({ where: { shopId: shop.id } });
  return withPreview(buildState(theme));
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { ok: false };

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "reset") {
    await db.widgetTheme.deleteMany({ where: { shopId: shop.id } });
    await invalidateShopReviewCache(shop.id);
    return { ok: true, intent, ...withPreview(buildState(null)) };
  }

  const html = String(formData.get("html") || "").slice(0, 20000);
  const css = String(formData.get("css") || "").slice(0, 20000);

  const theme = await db.widgetTheme.upsert({
    where: { shopId: shop.id },
    create: { shopId: shop.id, html, css },
    update: { html, css },
  });
  await invalidateShopReviewCache(shop.id);

  return { ok: true, intent: "save", ...withPreview(buildState(theme)) };
};

function TemplateForm({ state }) {
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  if (fetcher.data?.ok && fetcher.data.intent === "save") shopify.toast.show("Widget style saved");
  if (fetcher.data?.ok && fetcher.data.intent === "reset") shopify.toast.show("Widget style reset to default");

  const html = fetcher.data?.html ?? state.html;
  const css = fetcher.data?.css ?? state.css;
  const isCustom = fetcher.data ? fetcher.data.isCustom : state.isCustom;

  return (
    <s-section heading="Template (raw HTML/CSS)">
      <s-paragraph>
        Full control of the widget's markup. <code>{"<!--ITEM--> <!--/ITEM-->"}</code>{" "}
        marks the per-review block, <code>{"<!--EMPTY--> <!--/EMPTY-->"}</code>{" "}
        the no-reviews state. Tokens: <code>{"{{stars}} {{title}} {{body}} {{author}}"}</code>{" "}
        inside an item, <code>{"{{averageStars}} {{averageValue}} {{count}} {{reviewWord}}"}</code>{" "}
        outside it, <code>{"{{rateWidget}}"}</code> anywhere. Prefer clicking
        and styling instead? Use the{" "}
        <s-link href="/app/widget-editor">visual widget builder</s-link>.
      </s-paragraph>

      <fetcher.Form method="POST">
        <input type="hidden" name="intent" value="save" />
        <s-stack direction="block" gap="base">
          <s-text-area label="HTML" name="html" rows={16} defaultValue={html}></s-text-area>
          <s-text-area label="CSS" name="css" rows={12} defaultValue={css}></s-text-area>

          <s-stack direction="inline" gap="tight">
            <s-button type="submit" variant="primary">Save</s-button>
            {isCustom ? (
              <s-button
                type="submit"
                name="intent"
                value="reset"
                onClick={(e) => {
                  if (!confirm("Reset to the default widget style? This also clears any style blocks.")) e.preventDefault();
                }}
              >
                Reset to default
              </s-button>
            ) : null}
          </s-stack>
        </s-stack>
      </fetcher.Form>
    </s-section>
  );
}

export default function WidgetStyle() {
  const loaderData = useLoaderData();

  return (
    <s-page heading="Widget style">
      <TemplateForm state={loaderData} />

      <s-section heading="Preview">
        <s-paragraph>
          Rendered with sample review data, including any styling saved from
          the visual widget builder. Reflects the last <em>saved</em>{" "}
          template, not unsaved edits above.
        </s-paragraph>
        {loaderData.previewError ? (
          <s-banner tone="critical">{loaderData.previewError}</s-banner>
        ) : (
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
            <style>{loaderData.previewCss}</style>
            <div className="jm-reviews" dangerouslySetInnerHTML={{ __html: loaderData.previewHtml }} />
          </div>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
