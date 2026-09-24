// app/routes/app.review-form-editor.jsx — visual, click-to-select builder
// for the "write a review" form page (ReviewFormTheme), built the same way
// as app.widget-editor.jsx: a live <iframe> preview a vendor clicks directly
// to select a piece of the form (or picks one from the left-hand list), and
// a settings panel with real controls (size, spacing, typography, color,
// placement) that write {target, property, value} style-block rows, same
// shape/compiler (reviewFormStyleCompiler.ts) as before this page was split.
//
// Simpler than the widget editor on purpose: the write form has a fixed,
// non-repeating structure (no review-card block tree to walk, add to, or
// reparent within) — reviewWidget/sections/writeForm.ts's 5 targets are
// always exactly the same 5 pieces, so the sidebar is a flat list, not a
// tree, and there's no block palette/"+Add" here. Raw HTML/CSS editing of
// the underlying template lives on its own page now —
// /app/review-form-style — exact split from app.widget-editor.jsx/
// app.widget-style.jsx.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { DEFAULT_REVIEW_FORM_HTML, renderReviewFormHtml } from "../reviewWidget/reviewFormTemplate";
import { WRITE_FORM_DEFAULT_CSS as DEFAULT_REVIEW_FORM_CSS } from "../reviewWidget/sections/writeForm";
import { compileReviewFormStyleBlocks, REVIEW_FORM_TARGETS } from "../reviewWidget/reviewFormStyleCompiler";
import {
  writeFormSection,
  writeFormHeadingSection,
  writeFormStarsFilledSection,
  writeFormStarsSection,
  writeFormInputSection,
  writeFormSubmitSection,
} from "../reviewWidget/sections/writeForm";
import { PROPERTIES } from "../reviewWidget/styleCatalog";
import { SIZE_UNITS, parseSizeValue, formatSizeValue, parseBoxValue, formatBoxValue } from "../reviewWidget/sections/controls";

// Same order as REVIEW_FORM_TARGETS (reviewFormStyleCompiler.ts) — filled
// star before empty star, since the filled selector is a strict subset of
// the empty one and the iframe click-resolver below takes the first match.
const TARGET_SECTIONS = [writeFormSection, writeFormHeadingSection, writeFormStarsFilledSection, writeFormStarsSection, writeFormInputSection, writeFormSubmitSection];

const PREVIEW_DATA = { productTitle: "Sample Product", productImageUrl: null };

function buildState(theme) {
  return {
    html: theme?.html ?? DEFAULT_REVIEW_FORM_HTML,
    css: theme?.css ?? DEFAULT_REVIEW_FORM_CSS,
    styleBlocks: Array.isArray(theme?.styleBlocks) ? theme.styleBlocks : [],
    isCustom: Boolean(theme),
  };
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return buildState(null);

  const theme = await db.reviewFormTheme.findUnique({ where: { shopId: shop.id } });
  return buildState(theme);
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { ok: false };

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "reset") {
    await db.reviewFormTheme.deleteMany({ where: { shopId: shop.id } });
    return { ok: true, intent, ...buildState(null) };
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

  const theme = await db.reviewFormTheme.upsert({
    where: { shopId: shop.id },
    create: { shopId: shop.id, html, css, styleBlocks },
    update: { html, css, styleBlocks },
  });

  return { ok: true, intent: "save-editor", html: theme.html, css: theme.css, styleBlocks: theme.styleBlocks, isCustom: true };
};

// Runs inside the iframe — same technique as app.widget-editor.jsx's
// EDITOR_SCRIPT (hover shows a dashed outline + name chip, click selects
// with a solid one, drag repositions a "Free position" element), simplified
// since there's no block tree to walk: __TARGETS__ is a flat
// {value, label, selector} list checked in order, first match wins.
const EDITOR_SCRIPT = `
(function () {
  var TARGETS = __TARGETS__;
  var selectedEl = null;
  var hoveredEl = null;

  function resolveTarget(start) {
    var node = start;
    while (node && node !== document.body && node.nodeType === 1) {
      for (var i = 0; i < TARGETS.length; i++) {
        if (node.matches && node.matches(TARGETS[i].selector)) {
          return { el: node, styleTarget: TARGETS[i].value, label: TARGETS[i].label };
        }
      }
      node = node.parentElement;
    }
    return null;
  }

  var selectedBadge = document.createElement('div');
  selectedBadge.className = 'jm-editor-badge jm-editor-badge--selected';
  var hoverBadge = document.createElement('div');
  hoverBadge.className = 'jm-editor-badge jm-editor-badge--hover';
  document.body.appendChild(selectedBadge);
  document.body.appendChild(hoverBadge);

  function place(badge, el, text) {
    if (!el || !text) { badge.style.display = 'none'; return; }
    var rect = el.getBoundingClientRect();
    badge.textContent = text;
    badge.style.left = Math.max(0, rect.left + window.scrollX) + 'px';
    badge.style.top = Math.max(0, rect.top + window.scrollY - 18) + 'px';
    badge.style.display = 'block';
  }

  var dragState = null;
  var suppressClick = false;

  document.addEventListener('mousedown', function (e) {
    var res = resolveTarget(e.target);
    if (!res || res.el !== selectedEl) return;
    if (window.getComputedStyle(res.el).position !== 'absolute') return;
    e.preventDefault();
    var cs = window.getComputedStyle(res.el);
    dragState = {
      el: res.el,
      styleTarget: res.styleTarget,
      startX: e.clientX,
      startY: e.clientY,
      startTop: parseFloat(cs.top) || res.el.offsetTop,
      startLeft: parseFloat(cs.left) || res.el.offsetLeft,
      moved: false,
    };
  }, true);

  document.addEventListener('mousemove', function (e) {
    if (!dragState) return;
    var dx = e.clientX - dragState.startX;
    var dy = e.clientY - dragState.startY;
    if (!dragState.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    dragState.moved = true;
    var newTop = Math.round(dragState.startTop + dy);
    var newLeft = Math.round(dragState.startLeft + dx);
    dragState.el.style.top = newTop + 'px';
    dragState.el.style.left = newLeft + 'px';
    dragState.el.style.right = 'auto';
    dragState.el.style.bottom = 'auto';
    place(selectedBadge, dragState.el, selectedBadge.textContent);
  });

  document.addEventListener('mouseup', function () {
    if (!dragState) return;
    if (dragState.moved) {
      suppressClick = true;
      parent.postMessage({ type: 'jm-drag-end', styleTarget: dragState.styleTarget, top: dragState.el.style.top, left: dragState.el.style.left }, '*');
    }
    dragState = null;
  });

  function selectorForTarget(styleTarget) {
    for (var i = 0; i < TARGETS.length; i++) {
      if (TARGETS[i].value === styleTarget) return TARGETS[i].selector;
    }
    return null;
  }

  function selectByActive(styleTarget) {
    var selector = selectorForTarget(styleTarget);
    var el = selector ? document.querySelector(selector) : null;
    if (selectedEl) selectedEl.classList.remove('jm-editor-selected');
    selectedEl = el;
    if (selectedEl) {
      var t = TARGETS.filter(function (t) { return t.value === styleTarget; })[0];
      selectedEl.classList.add('jm-editor-selected');
      place(selectedBadge, selectedEl, t ? t.label : styleTarget);
    } else {
      selectedBadge.style.display = 'none';
    }
  }

  document.addEventListener('click', function (e) {
    e.preventDefault();
    if (suppressClick) { suppressClick = false; return; }
    var res = resolveTarget(e.target);
    if (selectedEl) selectedEl.classList.remove('jm-editor-selected');
    if (!res) {
      selectedEl = null;
      selectedBadge.style.display = 'none';
      parent.postMessage({ type: 'jm-select', styleTarget: null }, '*');
      return;
    }
    selectedEl = res.el;
    selectedEl.classList.add('jm-editor-selected');
    place(selectedBadge, selectedEl, res.label);
    parent.postMessage({ type: 'jm-select', styleTarget: res.styleTarget }, '*');
  }, true);

  document.addEventListener('mouseover', function (e) {
    var res = resolveTarget(e.target);
    if (hoveredEl) hoveredEl.classList.remove('jm-editor-hover');
    hoveredEl = res && res.el !== selectedEl ? res.el : null;
    if (hoveredEl) {
      hoveredEl.classList.add('jm-editor-hover');
      place(hoverBadge, hoveredEl, res.label);
    } else {
      hoverBadge.style.display = 'none';
    }
  }, true);

  document.addEventListener('mouseout', function () {
    if (hoveredEl) hoveredEl.classList.remove('jm-editor-hover');
    hoveredEl = null;
    hoverBadge.style.display = 'none';
  }, true);

  window.addEventListener('scroll', function () {
    if (selectedEl) place(selectedBadge, selectedEl, selectedBadge.textContent);
  }, true);

  window.addEventListener('message', function (e) {
    var msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'jm-set-style') {
      var tag = document.getElementById('jm-live-style');
      if (tag) tag.textContent = msg.css;
      requestAnimationFrame(reportHeight);
    } else if (msg.type === 'jm-select-external') {
      selectByActive(msg.styleTarget);
    }
  });

  function reportHeight() {
    parent.postMessage({ type: 'jm-resize', height: document.body.scrollHeight }, '*');
  }
  new ResizeObserver(reportHeight).observe(document.body);
  reportHeight();
})();
`;

function buildSrcDoc({ formHtml, css, targets }) {
  const script = EDITOR_SCRIPT.replace("__TARGETS__", JSON.stringify(targets));
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; padding: 20px; font-family: -apple-system, system-ui, sans-serif; background: #f6f6f7; }
  .jm-editor-selected { outline: 2px solid #5c6ac4 !important; outline-offset: 2px; }
  .jm-editor-hover { outline: 2px dashed #8a8a8a !important; outline-offset: 2px; }
  .jm-write-review * { cursor: pointer; }
  .jm-editor-badge { position: absolute; z-index: 9999; font: 600 11px/1.4 -apple-system, sans-serif; padding: 2px 6px; border-radius: 4px; pointer-events: none; display: none; white-space: nowrap; }
  .jm-editor-badge--selected { background: #5c6ac4; color: #fff; }
  .jm-editor-badge--hover { background: #8a8a8a; color: #fff; }
</style>
<style id="jm-live-style">${css}</style>
</head>
<body>
${formHtml}
<script>${script}<\/script>
</body>
</html>`;
}

// Plain native <input>/<select>, not Shopify's <s-text-field>/<s-select> —
// same reliability reason app.widget-editor.jsx's Field/NativeSelect use
// them (see that file's long comment on its Field component).
function Field({ label, value, placeholder, onChange, hideLabel, type = "text", min, max, step }) {
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
        onChange={(e) => onChange(e.target.value)}
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

function SizeField({ label, hideLabel, value, placeholder, units, onChange }) {
  const { num, unit } = parseSizeValue(value);
  return (
    <div className="jm-size-field">
      {!hideLabel ? <span className="jm-field__label">{label}</span> : null}
      <div className="jm-size-field__row">
        <input
          className="jm-field__input jm-size-field__number"
          type="number"
          step="any"
          value={num}
          placeholder={placeholder || "0"}
          onChange={(e) => onChange(formatSizeValue(e.target.value, unit))}
          aria-label={label}
        />
        <select
          className="jm-field__input jm-size-field__unit"
          value={unit}
          onChange={(e) => onChange(formatSizeValue(num === "" ? "0" : num, e.target.value))}
          aria-label={`${label} unit`}
        >
          {(units || SIZE_UNITS).map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function HelpText({ text }) {
  if (!text) return null;
  return <s-text tone="subdued">{text}</s-text>;
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function ControlField({ control, getVal, setVal }) {
  if (control.showIf && !control.showIf(getVal)) return null;
  const value = getVal(control.property, control.target);
  const onChange = (v) => {
    setVal(control.property, v, control.target);
    control.onSet?.(v, (property, val, target) => setVal(property, val, target ?? control.target));
  };

  if (control.type === "size") {
    return (
      <div>
        <SizeField label={control.label} value={value} placeholder={control.placeholder} units={control.units} onChange={onChange} />
        <HelpText text={control.helpText} />
      </div>
    );
  }

  if (control.type === "box") {
    const sides = parseBoxValue(value);
    const sideLabels = ["Top", "Right", "Bottom", "Left"];
    const setSide = (i, sideValue) => {
      const next = [...sides];
      next[i] = sideValue;
      onChange(formatBoxValue(next));
    };
    return (
      <div>
        <span className="jm-field__label">{control.label}</span>
        <div className="jm-box-grid">
          {sideLabels.map((label, i) => (
            <SizeField key={label} label={label} value={sides[i]} units={control.units} onChange={(v) => setSide(i, v)} />
          ))}
        </div>
        <HelpText text={control.helpText} />
      </div>
    );
  }

  if (control.type === "select") {
    const hasEmptyOption = control.options.some((o) => o.value === "");
    const options = hasEmptyOption ? control.options : [{ value: "", label: "Default" }, ...control.options];
    return (
      <div>
        <NativeSelect label={control.label} value={value} options={options} onChange={onChange} />
        <HelpText text={control.helpText} />
      </div>
    );
  }

  if (control.type === "color") {
    const swatchValue = HEX_RE.test(value) ? value : "#000000";
    return (
      <div>
        <s-text>{control.label}</s-text>
        <s-stack direction="inline" gap="tight" style={{ alignItems: "center", marginTop: 4 }}>
          <input
            type="color"
            value={swatchValue}
            onChange={(e) => onChange(e.target.value)}
            title={control.label}
            style={{ width: 36, height: 36, padding: 0, border: "1px solid #ccc", borderRadius: 6, cursor: "pointer", background: "none", flexShrink: 0 }}
          />
          <div style={{ flex: 1 }}>
            <Field label={control.label} value={value} placeholder={control.placeholder || "e.g. #1a1a1a"} onChange={onChange} hideLabel />
          </div>
        </s-stack>
        <HelpText text={control.helpText} />
      </div>
    );
  }

  if (control.type === "image") {
    const urlValue = (value.match(/url\((.*)\)/)?.[1] || "").replace(/^["']|["']$/g, "");
    return (
      <div>
        <Field
          label={control.label}
          value={urlValue}
          placeholder="https://..."
          onChange={(v) => {
            setVal("background-image", v ? `url("${v}")` : "", control.target);
            if (v) {
              setVal("background-size", "cover", control.target);
              setVal("background-position", "center", control.target);
            }
          }}
        />
        <HelpText text={control.helpText} />
      </div>
    );
  }

  return (
    <div>
      <Field label={control.label} value={value} placeholder={control.placeholder} onChange={onChange} />
      <HelpText text={control.helpText} />
    </div>
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

function SettingsPanel({ selectedTarget, styleBlocks, setStyleBlocks }) {
  const selected = TARGET_SECTIONS.find((s) => s.target === selectedTarget) ?? null;

  const getVal = (property, controlTarget) => {
    const t = controlTarget || selectedTarget;
    return styleBlocks.find((b) => b.target === t && b.property === property)?.value ?? "";
  };
  const setVal = (property, value, controlTarget) => {
    const t = controlTarget || selectedTarget;
    setStyleBlocks((all) => {
      const idx = all.findIndex((b) => b.target === t && b.property === property);
      if (!value) return idx === -1 ? all : all.filter((_, i) => i !== idx);
      if (idx === -1) return [...all, { target: t, property, value }];
      return all.map((b, i) => (i === idx ? { ...b, value } : b));
    });
  };

  const rows = styleBlocks.map((b, i) => ({ ...b, i })).filter((b) => b.target === selectedTarget);
  const addRow = () => setStyleBlocks((all) => [...all, { target: selectedTarget, property: PROPERTIES[0].value, value: "" }]);
  const removeRow = (i) => setStyleBlocks((all) => all.filter((_, idx) => idx !== i));
  const setRow = (i, field, value) => setStyleBlocks((all) => all.map((b, idx) => (idx === i ? { ...b, [field]: value } : b)));

  if (!selected) {
    return (
      <s-section heading="Settings">
        <s-paragraph>Click any piece of the form in the preview, or pick one from the list, to edit it.</s-paragraph>
      </s-section>
    );
  }

  const controlGroups = [];
  for (const c of selected.controls) {
    const heading = c.group || "Settings";
    let bucket = controlGroups.find((g) => g.heading === heading);
    if (!bucket) {
      bucket = { heading, items: [] };
      controlGroups.push(bucket);
    }
    bucket.items.push(c);
  }

  return (
    <s-stack direction="block" gap="base">
      <s-section heading={`Settings — ${selected.icon} ${selected.label}`}>
        <s-stack direction="block" gap="loose">
          {controlGroups.length === 0 ? (
            <s-paragraph>This element has no dedicated settings — use Advanced below for any raw CSS property.</s-paragraph>
          ) : null}
          {controlGroups.map((g) => (
            <SettingsGroup key={g.heading} heading={g.heading}>
              {g.items.map((c) => (
                <ControlField key={c.key} control={c} getVal={getVal} setVal={setVal} />
              ))}
            </SettingsGroup>
          ))}
        </s-stack>
      </s-section>

      <s-section heading="Advanced: custom CSS properties">
        <s-stack direction="block" gap="tight">
          {rows.length === 0 ? <s-paragraph>No custom properties set on this element yet.</s-paragraph> : null}
          {rows.map((row) => {
            const property = PROPERTIES.find((p) => p.value === row.property);
            return (
              <s-stack key={row.i} direction="inline" gap="tight">
                <NativeSelect
                  label="Style"
                  hideLabel
                  value={row.property}
                  options={PROPERTIES.map((p) => ({ value: p.value, label: p.label }))}
                  onChange={(v) => setRow(row.i, "property", v)}
                />
                <Field label="Value" hideLabel value={row.value} placeholder={property?.hint || "value"} onChange={(v) => setRow(row.i, "value", v)} />
                <s-button variant="tertiary" onClick={() => removeRow(row.i)}>Remove</s-button>
              </s-stack>
            );
          })}
          <s-button onClick={addRow}>+ Add custom property</s-button>
        </s-stack>
      </s-section>
    </s-stack>
  );
}

const EDITOR_CHROME_CSS = `
  .jm-settings-group { padding: 12px 14px; background: #fafafb; border: 1px solid #ececec; border-radius: 8px; }
  .jm-field { display: block; }
  .jm-field__label { display: block; font-size: 12px; color: #4a4a4a; margin-bottom: 3px; }
  .jm-field__input {
    display: block; width: 100%; box-sizing: border-box; font: inherit; font-size: 13px;
    padding: 7px 10px; border: 1px solid #c9cccf; border-radius: 6px; background: #fff; color: #1a1a1a;
  }
  .jm-field__input:focus { outline: 2px solid #5c6ac4; outline-offset: -1px; border-color: #5c6ac4; }
  select.jm-field__input { cursor: pointer; }
  .jm-size-field { display: block; }
  .jm-size-field__row { display: flex; gap: 8px; }
  .jm-size-field__number { flex: 1 1 auto; min-width: 0; }
  .jm-size-field__unit { flex: 0 0 68px; }
  .jm-box-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px;
    padding: 10px; margin-top: 4px; background: #fff; border: 1px solid #ececec; border-radius: 6px;
  }
  .jm-sidebar-item { display: block; width: 100%; }
`;

export default function ReviewFormEditor() {
  const loaderData = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const iframeRef = useRef(null);

  const [html] = useState(loaderData.html);
  const [css] = useState(loaderData.css);
  const [styleBlocks, setStyleBlocks] = useState(loaderData.styleBlocks);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [srcDoc, setSrcDoc] = useState("");
  const [dirty, setDirty] = useState(false);
  const [previewHeight, setPreviewHeight] = useState(420);

  const targetsForIframe = useMemo(() => REVIEW_FORM_TARGETS.map((t) => ({ value: t.value, label: t.label, selector: t.selector })), []);
  const formHtml = useMemo(() => renderReviewFormHtml(html, PREVIEW_DATA), [html]);

  useEffect(() => {
    setSrcDoc(buildSrcDoc({ formHtml, css, targets: targetsForIframe }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const liveCss = [css, compileReviewFormStyleBlocks(styleBlocks)].filter(Boolean).join("\n\n");
    iframeRef.current?.contentWindow?.postMessage({ type: "jm-set-style", css: liveCss }, "*");
    setDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleBlocks]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: "jm-select-external", styleTarget: selectedTarget }, "*");
  }, [selectedTarget]);

  useEffect(() => {
    function onMessage(e) {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      const msg = e.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "jm-select") {
        setSelectedTarget(msg.styleTarget);
      } else if (msg.type === "jm-resize" && typeof msg.height === "number") {
        setPreviewHeight(Math.min(900, Math.max(220, msg.height + 4)));
      } else if (msg.type === "jm-drag-end") {
        const target = msg.styleTarget;
        if (!target) return;
        const writes = [
          ["top", msg.top],
          ["left", msg.left],
          ["right", "auto"],
          ["bottom", "auto"],
        ];
        setStyleBlocks((all) => {
          let next = all;
          for (const [property, value] of writes) {
            const idx = next.findIndex((b) => b.target === target && b.property === property);
            if (idx === -1) next = [...next, { target, property, value }];
            else next = next.map((b, i) => (i === idx ? { ...b, value } : b));
          }
          return next;
        });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (fetcher.data?.ok && fetcher.data.intent === "save-editor") shopify.toast.show("Review form saved");

  useEffect(() => {
    if (!(fetcher.data?.ok && fetcher.data.intent === "reset")) return;
    shopify.toast.show("Review form reset to default");
    setStyleBlocks([]);
    setSelectedTarget(null);
    setDirty(false);
    setSrcDoc(buildSrcDoc({ formHtml: renderReviewFormHtml(fetcher.data.html, PREVIEW_DATA), css: fetcher.data.css, targets: targetsForIframe }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  const save = () => {
    const formData = new FormData();
    formData.set("intent", "save-editor");
    formData.set("html", html);
    formData.set("css", css);
    formData.set("styleBlocksJson", JSON.stringify(styleBlocks));
    fetcher.submit(formData, { method: "POST" });
    setDirty(false);
  };

  const reset = () => {
    if (!confirm("Reset the review form to default? This discards all visual customizations.")) return;
    const formData = new FormData();
    formData.set("intent", "reset");
    fetcher.submit(formData, { method: "POST" });
  };

  return (
    <s-page heading="Review form builder" inlineSize="large">
      <style>{EDITOR_CHROME_CSS}</style>
      <s-section heading="Click-to-select review form editor">
        <s-paragraph>
          Hover then click any piece of the form directly in the preview (a
          dashed outline + name chip shows what you&apos;re about to select, a
          solid one shows what&apos;s selected), or pick one from the list on the
          left — heading, star picker (filled and empty stars are separate,
          each with its own color), text fields, submit button. Edits compile
          to plain CSS, same as the{" "}
          <s-link href="/app/review-form-style">raw template editor</s-link>.
        </s-paragraph>
      </s-section>

      <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "flex-start", gap: 24, overflowX: "auto", paddingBottom: 4 }}>
        <div style={{ flex: "0 0 220px", minWidth: 190 }}>
          <s-section heading="Form pieces">
            <s-stack direction="block" gap="tight">
              {TARGET_SECTIONS.map((s) => (
                <s-button
                  key={s.target}
                  className="jm-sidebar-item"
                  variant={selectedTarget === s.target ? "primary" : "tertiary"}
                  onClick={() => setSelectedTarget(s.target)}
                >
                  {s.icon} {s.label}
                </s-button>
              ))}
            </s-stack>
          </s-section>
        </div>

        <div style={{ flex: "1 1 34%", minWidth: 280 }}>
          <s-section heading="Preview (hover, then click to select)">
            <div style={{ border: "1px solid #ddd", borderRadius: 8, overflow: "hidden" }}>
              <iframe
                ref={iframeRef}
                title="Review form preview"
                srcDoc={srcDoc}
                style={{ width: "100%", height: previewHeight, border: "0", display: "block", transition: "height 120ms ease" }}
              />
            </div>
            <s-stack direction="inline" gap="tight" style={{ marginTop: 8 }}>
              <s-button variant="primary" onClick={save} disabled={!dirty && !!loaderData.isCustom}>Save</s-button>
              {loaderData.isCustom || dirty ? (
                <s-button variant="tertiary" onClick={reset}>Reset to default</s-button>
              ) : null}
            </s-stack>
          </s-section>
        </div>

        <div style={{ flex: "1 1 34%", minWidth: 300 }}>
          <SettingsPanel selectedTarget={selectedTarget} styleBlocks={styleBlocks} setStyleBlocks={setStyleBlocks} />
        </div>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
