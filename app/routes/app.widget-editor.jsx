// app/routes/app.widget-editor.jsx — visual (click-to-select, WordPress-ish)
// editor for the storefront review widget, built on top of the same
// WidgetTheme/style-blocks system as app.widget-style.jsx (that page's raw
// HTML/CSS + dropdown-driven blocks are still there for full control; this
// page is a click-on-the-live-preview alternative for the same data).
//
// How it works: the fixed default template (defaults.server.ts) is rendered
// with sample data into an <iframe>. Every element the editor understands —
// the fixed ones from reviewWidget/styleCatalog.ts (TARGETS, e.g. the
// summary bar and the quick-rate box) plus every block inside the
// review-item template (reviewWidget/blockTypes.ts, tagged with
// `data-jm-block`/`data-jm-block-type`) — is clickable. Clicking one opens a
// style panel on the right; edits there are style-block rows (same
// {target, property, value} shape the old editor saves), compiled to CSS and
// pushed into the iframe live via postMessage, no reload.
//
// Blocks live inside the <!--ITEM--> template, not appended after it: a
// block is the mapping applied to every review (stars/title/body/author/
// avatar/verified all resolve from the same review data every real review
// gets rendered with), so the editor only ever needs to show — and let you
// build — ONE sample of it. The review-item wrapper itself is a "container"
// block; "+ Add block" drops a new typed block inside whichever container is
// currently selected (or the item wrapper, by default), giving real nesting
// since the block tree *is* the HTML tree, no separate JSON schema needed.
//
// On Save we only ever persist plain html + css (+ styleBlocks, which is
// just precompiled CSS rules) to WidgetTheme — never any editor-only state.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { DEFAULT_WIDGET_HTML, DEFAULT_WIDGET_CSS } from "../reviewWidget/defaults.server";
import { renderWidgetHtml } from "../reviewWidget/renderTemplate";
import { compileStyleBlocks } from "../reviewWidget/styleCompiler";
import { TARGETS, PROPERTIES } from "../reviewWidget/styleCatalog";
import { BLOCK_TYPES, blockTypeFor } from "../reviewWidget/blockTypes";

// Two sample reviews so the summary bar reads "2 reviews" like a real
// widget, but only the first is ever rendered as the editable item block —
// see the header comment on why one sample is enough.
const PREVIEW_DATA = {
  count: 2,
  average: 4.5,
  reviews: [
    { rating: 5, title: "Love it", body: "Exactly what I needed.", authorName: "Jordan", verifiedBuyer: true, customer: null },
    { rating: 4, title: "Pretty good", body: "Would buy again.", authorName: null, customer: { firstName: "Sam", lastName: "R." } },
  ],
};

const ITEM_RE = /<!--ITEM-->([\s\S]*?)<!--\/ITEM-->/;

function extractItemHtml(html) {
  const match = html.match(ITEM_RE);
  return match ? match[1].trim() : "";
}

function injectItemHtml(html, itemHtml) {
  if (!ITEM_RE.test(html)) return html;
  return html.replace(ITEM_RE, `<!--ITEM-->\n${itemHtml}\n<!--/ITEM-->`);
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  const theme = shop ? await db.widgetTheme.findUnique({ where: { shopId: shop.id } }) : null;
  return {
    html: theme?.html ?? DEFAULT_WIDGET_HTML,
    css: theme?.css ?? DEFAULT_WIDGET_CSS,
    styleBlocks: Array.isArray(theme?.styleBlocks) ? theme.styleBlocks : [],
    isCustom: Boolean(theme),
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { ok: false };

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "reset") {
    await db.widgetTheme.deleteMany({ where: { shopId: shop.id } });
    return { ok: true, intent, html: DEFAULT_WIDGET_HTML, css: DEFAULT_WIDGET_CSS, styleBlocks: [], isCustom: false };
  }

  const html = String(formData.get("html") || "").slice(0, 20000);
  const css = String(formData.get("css") || "").slice(0, 20000);
  let styleBlocks = [];
  try {
    styleBlocks = JSON.parse(String(formData.get("styleBlocksJson") || "[]"));
  } catch {
    styleBlocks = [];
  }
  if (!Array.isArray(styleBlocks)) styleBlocks = [];

  const theme = await db.widgetTheme.upsert({
    where: { shopId: shop.id },
    create: { shopId: shop.id, html, css, styleBlocks },
    update: { html, css, styleBlocks },
  });

  return { ok: true, intent: "save-editor", html: theme.html, css: theme.css, styleBlocks: theme.styleBlocks, isCustom: true };
};

// Runs inside the iframe. Kept as a plain string (not a module) since it's
// injected via srcDoc — __TARGETS__ is replaced with JSON before injection.
const EDITOR_SCRIPT = `
(function () {
  var TARGETS = __TARGETS__;
  var selectedEl = null;

  function resolveTarget(start) {
    var node = start;
    while (node && node !== document.body && node.nodeType === 1) {
      if (node.hasAttribute('data-jm-block-type')) {
        return {
          el: node,
          styleTarget: node.getAttribute('data-jm-block') || node.getAttribute('data-jm-block-type'),
          blockId: node.getAttribute('data-jm-block'),
          blockType: node.getAttribute('data-jm-block-type'),
        };
      }
      for (var i = 0; i < TARGETS.length; i++) {
        if (node.matches && node.matches(TARGETS[i].selector)) {
          return { el: node, styleTarget: TARGETS[i].value, blockId: null, blockType: null };
        }
      }
      node = node.parentElement;
    }
    return null;
  }

  document.addEventListener('click', function (e) {
    e.preventDefault();
    var res = resolveTarget(e.target);
    if (selectedEl) selectedEl.classList.remove('jm-editor-selected');
    if (!res) {
      selectedEl = null;
      parent.postMessage({ type: 'jm-select', styleTarget: null, blockId: null, blockType: null }, '*');
      return;
    }
    selectedEl = res.el;
    selectedEl.classList.add('jm-editor-selected');
    parent.postMessage({ type: 'jm-select', styleTarget: res.styleTarget, blockId: res.blockId, blockType: res.blockType }, '*');
  }, true);

  window.addEventListener('message', function (e) {
    var msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'jm-set-style') {
      var tag = document.getElementById('jm-live-style');
      if (tag) tag.textContent = msg.css;
    }
  });
})();
`;

function buildSrcDoc({ baseHtmlRendered, css, targets }) {
  const script = EDITOR_SCRIPT.replace("__TARGETS__", JSON.stringify(targets));
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; padding: 16px; font-family: -apple-system, system-ui, sans-serif; }
  [data-jm-block-type="container"] { min-height: 1.5em; }
  .jm-editor-selected { outline: 2px solid #5c6ac4; outline-offset: 2px; }
  .jm-reviews * { cursor: pointer; }
</style>
<style id="jm-live-style">${css}</style>
</head>
<body>
<div class="jm-reviews">${baseHtmlRendered}</div>
<script>${script}<\/script>
</body>
</html>`;
}

let blockCounter = 0;
function newBlockId() {
  blockCounter += 1;
  return `block-${Date.now().toString(36)}${blockCounter}`;
}

function labelFor(target) {
  if (!target) return "";
  const known = TARGETS.find((t) => t.value === target);
  return known ? known.label : target;
}

// Parses itemHtml as a DOM tree so add/remove are real structural edits
// (correct even across nested containers), not regex string surgery.
function withItemDom(itemHtml, fn) {
  const doc = new DOMParser().parseFromString(`<div id="jm-root">${itemHtml}</div>`, "text/html");
  const root = doc.getElementById("jm-root");
  fn(doc, root);
  return root.innerHTML.trim();
}

function insertBlock(itemHtml, containerId, blockHtml) {
  return withItemDom(itemHtml, (doc, root) => {
    const container = containerId ? root.querySelector(`[data-jm-block="${containerId}"]`) : null;
    (container || root).insertAdjacentHTML("beforeend", blockHtml);
  });
}

function removeBlock(itemHtml, blockId) {
  return withItemDom(itemHtml, (doc, root) => {
    const el = root.querySelector(`[data-jm-block="${blockId}"]`);
    if (el) el.remove();
  });
}

function BlockPalette({ onPick, onClose }) {
  return (
    <s-section heading="Add a block">
      <s-stack direction="block" gap="tight">
        {BLOCK_TYPES.map((b) => (
          <s-button key={b.type} onClick={() => onPick(b)}>
            {b.icon} {b.label} — {b.description}
          </s-button>
        ))}
        <s-button variant="tertiary" onClick={onClose}>Cancel</s-button>
      </s-stack>
    </s-section>
  );
}

function StylePanel({ selected, styleBlocks, setStyleBlocks, onDeleteBlock, onAddInside }) {
  const target = selected.styleTarget;
  const rows = styleBlocks.map((b, i) => ({ ...b, i })).filter((b) => b.target === target);
  const blockInfo = selected.blockType ? blockTypeFor(selected.blockType) : null;

  const addRow = () => setStyleBlocks((all) => [...all, { target, property: PROPERTIES[0].value, value: "" }]);
  const removeRow = (i) => setStyleBlocks((all) => all.filter((_, idx) => idx !== i));
  const setRow = (i, field, value) => setStyleBlocks((all) => all.map((b, idx) => (idx === i ? { ...b, [field]: value } : b)));

  if (!target) {
    return (
      <s-section heading="Styles">
        <s-paragraph>Click any element in the preview to select it.</s-paragraph>
      </s-section>
    );
  }

  return (
    <s-section heading={`Styles — ${blockInfo ? `${blockInfo.icon} ${blockInfo.label}` : labelFor(target)}`}>
      <s-stack direction="block" gap="base">
        {rows.length === 0 ? <s-paragraph>No styles set on this element yet.</s-paragraph> : null}
        {rows.map((row) => {
          const property = PROPERTIES.find((p) => p.value === row.property);
          return (
            <s-stack key={row.i} direction="inline" gap="tight">
              <s-select
                label="Style"
                labelAccessibilityVisibility="exclusive"
                value={row.property}
                onChange={(e) => setRow(row.i, "property", e.target.value)}
              >
                {PROPERTIES.map((p) => (
                  <s-option key={p.value} value={p.value}>{p.label}</s-option>
                ))}
              </s-select>
              <s-text-field
                label="Value"
                labelAccessibilityVisibility="exclusive"
                value={row.value}
                placeholder={property?.hint || "value"}
                onChange={(e) => setRow(row.i, "value", e.target.value)}
              ></s-text-field>
              <s-button variant="tertiary" onClick={() => removeRow(row.i)}>Remove</s-button>
            </s-stack>
          );
        })}
        <s-stack direction="inline" gap="tight">
          <s-button onClick={addRow}>+ Add style</s-button>
          {blockInfo?.container ? (
            <s-button onClick={onAddInside}>+ Add block inside</s-button>
          ) : null}
          {selected.blockId && selected.blockId !== "item" ? (
            <s-button variant="tertiary" onClick={onDeleteBlock}>Delete this block</s-button>
          ) : null}
        </s-stack>
      </s-stack>
    </s-section>
  );
}

export default function WidgetEditor() {
  const loaderData = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const iframeRef = useRef(null);

  const [baseHtml, setBaseHtml] = useState(loaderData.html);
  const [itemHtml, setItemHtml] = useState(() => extractItemHtml(loaderData.html));
  const [css] = useState(loaderData.css);
  const [styleBlocks, setStyleBlocks] = useState(loaderData.styleBlocks);
  const [selected, setSelected] = useState({ styleTarget: null, blockId: null, blockType: null });
  const [srcDoc, setSrcDoc] = useState("");
  const [dirty, setDirty] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const targetsForIframe = useMemo(() => TARGETS.map((t) => ({ value: t.value, selector: t.selector })), []);

  const rebuildIframe = (nextItemHtml = itemHtml) => {
    const template = injectItemHtml(baseHtml, nextItemHtml);
    const previewData = { ...PREVIEW_DATA, reviews: PREVIEW_DATA.reviews.slice(0, 1) };
    const baseHtmlRendered = renderWidgetHtml(template, previewData);
    const liveCss = [css, compileStyleBlocks(styleBlocks)].filter(Boolean).join("\n\n");
    setSrcDoc(buildSrcDoc({ baseHtmlRendered, css: liveCss, targets: targetsForIframe }));
  };

  // Build the iframe once on mount; after that, style edits go over
  // postMessage and only structural changes (add/remove block) rebuild it.
  useEffect(() => {
    rebuildIframe(itemHtml);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-push style changes into the iframe without reloading it.
  useEffect(() => {
    const liveCss = [css, compileStyleBlocks(styleBlocks)].filter(Boolean).join("\n\n");
    iframeRef.current?.contentWindow?.postMessage({ type: "jm-set-style", css: liveCss }, "*");
    setDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleBlocks]);

  useEffect(() => {
    function onMessage(e) {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      const msg = e.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "jm-select") {
        setSelected({ styleTarget: msg.styleTarget, blockId: msg.blockId, blockType: msg.blockType });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (fetcher.data?.ok && fetcher.data.intent === "save-editor") shopify.toast.show("Widget saved");

  useEffect(() => {
    if (!(fetcher.data?.ok && fetcher.data.intent === "reset")) return;
    shopify.toast.show("Widget reset to default");
    const nextItemHtml = extractItemHtml(fetcher.data.html);
    setBaseHtml(fetcher.data.html);
    setItemHtml(nextItemHtml);
    setStyleBlocks([]);
    setSelected({ styleTarget: null, blockId: null, blockType: null });
    setDirty(false);
    rebuildIframe(nextItemHtml);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  const addBlock = (blockDef) => {
    const id = newBlockId();
    const html = blockDef.html(id);
    // Nest inside the currently selected container, or the review card
    // itself (the "item" block) by default.
    const containerId = selected.blockType === "container" ? selected.blockId : "item";
    const nextItemHtml = insertBlock(itemHtml, containerId, html);
    setItemHtml(nextItemHtml);
    setSelected({ styleTarget: id, blockId: id, blockType: blockDef.type });
    setDirty(true);
    setPaletteOpen(false);
    rebuildIframe(nextItemHtml);
  };

  const deleteSelectedBlock = () => {
    if (!selected.blockId || selected.blockId === "item") return;
    const id = selected.blockId;
    const nextItemHtml = removeBlock(itemHtml, id);
    setItemHtml(nextItemHtml);
    setStyleBlocks((all) => all.filter((b) => b.target !== id));
    setSelected({ styleTarget: null, blockId: null, blockType: null });
    setDirty(true);
    rebuildIframe(nextItemHtml);
  };

  const save = () => {
    const html = injectItemHtml(baseHtml, itemHtml);
    const formData = new FormData();
    formData.set("intent", "save-editor");
    formData.set("html", html);
    formData.set("css", css);
    formData.set("styleBlocksJson", JSON.stringify(styleBlocks));
    fetcher.submit(formData, { method: "POST" });
    setDirty(false);
  };

  const reset = () => {
    if (!confirm("Reset the widget to default? This discards all visual customizations.")) return;
    const formData = new FormData();
    formData.set("intent", "reset");
    fetcher.submit(formData, { method: "POST" });
  };

  return (
    <s-page heading="Widget builder">
      <s-section heading="Click-to-style editor">
        <s-paragraph>
          Click any element below to style it (colors, spacing, corners,
          shadows...). Use <strong>+ Add block</strong> to drop in a
          ready-made piece — stars, title, body, author, avatar, a verified
          badge, or a container to group other blocks inside. Select a
          container first to nest a new block inside it; otherwise it's added
          to the review card. Every block is bound to the real review data,
          so one sample is shown here standing in for every review. Changes
          here are visual only; Save writes out plain HTML/CSS to the widget,
          same as the <s-link href="/app/widget-style">raw template editor</s-link>.
        </s-paragraph>
      </s-section>

      <s-stack direction="inline" gap="loose" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 60%", minWidth: 320 }}>
          <s-section heading="Preview (click to select)">
            <div style={{ border: "1px solid #ddd", borderRadius: 8, overflow: "hidden" }}>
              <iframe
                ref={iframeRef}
                title="Widget preview"
                srcDoc={srcDoc}
                style={{ width: "100%", height: 520, border: "0", display: "block" }}
              />
            </div>
            <s-stack direction="inline" gap="tight">
              <s-button onClick={() => setPaletteOpen((open) => !open)}>+ Add block</s-button>
              <s-button variant="primary" onClick={save} disabled={!dirty && !!loaderData.isCustom}>
                Save
              </s-button>
              {loaderData.isCustom || dirty ? (
                <s-button variant="tertiary" onClick={reset}>Reset to default</s-button>
              ) : null}
            </s-stack>
          </s-section>
          {paletteOpen ? <BlockPalette onPick={addBlock} onClose={() => setPaletteOpen(false)} /> : null}
        </div>

        <div style={{ flex: "1 1 35%", minWidth: 280 }}>
          <StylePanel
            selected={selected}
            styleBlocks={styleBlocks}
            setStyleBlocks={setStyleBlocks}
            onDeleteBlock={deleteSelectedBlock}
            onAddInside={() => setPaletteOpen(true)}
          />
        </div>
      </s-stack>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
