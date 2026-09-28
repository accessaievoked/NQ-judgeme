// app/routes/app.email-builder.jsx — visual, click-to-select canvas builder
// for transactional emails (EmailLayout), built the same way as
// app.widget-editor.jsx: a live <iframe> preview a vendor clicks directly to
// select an element (or picks one from the sidebar list), a settings panel
// with real controls (position, size, color, bold/underline, alignment,
// link), and drag-to-reposition inside the preview itself for anything
// selected. Structurally simpler than the widget editor — email elements are
// a flat, absolute-positioned list (text/image/button boxes), not a nested
// block tree — so there's no sidebar tree/reparenting here, just a list.
//
// On Save this compiles the canvas to table-based HTML via
// email/emailLayoutCompiler.ts (real email clients, Outlook especially,
// don't support position:absolute — see that file's header comment) rather
// than shipping the canvas positions as-is; only compiled html/subject ever
// get sent, the canvas `elements` array is editor state that round-trips
// through EmailLayout.elements. "Raw HTML" mode is a tab inside this same
// form (see TriggerEditor) that bypasses the canvas entirely, same split as
// app.widget-editor.jsx (visual) vs app.widget-style.jsx (raw) — just one
// page instead of two, since there's no separate "raw code" page here to
// mirror.
//
// The single editor for every trigger now (the older flow-layout/rich-text
// page, app.email-templates.jsx, is gone). A trigger resolves through
// EmailLayout (this page) first, and only falls back to any EmailTemplate
// row a shop saved back when that older page still existed (see
// templates.server.ts's resolveTemplate) — but this builder itself never
// seeds anything from that legacy row anymore: it used to (into Raw HTML
// mode, on a trigger's very first visit here), but that meant Canvas and
// Raw HTML could show two genuinely different emails for the exact same,
// never-yet-saved trigger — confusing, and looked like a bug. Now a
// never-saved trigger always starts from the exact same content in both
// tabs (defaultElements() below, and RawEditor's own
// compileEmailLayoutHtml(...) of those same elements) — "switch tabs" never
// silently swaps the email you're looking at.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { compileEmailLayoutHtml } from "../email/emailLayoutCompiler";
import { DEFAULT_TEMPLATES, fillTokens } from "../email/templates.server";
import { sendEmail, isEmailConfigured } from "../email/sender.server";

const TRIGGER_LABELS = {
  "orders/paid": "On order paid",
  "orders/fulfilled": "On order fulfilled",
  review_reminder: "Reminder (no review yet)",
  review_thankyou: "Thank you (after review submitted)",
};

const TOKENS = ["{{customerName}}", "{{productTitle}}", "{{shopName}}", "{{reviewUrl}}", "{{reminderNumber}}", "{{discountSection}}"];

const DEFAULT_CANVAS_WIDTH = 480;

function defaultElements(triggerType) {
  const heading = triggerType === "review_thankyou" ? "Thanks, {{customerName}}!" : "Hi {{customerName}},";
  const body =
    triggerType === "review_thankyou"
      ? "We really appreciate you reviewing {{productTitle}}."
      : "Mind leaving a quick review of {{productTitle}}? It only takes a minute.";
  return [
    { id: "el-heading", type: "text", x: 20, y: 20, width: 400, height: 36, text: heading, fontSize: 22, bold: true, underline: false, color: "#1a1a1a", background: "transparent", textAlign: "left", padding: 4, borderRadius: 0, isLink: false },
    { id: "el-body", type: "text", x: 20, y: 68, width: 400, height: 60, text: body, fontSize: 15, bold: false, underline: false, color: "#333333", background: "transparent", textAlign: "left", padding: 4, borderRadius: 0, isLink: false },
    { id: "el-button", type: "button", x: 20, y: 140, width: 180, height: 44, text: "Leave a review", href: "{{reviewUrl}}", fontSize: 14, bold: true, underline: false, color: "#ffffff", background: "#1a1a1a", textAlign: "center", padding: 10, borderRadius: 6 },
  ];
}

function buildState(layout, triggerType) {
  const elements = Array.isArray(layout?.elements) && layout.elements.length ? layout.elements : defaultElements(triggerType);
  return {
    triggerType,
    mode: layout?.mode ?? "canvas",
    subject: layout?.subject ?? DEFAULT_TEMPLATES[triggerType]?.subject ?? "",
    elements,
    // "" (not seeded from anywhere else) when unsaved — RawEditor itself
    // fills this in with compileEmailLayoutHtml(elements, canvasWidth) so
    // Raw HTML's first look always matches Canvas's, instead of this page
    // guessing at content here.
    rawHtml: layout?.rawHtml ?? "",
    canvasWidth: layout?.canvasWidth ?? DEFAULT_CANVAS_WIDTH,
    isCustom: Boolean(layout),
  };
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  const triggerTypes = Object.keys(TRIGGER_LABELS);

  if (!shop) {
    return { shopId: null, layouts: triggerTypes.map((t) => buildState(null, t)) };
  }

  const savedLayouts = await db.emailLayout.findMany({ where: { shopId: shop.id } });
  return {
    shopId: shop.id,
    layouts: triggerTypes.map((t) => buildState(savedLayouts.find((l) => l.triggerType === t), t)),
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { ok: false };

  const formData = await request.formData();
  const triggerType = String(formData.get("triggerType"));
  const intent = formData.get("intent");

  if (intent === "reset") {
    await db.emailLayout.deleteMany({ where: { shopId: shop.id, triggerType } });
    return { ok: true, intent, triggerType, ...buildState(null, triggerType) };
  }

  const mode = formData.get("mode") === "html" ? "html" : "canvas";
  const subject = String(formData.get("subject") || "").slice(0, 300);
  const canvasWidth = Math.min(Math.max(Number(formData.get("canvasWidth")) || DEFAULT_CANVAS_WIDTH, 280), 800);

  let elements = [];
  let rawHtml = "";
  if (mode === "html") {
    rawHtml = String(formData.get("rawHtml") || "").slice(0, 20000);
    const existing = await db.emailLayout.findUnique({ where: { shopId_triggerType: { shopId: shop.id, triggerType } } });
    elements = Array.isArray(existing?.elements) ? existing.elements : defaultElements(triggerType);
  } else {
    try {
      elements = JSON.parse(String(formData.get("elements") || "[]"));
      if (!Array.isArray(elements)) elements = [];
    } catch {
      elements = [];
    }
  }

  // Sends whatever's currently in the editor (unsaved edits included) with
  // sample token values — doesn't touch EmailLayout at all, so it's safe to
  // try before Save. Real trigger emails always go through resolveTemplate
  // (templates.server.ts) against the *saved* row; this reuses the exact
  // same fillTokens/sendEmail primitives just against this live draft.
  if (intent === "test-send") {
    const testEmail = String(formData.get("testEmail") || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
      return { ok: false, intent, triggerType, error: "Enter a valid email address." };
    }

    const sampleTokens = {
      customerName: "Jordan (test)",
      productTitle: "Sample Product",
      shopName: shop.domain,
      reviewUrl: "#",
      reminderNumber: 1,
      discountSection: "",
    };
    const html = mode === "html" ? rawHtml : compileEmailLayoutHtml(elements, canvasWidth);

    try {
      await sendEmail({ to: testEmail, subject: `[Test] ${fillTokens(subject, sampleTokens)}`, html: fillTokens(html, sampleTokens) });
    } catch (err) {
      return { ok: false, intent, triggerType, error: `Couldn't send: ${err instanceof Error ? err.message : String(err)}` };
    }

    return { ok: true, intent, triggerType, testEmail, devMode: !isEmailConfigured() };
  }

  const layout = await db.emailLayout.upsert({
    where: { shopId_triggerType: { shopId: shop.id, triggerType } },
    create: { shopId: shop.id, triggerType, mode, subject, elements, rawHtml, canvasWidth },
    update: { mode, subject, elements, rawHtml, canvasWidth },
  });

  return { ok: true, intent: "save", triggerType, ...buildState(layout, triggerType) };
};

const ELEMENT_DEFAULTS = {
  text: { width: 200, height: 28, text: "New text", fontSize: 15, bold: false, underline: false, color: "#1a1a1a", background: "transparent", textAlign: "left", padding: 4, borderRadius: 0, isLink: false, linkColor: "#1a56db" },
  image: { width: 160, height: 120, src: "https://cdn.shopify.com/s/files/1/placeholder.png", href: "", background: "transparent", borderRadius: 0 },
  button: { width: 160, height: 44, text: "Click here", href: "{{reviewUrl}}", fontSize: 14, bold: true, underline: false, color: "#ffffff", background: "#1a1a1a", textAlign: "center", padding: 10, borderRadius: 6, icon: "", iconPosition: "left" },
  // A plain background/border box — drop it behind a group of other
  // elements (Send to back) to visually group them into a card/panel, same
  // "div wrapper" role a <section> plays in real HTML. No text of its own.
  section: { width: 400, height: 100, background: "#f6f6f7", borderRadius: 8 },
  // A thin colored rule — `background` is the line color, `height` its
  // thickness, reusing fields every other element already has.
  divider: { width: 400, height: 2, background: "#e1e1e1" },
};

// Runs inside the iframe. Kept as a plain string (not a module) since it's
// injected via srcDoc, same technique as app.widget-editor.jsx's
// EDITOR_SCRIPT — __ELEMENTS__ is replaced with JSON before injection. A
// selected element can be dragged directly (mousedown on the already-
// selected box starts a drag; a real drag suppresses the click that
// mouseup always fires right after, so dragging never fights with
// selecting); property-panel edits instead re-render via postMessage
// ("jm-email-render") so the iframe never has to reload on every keystroke.
const EDITOR_SCRIPT = `
(function () {
  var selectedId = null;
  var canvas = document.getElementById('jm-email-canvas');

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function elHtml(el) {
    var style = 'position:absolute;left:' + el.x + 'px;top:' + el.y + 'px;width:' + el.width + 'px;height:' + el.height + 'px;' +
      'box-sizing:border-box;overflow:hidden;cursor:move;' +
      'font-size:' + (el.fontSize || 14) + 'px;font-weight:' + (el.bold ? '700' : '400') + ';' +
      'text-decoration:' + (el.underline ? 'underline' : 'none') + ';' +
      'text-align:' + (el.textAlign || 'left') + ';border-radius:' + (el.borderRadius || 0) + 'px;' +
      'padding:' + (el.padding || 0) + 'px;';

    if (el.type === 'image') {
      style += 'background:' + (el.background || 'transparent') + ';';
      return '<div class="jm-email-el" data-email-el="' + el.id + '" style="' + style + '"><img src="' + esc(el.src || '') + '" style="width:100%;height:100%;object-fit:cover;pointer-events:none;display:block;" /></div>';
    }
    if (el.type === 'section') {
      style += 'background:' + (el.background || '#f6f6f7') + ';box-shadow:inset 0 0 0 1px rgba(0,0,0,0.06);';
      return '<div class="jm-email-el" data-email-el="' + el.id + '" style="' + style + '"></div>';
    }
    if (el.type === 'divider') {
      style += 'background:' + (el.background && el.background !== 'transparent' ? el.background : '#e1e1e1') + ';';
      return '<div class="jm-email-el" data-email-el="' + el.id + '" style="' + style + '"></div>';
    }
    if (el.type === 'button') {
      var justify = el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'flex-end' : 'flex-start';
      style += 'display:flex;align-items:center;justify-content:' + justify + ';gap:6px;background:' + (el.background || '#1a1a1a') + ';color:' + (el.color || '#ffffff') + ';';
      var iconSpan = el.icon ? '<span>' + esc(el.icon) + '</span>' : '';
      var label = '<span>' + esc(el.text || 'Click here') + '</span>';
      var inner = el.iconPosition === 'right' ? label + iconSpan : iconSpan + label;
      return '<div class="jm-email-el" data-email-el="' + el.id + '" style="' + style + '">' + inner + '</div>';
    }
    var textColor = el.isLink ? (el.linkColor || el.color || '#1a1a1a') : (el.color || '#1a1a1a');
    style += 'background:' + (el.background || 'transparent') + ';color:' + textColor + ';';
    return '<div class="jm-email-el" data-email-el="' + el.id + '" style="' + style + '">' + esc(el.text || '') + '</div>';
  }

  function applySelection() {
    var nodes = canvas.querySelectorAll('[data-email-el]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.classList.toggle('jm-email-selected', n.getAttribute('data-email-el') === selectedId);
    }
  }

  function render(elements) {
    canvas.innerHTML = elements.map(elHtml).join('');
    applySelection();
  }

  var dragState = null;
  var suppressClick = false;

  canvas.addEventListener('mousedown', function (e) {
    var node = e.target.closest('[data-email-el]');
    if (!node) return;
    var id = node.getAttribute('data-email-el');
    if (id !== selectedId) return;
    e.preventDefault();
    dragState = { id: id, node: node, startX: e.clientX, startY: e.clientY, startLeft: node.offsetLeft, startTop: node.offsetTop, moved: false };
  });

  document.addEventListener('mousemove', function (e) {
    if (!dragState) return;
    var dx = e.clientX - dragState.startX;
    var dy = e.clientY - dragState.startY;
    if (!dragState.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    dragState.moved = true;
    var left = Math.max(0, Math.round(dragState.startLeft + dx));
    var top = Math.max(0, Math.round(dragState.startTop + dy));
    dragState.node.style.left = left + 'px';
    dragState.node.style.top = top + 'px';
  });

  document.addEventListener('mouseup', function () {
    if (!dragState) return;
    if (dragState.moved) {
      suppressClick = true;
      parent.postMessage({ type: 'jm-email-drag-end', id: dragState.id, x: parseInt(dragState.node.style.left, 10), y: parseInt(dragState.node.style.top, 10) }, '*');
    }
    dragState = null;
  });

  canvas.addEventListener('click', function (e) {
    if (suppressClick) { suppressClick = false; return; }
    var node = e.target.closest('[data-email-el]');
    selectedId = node ? node.getAttribute('data-email-el') : null;
    applySelection();
    parent.postMessage({ type: 'jm-email-select', id: selectedId }, '*');
  });

  window.addEventListener('message', function (e) {
    var msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'jm-email-render') {
      render(msg.elements);
    } else if (msg.type === 'jm-email-select-external') {
      selectedId = msg.id;
      applySelection();
    }
  });

  render(__ELEMENTS__);
})();
`;

function buildSrcDoc(elements, canvasWidth) {
  const script = EDITOR_SCRIPT.replace("__ELEMENTS__", JSON.stringify(elements));
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; padding: 20px; font-family: -apple-system, system-ui, sans-serif; background: #f6f6f7; }
  #jm-email-canvas { position: relative; width: ${canvasWidth}px; min-height: 240px; background: #fff; box-shadow: 0 0 0 1px #e1e1e1; }
  .jm-email-el { user-select: none; }
  .jm-email-selected { outline: 2px solid #5c6ac4 !important; outline-offset: 1px; }
</style>
</head>
<body>
<div id="jm-email-canvas"></div>
<script>${script}<\/script>
</body>
</html>`;
}

// Plain native inputs, not Shopify's <s-text-field>/<s-number-field> — same
// reliability reason app.widget-editor.jsx's Field/NativeSelect use them
// (see that file's long comment on its Field component): this panel swaps
// to a different element's values on every canvas selection, and Polaris
// web components' controlled-value updates aren't reliably first-party
// outside the real embedded admin runtime.
function Field({ label, value, placeholder, onChange, onBlur, hideLabel, type = "text", min, max, step }) {
  return (
    <label className="jm-field">
      {!hideLabel ? <span className="jm-field__label">{label}</span> : null}
      <input
        className="jm-field__input"
        type={type}
        min={min}
        max={max}
        step={step}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)}
        onBlur={onBlur}
        aria-label={hideLabel ? label : undefined}
      />
    </label>
  );
}

function NativeSelect({ label, value, options, onChange, hideLabel }) {
  return (
    <label className="jm-field">
      {!hideLabel ? <span className="jm-field__label">{label}</span> : null}
      <select className="jm-field__input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} aria-label={hideLabel ? label : undefined}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function ColorField({ label, value, onChange }) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return (
    <div>
      <span className="jm-field__label">{label}</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} title={label} style={{ width: 36, height: 36, padding: 0, border: "1px solid #ccc", borderRadius: 6, cursor: "pointer", background: "none", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <Field label={label} value={value} placeholder="e.g. #1a1a1a" onChange={onChange} hideLabel />
        </div>
        <button type="button" className="jm-ghost-btn" onClick={() => onChange("transparent")}>None</button>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="jm-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function SettingsGroup({ heading, children }) {
  return (
    <div className="jm-settings-group">
      <s-text tone="subdued">{heading}</s-text>
      <s-stack direction="block" gap="base" style={{ marginTop: 10 }}>
        {children}
      </s-stack>
    </div>
  );
}

const ALIGN_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

// The generic settings-panel engine — mirrors app.widget-editor.jsx's
// SettingsPanel/ControlField split, just hardcoded per element type instead
// of driven by a declarative `controls` array module, since there are only
// three fixed types here rather than an open-ended block palette.
function ElementSettings({ element, onChange, onDelete, onDuplicate, onBringToFront, onSendToBack }) {
  if (!element) {
    return (
      <s-section heading="Settings">
        <s-paragraph>Click any element in the preview, or pick one from the list, to edit it.</s-paragraph>
      </s-section>
    );
  }

  const set = (patch) => onChange(element.id, patch);
  const TYPE_LABELS = { text: "Text", image: "Image", button: "Button", section: "Section", divider: "Divider" };
  const typeLabel = `${ELEMENT_ICONS[element.type] ?? "🔘"} ${TYPE_LABELS[element.type] ?? "Button"}`;
  const hasText = element.type === "text" || element.type === "button";
  const hasTypography = hasText;

  return (
    <s-section heading={`Settings — ${typeLabel}`}>
      <s-stack direction="block" gap="loose">
        <SettingsGroup heading="Position & size">
          <s-stack direction="inline" gap="tight">
            <Field label="X" type="number" value={element.x} onChange={(v) => set({ x: v })} />
            <Field label="Y" type="number" value={element.y} onChange={(v) => set({ y: v })} />
          </s-stack>
          <s-stack direction="inline" gap="tight">
            <Field label="Width" type="number" value={element.width} onChange={(v) => set({ width: v })} />
            <Field label="Height" type="number" value={element.height} onChange={(v) => set({ height: v })} />
          </s-stack>
          <HelpTextRow text="Or drag it directly in the preview." />
        </SettingsGroup>

        {element.type === "image" ? (
          <SettingsGroup heading="Image">
            <Field label="Image URL" value={element.src} placeholder="https://..." onChange={(v) => set({ src: v })} />
            <Field label="Link URL (optional)" value={element.href} placeholder="https://... or {{reviewUrl}}" onChange={(v) => set({ href: v })} />
          </SettingsGroup>
        ) : null}

        {element.type === "section" ? (
          <SettingsGroup heading="Section">
            <HelpTextRow text="A plain background box — put it behind a group of other elements (Send to back) to visually group them into a card/panel." />
          </SettingsGroup>
        ) : null}

        {element.type === "divider" ? (
          <SettingsGroup heading="Divider">
            <HelpTextRow text="A thin line — use Background below for its color and Height above for its thickness." />
          </SettingsGroup>
        ) : null}

        {hasText ? (
          <SettingsGroup heading="Content">
            <Field label={element.type === "button" ? "Button text" : "Text"} value={element.text} onChange={(v) => set({ text: v })} />
          </SettingsGroup>
        ) : null}

        {element.type === "button" ? (
          <SettingsGroup heading="Icon">
            <Field label="Icon (emoji or symbol, optional)" value={element.icon} placeholder="e.g. → ✓ 🛒" onChange={(v) => set({ icon: v })} />
            <NativeSelect
              label="Icon position"
              value={element.iconPosition ?? "left"}
              options={[{ value: "left", label: "Left of text" }, { value: "right", label: "Right of text" }]}
              onChange={(v) => set({ iconPosition: v })}
            />
          </SettingsGroup>
        ) : null}

        {hasTypography ? (
          <SettingsGroup heading="Typography">
            <s-stack direction="inline" gap="tight">
              <Field label="Font size" type="number" min={8} max={72} value={element.fontSize} onChange={(v) => set({ fontSize: v })} />
              <NativeSelect label="Align" value={element.textAlign} options={ALIGN_OPTIONS} onChange={(v) => set({ textAlign: v })} />
            </s-stack>
            <s-stack direction="inline" gap="base">
              <Toggle label="Bold" checked={Boolean(element.bold)} onChange={(v) => set({ bold: v })} />
              <Toggle label="Underline" checked={Boolean(element.underline)} onChange={(v) => set({ underline: v })} />
            </s-stack>
            <ColorField label="Text color" value={element.color} onChange={(v) => set({ color: v })} />
          </SettingsGroup>
        ) : null}

        {element.type === "text" ? (
          <SettingsGroup heading="Link">
            <Toggle label="This text is a link" checked={Boolean(element.isLink)} onChange={(v) => set({ isLink: v })} />
            {element.isLink ? (
              <>
                <Field label="Link URL" value={element.href} placeholder="https://... or {{reviewUrl}}" onChange={(v) => set({ href: v })} />
                <ColorField label="Link color" value={element.linkColor} onChange={(v) => set({ linkColor: v })} />
              </>
            ) : null}
          </SettingsGroup>
        ) : null}

        {element.type === "button" ? (
          <SettingsGroup heading="Link">
            <Field label="Link URL" value={element.href} placeholder="https://... or {{reviewUrl}}" onChange={(v) => set({ href: v })} />
          </SettingsGroup>
        ) : null}

        <SettingsGroup heading="Background & spacing">
          <ColorField label="Background" value={element.background} onChange={(v) => set({ background: v })} />
          {element.type !== "divider" ? (
            <s-stack direction="inline" gap="tight">
              <Field label="Padding" type="number" min={0} value={element.padding ?? 0} onChange={(v) => set({ padding: v })} />
              <Field label="Corner rounding" type="number" min={0} value={element.borderRadius ?? 0} onChange={(v) => set({ borderRadius: v })} />
            </s-stack>
          ) : null}
        </SettingsGroup>

        <SettingsGroup heading="Advanced">
          <Field label="Custom CSS" value={element.customCss ?? ""} placeholder="letter-spacing:1px;" onChange={(v) => set({ customCss: v })} />
          <HelpTextRow text="Extra CSS declarations appended to this element, for anything not covered above." />
        </SettingsGroup>

        <s-stack direction="inline" gap="tight">
          <button type="button" className="jm-ghost-btn" onClick={onDuplicate}>⧉ Duplicate</button>
          <button type="button" className="jm-ghost-btn" onClick={onBringToFront}>Bring to front</button>
          <button type="button" className="jm-ghost-btn" onClick={onSendToBack}>Send to back</button>
          <s-button variant="tertiary" onClick={onDelete}>Delete element</s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}

function HelpTextRow({ text }) {
  if (!text) return null;
  return <s-text tone="subdued">{text}</s-text>;
}

let elCounter = 0;
function newElementId(type) {
  elCounter += 1;
  return `el-${type}-${Date.now().toString(36)}${elCounter}`;
}

const EDITOR_CHROME_CSS = `
  .jm-field { display: block; }
  .jm-field__label { display: block; font-size: 12px; color: #4a4a4a; margin-bottom: 5px; }
  .jm-field__input {
    display: block; width: 100%; box-sizing: border-box; font: inherit; font-size: 13px;
    padding: 8px 11px; border: 1px solid #c9cccf; border-radius: 6px; background: #fff; color: #1a1a1a;
  }
  .jm-field__input:focus { outline: 2px solid #5c6ac4; outline-offset: -1px; border-color: #5c6ac4; }
  select.jm-field__input { cursor: pointer; }
  .jm-settings-group { padding: 16px 18px; background: #fafafb; border: 1px solid #ececec; border-radius: 10px; }
  .jm-toggle { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
  .jm-ghost-btn {
    font: inherit; font-size: 13px; cursor: pointer; background: #fff; border: 1px solid #c9cccf;
    border-radius: 6px; padding: 7px 12px; color: #1a1a1a;
  }
  .jm-ghost-btn:hover { background: #f6f6f7; }
  .jm-list-item { padding: 4px 0; }
  .jm-palette-item {
    display: block; width: 100%; text-align: left; font: inherit; cursor: pointer;
    background: #fff; border: 1px solid #e1e1e1; border-radius: 8px; padding: 10px 12px;
  }
  .jm-palette-item:hover { background: #f6f6f7; border-color: #ccc; }
`;

const ELEMENT_ICONS = { text: "📝", image: "🖼", button: "🔘", section: "▭", divider: "➖" };

function elementListLabel(el) {
  if (el.type === "text" || el.type === "button") return (el.text || (el.type === "button" ? "Button" : "Text")).slice(0, 24);
  if (el.type === "section") return "Section";
  if (el.type === "divider") return "Divider";
  return "Image";
}

function ElementList({ elements, selectedId, onSelect, onDelete, onDuplicate }) {
  return (
    <s-section heading="Elements">
      <s-stack direction="block" gap="base">
        {elements.length === 0 ? <s-paragraph>No elements yet — add one below.</s-paragraph> : null}
        {elements.map((el) => (
          <div key={el.id} className="jm-list-item">
            <s-stack direction="inline" gap="tight" style={{ alignItems: "center" }}>
              <s-button variant={el.id === selectedId ? "primary" : "tertiary"} onClick={() => onSelect(el.id)}>
                {ELEMENT_ICONS[el.type] ?? "🔘"} {elementListLabel(el)}
              </s-button>
              <s-button variant="tertiary" onClick={() => onDuplicate(el.id)}>⧉</s-button>
              <s-button variant="tertiary" onClick={() => onDelete(el.id)}>Delete</s-button>
            </s-stack>
          </div>
        ))}
      </s-stack>
    </s-section>
  );
}

// Shared by CanvasEditor and RawEditor — `getFields` returns the extra
// form fields ("mode" + whatever that mode needs) so each editor can pass
// its own current live state without this component knowing which mode
// it's in. Uses its own fetcher (not the Save/Reset one) so sending a test
// never fights with — or gets clobbered by — a Save in flight.
function TestSendControl({ triggerType, getFields }) {
  const fetcher = useFetcher();
  const [email, setEmail] = useState("");
  const sending = fetcher.state !== "idle";
  const result = fetcher.data?.intent === "test-send" ? fetcher.data : null;

  const send = () => {
    const formData = new FormData();
    formData.set("intent", "test-send");
    formData.set("triggerType", triggerType);
    formData.set("testEmail", email);
    for (const [key, value] of Object.entries(getFields())) formData.set(key, value);
    fetcher.submit(formData, { method: "POST" });
  };

  return (
    <s-stack direction="block" gap="tight">
      <s-stack direction="inline" gap="tight" style={{ alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="jm-field__input"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ maxWidth: 240 }}
          aria-label="Test email address"
        />
        <s-button variant="tertiary" disabled={sending || !email} onClick={send}>
          {sending ? "Sending…" : "✉ Send test email"}
        </s-button>
      </s-stack>
      {result ? (
        result.ok ? (
          <s-text tone="subdued">
            Sent to {result.testEmail} with sample data
            {result.devMode ? " — no SMTP configured, so check the server logs instead of an inbox." : "."}
          </s-text>
        ) : (
          <s-text tone="critical">{result.error}</s-text>
        )
      ) : null}
    </s-stack>
  );
}

function CanvasEditor({ initial, triggerType, fetcher }) {
  const [subject, setSubject] = useState(initial.subject);
  const [canvasWidth, setCanvasWidth] = useState(initial.canvasWidth);
  const [elements, setElements] = useState(initial.elements);
  const [selectedId, setSelectedId] = useState(initial.elements[0]?.id ?? null);
  const [srcDoc, setSrcDoc] = useState(() => buildSrcDoc(initial.elements, initial.canvasWidth));
  const iframeRef = useRef(null);

  // Structural changes (canvas width, switching trigger tab) rebuild the
  // iframe document from scratch; everything else (any element edit, drag)
  // pushes a live re-render over postMessage — see EDITOR_SCRIPT's
  // 'jm-email-render' handler — so typing in the settings panel never
  // reloads/flickers the preview.
  useEffect(() => {
    setSrcDoc(buildSrcDoc(elements, canvasWidth));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasWidth, triggerType]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: "jm-email-render", elements }, "*");
  }, [elements]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: "jm-email-select-external", id: selectedId }, "*");
  }, [selectedId]);

  useEffect(() => {
    function onMessage(e) {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      const msg = e.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "jm-email-select") {
        setSelectedId(msg.id);
      } else if (msg.type === "jm-email-drag-end") {
        setElements((prev) => prev.map((el) => (el.id === msg.id ? { ...el, x: msg.x, y: msg.y } : el)));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // `overrides` lets a palette shortcut (e.g. "Leave a review" below) add a
  // button/text/etc. pre-filled with specific content instead of always the
  // bare ELEMENT_DEFAULTS — still just a regular element afterwards, fully
  // editable/duplicable/deletable like any other.
  function addElement(type, overrides) {
    const id = newElementId(type);
    const el = { id, type, x: 20, y: 20, ...ELEMENT_DEFAULTS[type], ...overrides };
    // A section is a background box, meant to sit behind other elements, so
    // it's added at the back of the stack (same array position Send to back
    // moves an existing element to) instead of on top, covering everything.
    setElements((prev) => (type === "section" ? [el, ...prev] : [...prev, el]));
    setSelectedId(id);
  }

  function updateElement(id, patch) {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...patch } : el)));
  }

  function deleteElement(id) {
    setElements((prev) => prev.filter((el) => el.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  // Clones the element right after itself, offset a bit so the copy isn't
  // sitting exactly on top of the original (making it invisible until
  // dragged) — same "duplicate, then tweak" workflow as most canvas/design
  // tools, so a merchant doesn't have to rebuild an element from scratch
  // just to get a near-identical second one.
  function duplicateElement(id) {
    const original = elements.find((e) => e.id === id);
    if (!original) return;
    const copy = { ...original, id: newElementId(original.type), x: original.x + 20, y: original.y + 20 };
    const index = elements.findIndex((e) => e.id === id);
    setElements((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setSelectedId(copy.id);
  }

  function bringToFront(id) {
    setElements((prev) => {
      const el = prev.find((e) => e.id === id);
      if (!el) return prev;
      return [...prev.filter((e) => e.id !== id), el];
    });
  }

  function sendToBack(id) {
    setElements((prev) => {
      const el = prev.find((e) => e.id === id);
      if (!el) return prev;
      return [el, ...prev.filter((e) => e.id !== id)];
    });
  }

  const selected = elements.find((el) => el.id === selectedId) ?? null;
  const compiledHtml = useMemo(() => compileEmailLayoutHtml(elements, canvasWidth), [elements, canvasWidth]);

  const submit = (extraIntent) => {
    const formData = new FormData();
    formData.set("mode", "canvas");
    formData.set("triggerType", triggerType);
    formData.set("subject", subject);
    formData.set("canvasWidth", canvasWidth);
    formData.set("elements", JSON.stringify(elements));
    if (extraIntent) formData.set("intent", extraIntent);
    fetcher.submit(formData, { method: "POST" });
  };

  return (
    <s-stack direction="block" gap="loose">
      <Field label="Subject" value={subject} onChange={setSubject} />

      <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "flex-start", gap: 28, overflowX: "auto", paddingBottom: 4 }}>
        <div style={{ flex: "0 0 220px", minWidth: 190 }}>
          <s-section heading="Add element">
            <s-stack direction="block" gap="base">
              <button type="button" className="jm-palette-item" onClick={() => addElement("text")}>📝 Text</button>
              <button type="button" className="jm-palette-item" onClick={() => addElement("image")}>🖼 Image</button>
              <button type="button" className="jm-palette-item" onClick={() => addElement("button")}>🔘 Button (link)</button>
              <button
                type="button"
                className="jm-palette-item"
                onClick={() => addElement("button", { text: "Leave a review", href: "{{reviewUrl}}" })}
              >
                ⭐ Leave a review button
              </button>
              <button type="button" className="jm-palette-item" onClick={() => addElement("section")}>▭ Section (div)</button>
              <button type="button" className="jm-palette-item" onClick={() => addElement("divider")}>➖ Divider</button>
            </s-stack>
          </s-section>
          <div style={{ marginTop: 20 }}>
            <ElementList elements={elements} selectedId={selectedId} onSelect={setSelectedId} onDelete={deleteElement} onDuplicate={duplicateElement} />
          </div>
        </div>

        <div style={{ flex: "1 1 34%", minWidth: 280 }}>
          <s-section heading="Preview (click to select, drag to move)">
            <div style={{ marginBottom: 12 }}>
              {/* No live clamp on every keystroke — that used to snap the
                  value back mid-typing (e.g. clearing the field to type
                  "500" instantly reset to 280 after the first digit),
                  making it effectively impossible to type a new width. Any
                  number is accepted while typing; it's only clamped to
                  280–800 on blur and again on Save (see submit()) so the
                  compiled email/preview never gets a nonsensical width. */}
              <Field
                label="Canvas width"
                type="number"
                min={280}
                max={800}
                value={canvasWidth}
                onChange={setCanvasWidth}
                onBlur={() => setCanvasWidth((w) => Math.min(Math.max(Number(w) || DEFAULT_CANVAS_WIDTH, 280), 800))}
              />
            </div>
            <div style={{ border: "1px solid #ddd", borderRadius: 8, overflow: "hidden" }}>
              <iframe ref={iframeRef} title="Email preview" srcDoc={srcDoc} style={{ width: "100%", height: 420, border: "0", display: "block" }} />
            </div>
            <s-stack direction="inline" gap="base" style={{ marginTop: 14 }}>
              <s-button variant="primary" onClick={() => submit()}>Save</s-button>
              {initial.isCustom ? (
                <s-button
                  variant="tertiary"
                  onClick={() => {
                    if (confirm("Reset this email to its default template?")) submit("reset");
                  }}
                >
                  Reset to default
                </s-button>
              ) : null}
            </s-stack>
            <div style={{ marginTop: 16 }}>
              <TestSendControl
                triggerType={triggerType}
                getFields={() => ({ mode: "canvas", subject, canvasWidth, elements: JSON.stringify(elements) })}
              />
            </div>
          </s-section>

          <div style={{ marginTop: 20 }}>
            <s-section heading="Sent-email preview (compiled to email-safe HTML)">
              <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, overflow: "auto" }} dangerouslySetInnerHTML={{ __html: compiledHtml }} />
            </s-section>
          </div>
        </div>

        <div style={{ flex: "1 1 34%", minWidth: 300 }}>
          <ElementSettings
            element={selected}
            onChange={updateElement}
            onDelete={() => selected && deleteElement(selected.id)}
            onDuplicate={() => selected && duplicateElement(selected.id)}
            onBringToFront={() => selected && bringToFront(selected.id)}
            onSendToBack={() => selected && sendToBack(selected.id)}
          />
        </div>
      </div>

      <s-paragraph>Merge tokens (usable in any text/link/image field): {TOKENS.join(" ")}</s-paragraph>
    </s-stack>
  );
}

function RawEditor({ initial, triggerType, fetcher }) {
  // A trigger that's never been saved in Raw HTML mode has no `rawHtml` in
  // the DB (buildState() returns "" for it) — falling back to a hardcoded
  // placeholder there used to show completely different content than the
  // Canvas tab's own preview for the exact same trigger, which read as a
  // bug ("why did switching tabs wipe my email?") rather than two views of
  // the same thing. Compiling the *saved* canvas elements instead means
  // switching to Raw HTML always starts from what you were just looking
  // at — same content, same as the Canvas tab's own compiled-HTML preview
  // below — and you edit from there instead of from scratch.
  const [rawHtml, setRawHtml] = useState(() => initial.rawHtml || compileEmailLayoutHtml(initial.elements, initial.canvasWidth));
  const [subject, setSubject] = useState(initial.subject);

  const submit = (extraIntent) => {
    const formData = new FormData();
    formData.set("mode", "html");
    formData.set("triggerType", triggerType);
    formData.set("canvasWidth", initial.canvasWidth);
    formData.set("subject", subject);
    formData.set("rawHtml", rawHtml);
    if (extraIntent) formData.set("intent", extraIntent);
    fetcher.submit(formData, { method: "POST" });
  };

  return (
    <s-stack direction="block" gap="loose">
      <Field label="Subject" value={subject} onChange={setSubject} />
      <s-paragraph>
        Full control — write or paste any HTML/inline CSS. Tokens: {TOKENS.join(" ")}.
      </s-paragraph>
      <div>
        <span className="jm-field__label">Raw HTML</span>
        <textarea rows={16} value={rawHtml} onChange={(e) => setRawHtml(e.target.value)} style={{ width: "100%", padding: 10, marginTop: 6, boxSizing: "border-box", fontFamily: "monospace" }} />
      </div>
      <s-stack direction="inline" gap="base">
        <s-button variant="primary" onClick={() => submit()}>Save</s-button>
        {initial.isCustom ? (
          <s-button
            variant="tertiary"
            onClick={() => {
              if (confirm("Reset this email to its default template?")) submit("reset");
            }}
          >
            Reset to default
          </s-button>
        ) : null}
      </s-stack>
      <TestSendControl
        triggerType={triggerType}
        getFields={() => ({ mode: "html", subject, canvasWidth: initial.canvasWidth, rawHtml })}
      />
      <s-section heading="Preview">
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }} dangerouslySetInnerHTML={{ __html: rawHtml }} />
      </s-section>
    </s-stack>
  );
}

function TriggerEditor({ initial }) {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [mode, setMode] = useState(initial.mode);

  if (fetcher.data?.ok && fetcher.data.triggerType === initial.triggerType && fetcher.data.intent === "save") {
    shopify.toast.show("Email layout saved");
  }
  if (fetcher.data?.ok && fetcher.data.triggerType === initial.triggerType && fetcher.data.intent === "reset") {
    shopify.toast.show("Email layout reset to default");
  }

  const state = fetcher.data?.ok && fetcher.data.triggerType === initial.triggerType ? fetcher.data : initial;

  return (
    <s-section heading={TRIGGER_LABELS[initial.triggerType]}>
      <s-stack direction="inline" gap="base" style={{ marginBottom: 16 }}>
        <s-text>Editor:</s-text>
        <s-stack direction="inline" gap="tight">
          <s-button variant={mode === "canvas" ? "primary" : "tertiary"} onClick={() => setMode("canvas")}>Canvas (click &amp; drag)</s-button>
          <s-button variant={mode === "html" ? "primary" : "tertiary"} onClick={() => setMode("html")}>Raw HTML</s-button>
        </s-stack>
      </s-stack>

      {mode === "canvas" ? (
        <CanvasEditor key={`${initial.triggerType}-canvas`} initial={state} triggerType={initial.triggerType} fetcher={fetcher} />
      ) : (
        <RawEditor key={`${initial.triggerType}-html`} initial={state} triggerType={initial.triggerType} fetcher={fetcher} />
      )}
    </s-section>
  );
}

export default function EmailBuilder() {
  const { layouts } = useLoaderData();

  return (
    <s-page heading="Email builder" inlineSize="large">
      <style>{EDITOR_CHROME_CSS}</style>
      <s-paragraph>
        Click <strong>Add element</strong> to drop text, an image, or a
        button/link onto the canvas, then click it (in the preview or the
        Elements list) to select it and drag it anywhere — free positioning,
        per-element color, size, bold/underline, and link styling, exactly
        like the review widget builder. On save this compiles to table-based
        HTML that actually renders correctly in real inboxes (Outlook and
        friends don&apos;t support free-position CSS). Prefer to write the whole
        email by hand instead? Switch a trigger below to <strong>Raw HTML</strong>.
      </s-paragraph>
      {layouts.map((layout) => (
        <TriggerEditor key={layout.triggerType} initial={layout} />
      ))}
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
