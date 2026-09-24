// app/routes/app.review-form-style.jsx — raw HTML/CSS "coder mode" for the
// "write a review" form page (ReviewFormTheme), for merchants who want full
// control of the template. Point-and-click styling (including the style
// blocks this page used to let you build with dropdowns, before it was split
// out) now lives in the visual editor at /app/review-form-editor — this page
// just edits the underlying template those blocks compile onto, plus a
// preview of the saved result. Exact mirror of app.widget-style.jsx's split
// from app.widget-editor.jsx, just for ReviewFormTheme/writeForm instead of
// WidgetTheme/the review-list widget.
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { DEFAULT_REVIEW_FORM_HTML, renderReviewFormHtml } from "../reviewWidget/reviewFormTemplate";
import { WRITE_FORM_DEFAULT_CSS as DEFAULT_REVIEW_FORM_CSS } from "../reviewWidget/sections/writeForm";
import { compileReviewFormStyleBlocks } from "../reviewWidget/reviewFormStyleCompiler";

const PREVIEW_DATA = { productTitle: "Sample Product", productImageUrl: null };

function buildState(theme) {
  return {
    html: theme?.html ?? DEFAULT_REVIEW_FORM_HTML,
    css: theme?.css ?? DEFAULT_REVIEW_FORM_CSS,
    styleBlocks: Array.isArray(theme?.styleBlocks) ? theme.styleBlocks : [],
    isCustom: Boolean(theme),
  };
}

function withPreview(state) {
  try {
    const previewCss = [state.css, compileReviewFormStyleBlocks(state.styleBlocks)].filter(Boolean).join("\n\n");
    return { ...state, previewHtml: renderReviewFormHtml(state.html, PREVIEW_DATA), previewCss, previewError: "" };
  } catch (err) {
    return { ...state, previewHtml: "", previewCss: state.css, previewError: String(err?.message || err) };
  }
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return withPreview(buildState(null));

  const theme = await db.reviewFormTheme.findUnique({ where: { shopId: shop.id } });
  return withPreview(buildState(theme));
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { ok: false };

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "reset") {
    await db.reviewFormTheme.deleteMany({ where: { shopId: shop.id } });
    return { ok: true, intent, ...withPreview(buildState(null)) };
  }

  const html = String(formData.get("html") || "").slice(0, 20000);
  const css = String(formData.get("css") || "").slice(0, 20000);

  const theme = await db.reviewFormTheme.upsert({
    where: { shopId: shop.id },
    create: { shopId: shop.id, html, css, styleBlocks: [] },
    update: { html, css },
  });

  return { ok: true, intent: "save", ...withPreview(buildState(theme)) };
};

function TemplateForm({ state }) {
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  if (fetcher.data?.ok && fetcher.data.intent === "save") shopify.toast.show("Review form template saved");
  if (fetcher.data?.ok && fetcher.data.intent === "reset") shopify.toast.show("Review form reset to default");

  const html = fetcher.data?.html ?? state.html;
  const css = fetcher.data?.css ?? state.css;
  const isCustom = fetcher.data ? fetcher.data.isCustom : state.isCustom;

  return (
    <s-section heading="Template (raw HTML/CSS)">
      <s-paragraph>
        Full control of the form&apos;s markup. Tokens:{" "}
        <code>{"{{productTitle}} {{productTitleSuffix}} {{productTitleHeadingSuffix}} {{productImageUrl}}"}</code>
        , and <code>{"<!--IMAGE--> <!--/IMAGE-->"}</code> marks the block that
        only renders when the product has an image. Keep{" "}
        <code>data-jm-write-form</code>, <code>data-jm-write-rating</code>,{" "}
        <code>data-jm-write-error</code>, <code>data-jm-write-done</code>, the{" "}
        <code>.jm-write-review__star</code> buttons&apos; <code>data-value</code>,
        and <code>.jm-write-review__submit</code> intact — the star-picker and
        submit behavior are wired up by those fixed names, not by tokens.
        Prefer clicking and styling instead? Use the{" "}
        <s-link href="/app/review-form-editor">visual review form builder</s-link>.
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
                  if (!confirm("Reset to the default review form? This also clears any style blocks.")) e.preventDefault();
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

export default function ReviewFormStyle() {
  const loaderData = useLoaderData();

  return (
    <s-page heading="Review form template">
      <TemplateForm state={loaderData} />

      <s-section heading="Preview">
        <s-paragraph>
          Rendered with a sample product, including any styling saved from
          the visual review form builder. Reflects the last <em>saved</em>{" "}
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
