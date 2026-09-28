// app/routes/app.review-all-style.jsx — raw HTML/CSS "coder mode" for the
// paginated/searchable "all reviews" page (AllReviewsTheme), for merchants
// who want full control of the template. Point-and-click styling lives in
// the visual editor at /app/review-all-editor — this page just edits the
// underlying template those blocks compile onto, plus a preview of the
// saved result. Exact mirror of app.review-form-style.jsx's split from
// app.review-form-editor.jsx, just for AllReviewsTheme/the all-reviews page
// instead of ReviewFormTheme/the write-a-review page.
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { DEFAULT_ALL_REVIEWS_HTML, renderAllReviewsHtml } from "../reviewWidget/allReviewsTemplate";
import { ALL_REVIEWS_DEFAULT_CSS } from "../reviewWidget/sections/allReviewsPage";
import { compileAllReviewsStyleBlocks } from "../reviewWidget/allReviewsStyleCompiler";
import { invalidateShopReviewCache } from "../reviewWidget/reviewCache.server";

const PREVIEW_DATA = {
  productTitle: "Sample Product",
  count: 2,
  q: "",
  productId: "123456",
  paginationHtml: `<nav class="jm-reviews-page__pagination" aria-label="Reviews pages"><span class="jm-reviews-page__num is-current">1</span><a class="jm-reviews-page__num" href="#">2</a><a class="jm-reviews-page__nav" href="#">Next ›</a></nav>`,
  reviews: [
    { rating: 5, title: "Love it", body: "Exactly what I needed.", authorName: "Jordan", customer: null, createdAt: new Date() },
    { rating: 4, title: "Pretty good", body: "Would buy again.", authorName: null, customer: { firstName: "Sam", lastName: "R." }, createdAt: new Date() },
  ],
};

function buildState(theme) {
  return {
    html: theme?.html ?? DEFAULT_ALL_REVIEWS_HTML,
    css: theme?.css ?? ALL_REVIEWS_DEFAULT_CSS,
    styleBlocks: Array.isArray(theme?.styleBlocks) ? theme.styleBlocks : [],
    isCustom: Boolean(theme),
  };
}

function withPreview(state) {
  try {
    const previewCss = [state.css, compileAllReviewsStyleBlocks(state.styleBlocks)].filter(Boolean).join("\n\n");
    return { ...state, previewHtml: renderAllReviewsHtml(state.html, PREVIEW_DATA), previewCss, previewError: "" };
  } catch (err) {
    return { ...state, previewHtml: "", previewCss: state.css, previewError: String(err?.message || err) };
  }
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return withPreview(buildState(null));

  const theme = await db.allReviewsTheme.findUnique({ where: { shopId: shop.id } });
  return withPreview(buildState(theme));
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { ok: false };

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "reset") {
    await db.allReviewsTheme.deleteMany({ where: { shopId: shop.id } });
    await invalidateShopReviewCache(shop.id);
    return { ok: true, intent, ...withPreview(buildState(null)) };
  }

  const html = String(formData.get("html") || "").slice(0, 20000);
  const css = String(formData.get("css") || "").slice(0, 20000);

  const theme = await db.allReviewsTheme.upsert({
    where: { shopId: shop.id },
    create: { shopId: shop.id, html, css, styleBlocks: [] },
    update: { html, css },
  });
  await invalidateShopReviewCache(shop.id);

  return { ok: true, intent: "save", ...withPreview(buildState(theme)) };
};

function TemplateForm({ state }) {
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  if (fetcher.data?.ok && fetcher.data.intent === "save") shopify.toast.show("All reviews page template saved");
  if (fetcher.data?.ok && fetcher.data.intent === "reset") shopify.toast.show("All reviews page reset to default");

  const html = fetcher.data?.html ?? state.html;
  const css = fetcher.data?.css ?? state.css;
  const isCustom = fetcher.data ? fetcher.data.isCustom : state.isCustom;

  return (
    <s-section heading="Template (raw HTML/CSS)">
      <s-paragraph>
        Full control of the page&apos;s markup. <code>{"<!--ITEM--> <!--/ITEM-->"}</code>{" "}
        marks the per-review block, <code>{"<!--EMPTY--> <!--/EMPTY-->"}</code>{" "}
        the no-results state. Tokens: <code>{"{{stars}} {{title}} {{body}} {{author}} {{avatar}} {{verified}} {{date}}"}</code>{" "}
        inside an item, <code>{"{{heading}} {{count}} {{reviewWord}} {{searchQuerySuffix}} {{searchQuery}} {{productId}} {{pagination}}"}</code>{" "}
        outside it. Keep <code>data-jm-reviews-all-search</code> on the search{" "}
        <code>form</code> intact — the fetch-based search behavior is wired up by
        that fixed name, not by a token. Prefer clicking and styling instead?
        Use the <s-link href="/app/review-all-editor">visual all-reviews builder</s-link>.
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
                  if (!confirm("Reset to the default all-reviews page? This also clears any style blocks.")) e.preventDefault();
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

export default function ReviewAllStyle() {
  const loaderData = useLoaderData();

  return (
    <s-page heading="All reviews page template">
      <TemplateForm state={loaderData} />

      <s-section heading="Preview">
        <s-paragraph>
          Rendered with sample reviews, including any styling saved from the
          visual all-reviews builder. Reflects the last <em>saved</em>{" "}
          template, not unsaved edits above.
        </s-paragraph>
        {loaderData.previewError ? (
          <s-banner tone="critical">{loaderData.previewError}</s-banner>
        ) : (
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
            <style>{loaderData.previewCss}</style>
            <div dangerouslySetInnerHTML={{ __html: loaderData.previewHtml }} />
          </div>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
