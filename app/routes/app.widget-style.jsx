// app/routes/app.widget-style.jsx — two ways to style the storefront review
// widget (WidgetTheme): raw HTML/CSS textareas for full control, and a
// dropdown-driven "style blocks" list for quick nudges without touching CSS
// (target + property + value, e.g. "Review title" + "Text color" + "#c00").
// Blocks compile to CSS and are appended after the raw stylesheet, so they
// always win for whatever property they set. A real block-based *visual*
// editor (click an element on a live preview, drag it) is the natural next
// step once this raw-template path is proven out — for now, no drag-and-drop,
// just named commands with hints on what each one does.
import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { DEFAULT_WIDGET_HTML, DEFAULT_WIDGET_CSS } from "../reviewWidget/defaults.server";
import { renderWidgetHtml } from "../reviewWidget/render.server";
import { compileStyleBlocks } from "../reviewWidget/styleBlocks.server";
import { TARGETS, PROPERTIES } from "../reviewWidget/styleCatalog";

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

function parseBlocksFromForm(formData) {
  const count = Number(formData.get("blockCount")) || 0;
  const blocks = [];
  for (let i = 0; i < count; i++) {
    const target = String(formData.get(`block-target-${i}`) || "");
    const property = String(formData.get(`block-property-${i}`) || "");
    const value = String(formData.get(`block-value-${i}`) || "").trim().slice(0, 200);
    if (target && property && value) blocks.push({ target, property, value });
  }
  return blocks;
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
    return { ok: true, intent, ...withPreview(buildState(null)) };
  }

  if (intent === "save-blocks") {
    const styleBlocks = parseBlocksFromForm(formData);
    const theme = await db.widgetTheme.upsert({
      where: { shopId: shop.id },
      create: { shopId: shop.id, html: DEFAULT_WIDGET_HTML, css: DEFAULT_WIDGET_CSS, styleBlocks },
      update: { styleBlocks },
    });
    return { ok: true, intent, ...withPreview(buildState(theme)) };
  }

  const html = String(formData.get("html") || "").slice(0, 20000);
  const css = String(formData.get("css") || "").slice(0, 20000);

  const theme = await db.widgetTheme.upsert({
    where: { shopId: shop.id },
    create: { shopId: shop.id, html, css },
    update: { html, css },
  });

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
    <s-section heading="Template (complete coder mode)">
      <s-paragraph>
        Raw HTML and CSS for the product-page review widget. Use{" "}
        <code>{"<!--ITEM--> ... <!--/ITEM-->"}</code> to mark the block that
        repeats per review, and <code>{"<!--EMPTY--> ... <!--/EMPTY-->"}</code>{" "}
        for the no-reviews state. Inside an item block:{" "}
        <code>{"{{stars}}"}</code>, <code>{"{{title}}"}</code>,{" "}
        <code>{"{{body}}"}</code>, <code>{"{{author}}"}</code>. Outside it:{" "}
        <code>{"{{averageStars}}"}</code>, <code>{"{{averageValue}}"}</code>,{" "}
        <code>{"{{count}}"}</code>, <code>{"{{reviewWord}}"}</code>. Anywhere:{" "}
        <code>{"{{rateWidget}}"}</code> — drops in a click-a-star-to-review
        control that submits inline, no page navigation (put it inside{" "}
        <code>{"<!--EMPTY-->"}</code> too so it still shows with zero
        reviews).
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

function BlockRow({ index, block, onRemove }) {
  const property = PROPERTIES.find((p) => p.value === block.property);
  return (
    <s-stack direction="inline" gap="tight">
      <input type="hidden" name={`block-target-${index}`} value={block.target} />
      <s-select
        label="Element"
        labelAccessibilityVisibility="exclusive"
        value={block.target}
        onChange={(e) => block.onTargetChange(e.target.value)}
      >
        {TARGETS.map((t) => (
          <s-option key={t.value} value={t.value}>{t.label}</s-option>
        ))}
      </s-select>

      <input type="hidden" name={`block-property-${index}`} value={block.property} />
      <s-select
        label="Style"
        labelAccessibilityVisibility="exclusive"
        value={block.property}
        onChange={(e) => block.onPropertyChange(e.target.value)}
      >
        {PROPERTIES.map((p) => (
          <s-option key={p.value} value={p.value}>{p.label}</s-option>
        ))}
      </s-select>

      <s-text-field
        label="Value"
        labelAccessibilityVisibility="exclusive"
        name={`block-value-${index}`}
        defaultValue={block.value}
        placeholder={property?.hint || "value"}
      ></s-text-field>

      <s-button variant="tertiary" onClick={onRemove}>Remove</s-button>
    </s-stack>
  );
}

function StyleBlocksForm({ state }) {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const saved = fetcher.data?.ok && fetcher.data.intent === "save-blocks" ? fetcher.data.styleBlocks : state.styleBlocks;
  const [blocks, setBlocks] = useState(saved.map((b) => ({ ...b })));

  if (fetcher.data?.ok && fetcher.data.intent === "save-blocks") shopify.toast.show("Style blocks saved");

  const addBlock = () => setBlocks((b) => [...b, { target: TARGETS[0].value, property: PROPERTIES[0].value, value: "" }]);
  const removeBlock = (index) => setBlocks((b) => b.filter((_, i) => i !== index));
  const setField = (index, field, value) =>
    setBlocks((b) => b.map((block, i) => (i === index ? { ...block, [field]: value } : block)));

  return (
    <s-section heading="Style blocks (normal mode)">
      <s-paragraph>
        No CSS needed — add a block, pick which element and which style, type
        a value. Each command is: <strong>Element</strong> (what to style) +{" "}
        <strong>Style</strong> (color, spacing, corners/shadow for a &quot;shape&quot;
        look, or margin to move something) + <strong>Value</strong>. A block
        always overrides the raw CSS above for that one property, so it&apos;s
        safe to use even with a custom template.
      </s-paragraph>

      <fetcher.Form method="POST">
        <input type="hidden" name="intent" value="save-blocks" />
        <input type="hidden" name="blockCount" value={blocks.length} />
        <s-stack direction="block" gap="base">
          {blocks.map((block, index) => (
            <BlockRow
              key={index}
              index={index}
              block={{
                ...block,
                onTargetChange: (v) => setField(index, "target", v),
                onPropertyChange: (v) => setField(index, "property", v),
              }}
              onRemove={() => removeBlock(index)}
            />
          ))}

          {blocks.length === 0 ? <s-paragraph>No style blocks yet.</s-paragraph> : null}

          <s-stack direction="inline" gap="tight">
            <s-button onClick={addBlock}>+ Add block</s-button>
            <s-button type="submit" variant="primary">Save blocks</s-button>
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
      <StyleBlocksForm state={loaderData} />

      <s-section heading="Preview">
        <s-paragraph>
          Rendered with sample review data. Reflects the last <em>saved</em>{" "}
          template/blocks, not unsaved edits above.
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
