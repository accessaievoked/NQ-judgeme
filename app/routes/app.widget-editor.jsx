// app/routes/app.widget-editor.jsx — visual, Shopify-theme-editor-style
// builder for the storefront review widget, on top of the same
// WidgetTheme/style-blocks system as app.widget-style.jsx (that page's raw
// HTML/CSS + dropdown-driven blocks are still there for full control; this
// page is a click-on-the-live-preview alternative for the same data).
//
// How it works: the fixed default template (defaults.server.ts) is rendered
// with sample data into an <iframe>. Every element the editor understands —
// the fixed ones from reviewWidget/styleCatalog.ts (TARGETS, e.g. the
// summary bar and the reviews list wrapper) plus every block inside the
// review-item template (reviewWidget/blockTypes.ts, tagged
// with `data-jm-block`/`data-jm-block-type`) — is selectable, either by
// clicking it in the preview (hover shows a dashed outline + name chip first,
// so it's always clear what you're about to select) or by picking it from
// the left-hand section/block tree (mirroring Shopify's theme editor: a
// "Widget" group of fixed pieces plus a "Review card" tree you can nest,
// reorder and reparent blocks within).
//
// Selecting an element opens a settings panel on the right, and every field
// in it comes from that selection's own module in reviewWidget/sections/ —
// each section/block declares a `controls` array (its controller: which
// fields it needs, what CSS property each writes, any options/side effects)
// via controlsForTarget/controlsForBlockType (sections/index.ts). This file
// never hardcodes which fields a given section gets — it just resolves the
// controller for whatever's selected and renders it generically (see
// ControlField below), grouping controls under whatever heading each one
// declares (control.group). Every control still just reads/writes a style-
// block row ({target, property, value}), same shape the old editor saved,
// so the output is still plain compiled CSS — there's no new JSON settings
// schema. The "Advanced" section at the bottom edits that exact array
// directly for full, un-abstracted control (any CSS property, not just the
// ones with a dedicated control).
//
// Blocks live inside the <!--ITEM--> template, not appended after it: a
// block is the mapping applied to every review (stars/title/body/author/
// avatar/verified all resolve from the same review data every real review
// gets rendered with), so the editor only ever needs to show — and let you
// build — ONE sample of it; the preview renders it twice (two sample
// reviews) so list/grid layout changes are visible immediately, same as a
// real storefront with multiple reviews. The review-item wrapper itself is
// a "container" (Section) block; "+ Add" drops a new typed block inside
// whichever container is currently selected (or the item wrapper, by
// default), giving real nesting since the block tree *is* the HTML tree, no
// separate JSON block tree needed. "Move into" / up / down let you reparent
// and reorder that same tree without leaving the settings panel.
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
import { TARGETS, PROPERTIES, TARGET_ICONS } from "../reviewWidget/styleCatalog";
import { BLOCK_TYPES, blockTypeFor } from "../reviewWidget/blockTypes";
import { controlsForTarget, controlsForBlockType } from "../reviewWidget/sections/index";
import { SIZE_UNITS, parseSizeValue, formatSizeValue, parseBoxValue, formatBoxValue } from "../reviewWidget/sections/controls";
import { invalidateShopReviewCache } from "../reviewWidget/reviewCache.server";

// Two sample reviews, both rendered in the preview (renderWidgetHtml maps
// the same <!--ITEM--> template over every review, so editing the one
// template updates both cards here exactly like it would with real reviews)
// so list/grid layout changes on the "list" wrapper are visible immediately.
const PREVIEW_DATA = {
  count: 2,
  average: 4.5,
  reviews: [
    { rating: 5, title: "Love it", body: "Exactly what I needed.", authorName: "Jordan", verifiedBuyer: true, customer: null },
    { rating: 4, title: "Pretty good", body: "Would buy again.", authorName: null, customer: { firstName: "Sam", lastName: "R." } },
  ],
};

// A "no reviews yet" scenario, so the empty-state text/styling is just as
// easy to preview/edit as the with-reviews one — see the preview-mode
// toggle in the toolbar.
const EMPTY_PREVIEW_DATA = { count: 0, average: null, reviews: [] };

const ITEM_RE = /<!--ITEM-->([\s\S]*?)<!--\/ITEM-->/;
// Fixed targets that are really part of the review-item tree (rendered by
// the dynamic block walker below) — hidden from the "Widget" fixed-target
// list so each one only shows up once in the sidebar.
const ITEM_TARGET_VALUES = new Set(["item", "item-stars", "item-title", "item-body", "item-author"]);
// "avatar-initials" isn't browsable on its own — it only exists so the
// Avatar block's controls can write to it (see sections/blocks/avatar.ts).
const WIDGET_TARGETS = TARGETS.filter((t) => !ITEM_TARGET_VALUES.has(t.value) && t.value !== "avatar-initials");

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
    await invalidateShopReviewCache(shop.id);
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
  await invalidateShopReviewCache(shop.id);

  return { ok: true, intent: "save-editor", html: theme.html, css: theme.css, styleBlocks: theme.styleBlocks, isCustom: true };
};

// Runs inside the iframe. Kept as a plain string (not a module) since it's
// injected via srcDoc — __TARGETS__/__LABELS__ are replaced with JSON before
// injection. Tracks two separate elements: the persistent selection and a
// transient hover, each with its own outline + floating name chip, so it's
// always clear what's selected vs. what you're about to click.
const EDITOR_SCRIPT = `
(function () {
  var TARGETS = __TARGETS__;
  var LABELS = __LABELS__;
  var selectedEl = null;
  var hoveredEl = null;

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

  function labelForRes(res) {
    if (!res) return '';
    if (res.blockType && LABELS.blocks[res.blockType]) return LABELS.blocks[res.blockType];
    return LABELS.targets[res.styleTarget] || res.styleTarget || '';
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

  // "Free position" blocks (position: absolute, set via the Placement
  // control) can be dragged directly here instead of only typing Top/Left —
  // only when the mousedown target IS the already-selected element (never a
  // hover/click-to-select), so dragging never fights with picking something
  // new. A real drag (moved more than a couple px) suppresses the click
  // handler's own selection logic below, since mouseup always fires a click
  // right after — otherwise every drag would immediately re-trigger a
  // select/deselect on release.
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
      blockId: res.blockId,
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
      parent.postMessage({
        type: 'jm-drag-end',
        blockId: dragState.blockId,
        styleTarget: dragState.styleTarget,
        top: dragState.el.style.top,
        left: dragState.el.style.left,
      }, '*');
    }
    dragState = null;
  });

  function selectorForTarget(styleTarget) {
    for (var i = 0; i < TARGETS.length; i++) {
      if (TARGETS[i].value === styleTarget) return TARGETS[i].selector;
    }
    return null;
  }

  // Called when the sidebar (not a click inside this iframe) changes the
  // selection — a tree block has a blockId (its unique data-jm-block id,
  // matched via [data-jm-block="..."]), but a fixed piece (summary bar,
  // reviews list, ...) only has a styleTarget, matched via its TARGETS
  // selector instead. Either way, only the one matching element gets the
  // border — never its section/ancestor.
  function selectByActive(blockId, styleTarget) {
    var el = blockId
      ? document.querySelector('[data-jm-block="' + blockId + '"]')
      : (selectorForTarget(styleTarget) ? document.querySelector(selectorForTarget(styleTarget)) : null);
    if (selectedEl) selectedEl.classList.remove('jm-editor-selected');
    selectedEl = el;
    if (selectedEl) {
      var label = blockId ? (LABELS.blocks[selectedEl.getAttribute('data-jm-block-type')] || blockId) : (LABELS.targets[styleTarget] || styleTarget);
      selectedEl.classList.add('jm-editor-selected');
      place(selectedBadge, selectedEl, label);
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
      parent.postMessage({ type: 'jm-select', styleTarget: null, blockId: null, blockType: null }, '*');
      return;
    }
    selectedEl = res.el;
    selectedEl.classList.add('jm-editor-selected');
    place(selectedBadge, selectedEl, labelForRes(res));
    parent.postMessage({ type: 'jm-select', styleTarget: res.styleTarget, blockId: res.blockId, blockType: res.blockType }, '*');
  }, true);

  document.addEventListener('mouseover', function (e) {
    var res = resolveTarget(e.target);
    if (hoveredEl) hoveredEl.classList.remove('jm-editor-hover');
    hoveredEl = res && res.el !== selectedEl ? res.el : null;
    if (hoveredEl) {
      hoveredEl.classList.add('jm-editor-hover');
      place(hoverBadge, hoveredEl, labelForRes(res));
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
      selectByActive(msg.blockId, msg.styleTarget);
    }
  });

  // No fixed iframe height: report actual content height so the preview
  // never shows a big empty gap below a couple of short review cards (or
  // clips a tall one) — see the parent's "jm-resize" listener.
  function reportHeight() {
    parent.postMessage({ type: 'jm-resize', height: document.body.scrollHeight }, '*');
  }
  new ResizeObserver(reportHeight).observe(document.body);
  reportHeight();
})();
`;

function buildSrcDoc({ baseHtmlRendered, css, targets, labels }) {
  const script = EDITOR_SCRIPT.replace("__TARGETS__", JSON.stringify(targets)).replace("__LABELS__", JSON.stringify(labels));
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; padding: 20px; font-family: -apple-system, system-ui, sans-serif; background: #f6f6f7; }
  [data-jm-block-type="container"] { min-height: 1.5em; }
  .jm-editor-selected { outline: 2px solid #5c6ac4 !important; outline-offset: 2px; }
  .jm-editor-hover { outline: 2px dashed #8a8a8a !important; outline-offset: 2px; }
  .jm-reviews * { cursor: pointer; }
  .jm-editor-badge { position: absolute; z-index: 9999; font: 600 11px/1.4 -apple-system, sans-serif; padding: 2px 6px; border-radius: 4px; pointer-events: none; display: none; white-space: nowrap; }
  .jm-editor-badge--selected { background: #5c6ac4; color: #fff; }
  .jm-editor-badge--hover { background: #8a8a8a; color: #fff; }
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

// { targets: {value: label}, blocks: {type: label} } for the iframe's hover/
// selection name chips (see EDITOR_SCRIPT above).
const IFRAME_LABELS = {
  targets: Object.fromEntries(TARGETS.map((t) => [t.value, t.label])),
  blocks: Object.fromEntries(BLOCK_TYPES.map((b) => [b.type, `${b.icon} ${b.label}`])),
};

// Parses itemHtml as a DOM tree so add/remove/move are real structural edits
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
    // If containerId didn't resolve to a real element (e.g. a stale id from
    // before something else changed the tree), fall back to the review
    // card itself — NEVER to the raw root — so a new block can never end up
    // outside the card as an unstyled, untracked sibling (see
    // normalizeItemHtml below for repairing itemHtml that already has one).
    const item = root.querySelector('[data-jm-block="item"]');
    (container || item || root).insertAdjacentHTML("beforeend", blockHtml);
  });
}

// Repairs itemHtml that somehow ended up with a block as a sibling of the
// review card instead of inside it (only possible from the insertBlock bug
// described above, now fixed — this heals state saved while it was still
// present). Only meaningful client-side; a DOMParser guard like
// parseItemTree's isn't needed here since this only ever runs from a
// useState initializer, which re-runs fresh on the client during hydration.
function normalizeItemHtml(itemHtml) {
  if (typeof DOMParser === "undefined") return itemHtml;
  return withItemDom(itemHtml, (doc, root) => {
    const item = root.querySelector('[data-jm-block="item"]');
    if (!item) return;
    Array.from(root.children).forEach((child) => {
      if (child !== item) item.appendChild(child);
    });
  });
}

function removeBlock(itemHtml, blockId) {
  return withItemDom(itemHtml, (doc, root) => {
    const el = root.querySelector(`[data-jm-block="${blockId}"]`);
    if (el) el.remove();
  });
}

function moveBlockToParent(itemHtml, blockId, newParentId) {
  return withItemDom(itemHtml, (doc, root) => {
    const el = root.querySelector(`[data-jm-block="${blockId}"]`);
    const newParent = root.querySelector(`[data-jm-block="${newParentId}"]`);
    if (el && newParent && el !== newParent && !newParent.contains(el)) {
      newParent.appendChild(el);
    }
  });
}

// Only meaningful for the "text" block type — every other block's content
// comes from a review-data {{token}}, not free text (see sections/blocks/text.ts).
// Also called from a `useMemo` during render — see parseItemTree's comment
// above for why the DOMParser guard is needed.
function getBlockContent(itemHtml, blockId) {
  if (!blockId || typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(`<div id="jm-root">${itemHtml}</div>`, "text/html");
  const el = doc.getElementById("jm-root").querySelector(`[data-jm-block="${blockId}"]`);
  return el?.textContent ?? "";
}

function setBlockContent(itemHtml, blockId, text) {
  return withItemDom(itemHtml, (doc, root) => {
    const el = root.querySelector(`[data-jm-block="${blockId}"]`);
    if (el) el.textContent = text;
  });
}

// Same idea as getBlockContent/setBlockContent, but for a fixed section
// (e.g. "Summary count text", the "No reviews yet" text) that lives in
// baseHtml rather than itemHtml and has no data-jm-block id — found by its
// CSS selector instead. {{tokens}} inside the text (e.g. {{count}}) are
// just literal characters to the DOM, so editing around them is safe; they
// still get substituted normally at render time.
function getFixedContent(baseHtml, selector) {
  if (!selector || typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(`<div id="jm-root">${baseHtml}</div>`, "text/html");
  const el = doc.getElementById("jm-root").querySelector(selector);
  return el?.textContent ?? "";
}

function setFixedContent(baseHtml, selector, text) {
  return withItemDom(baseHtml, (doc, root) => {
    const el = root.querySelector(selector);
    if (el) el.textContent = text;
  });
}

function reorderBlock(itemHtml, blockId, direction) {
  return withItemDom(itemHtml, (doc, root) => {
    const el = root.querySelector(`[data-jm-block="${blockId}"]`);
    if (!el || !el.parentElement) return;
    if (direction === "up" && el.previousElementSibling) {
      el.parentElement.insertBefore(el, el.previousElementSibling);
    } else if (direction === "down" && el.nextElementSibling) {
      el.parentElement.insertBefore(el.nextElementSibling, el);
    }
  });
}

// Walks itemHtml into a nested tree of { blockId, blockType, children }
// nodes for the sidebar. The review-item root itself (blockId "item") is
// the single top-level node.
//
// Called from a `useMemo` during render (see WidgetEditor below), which
// also runs once on the server during SSR — DOMParser doesn't exist there,
// so this bails out to `null` server-side and the real tree fills in as
// soon as the client re-renders during hydration.
function parseItemTree(itemHtml) {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(`<div id="jm-root">${itemHtml}</div>`, "text/html");
  const root = doc.getElementById("jm-root");

  function walk(el) {
    const nodes = [];
    for (const child of Array.from(el.children)) {
      if (child.hasAttribute("data-jm-block-type")) {
        nodes.push({
          blockId: child.getAttribute("data-jm-block"),
          blockType: child.getAttribute("data-jm-block-type"),
          children: walk(child),
        });
      } else {
        nodes.push(...walk(child));
      }
    }
    return nodes;
  }

  return walk(root)[0] || null;
}

// Flattens the tree into [{ blockId, blockType, depth, path }] for the
// "Move into" dropdown (containers only) and for finding a node's parent.
function flattenContainers(node, depth = 0, path = "") {
  if (!node) return [];
  const label = blockTypeFor(node.blockType)?.label || node.blockType;
  const nextPath = path ? `${path} › ${label}` : label;
  let out = [];
  if (node.blockType === "container") out.push({ blockId: node.blockId, depth, path: nextPath });
  for (const child of node.children) out = out.concat(flattenContainers(child, depth + 1, nextPath));
  return out;
}

function findParentId(tree, blockId) {
  if (!tree) return null;
  for (const child of tree.children) {
    if (child.blockId === blockId) return tree.blockId;
    const found = findParentId(child, blockId);
    if (found) return found;
  }
  return null;
}

// The selected thing's own settings controller (reviewWidget/sections/*) —
// a fixed target (root/summary/rate/list/...) looks itself up by target; a
// review-card block looks itself up by type, since many block instances
// share one type's module.
function controlsFor(selected) {
  return selected.blockType ? controlsForBlockType(selected.blockType) : controlsForTarget(selected.styleTarget);
}

function BlockPalette({ onPick, onClose }) {
  return (
    <s-section heading="Add a block">
      <s-stack direction="block" gap="tight">
        {BLOCK_TYPES.map((b) => (
          <button key={b.type} type="button" className="jm-palette-item" onClick={() => onPick(b)}>
            <span className="jm-palette-item__title">{b.icon} {b.label}</span>
            <span className="jm-palette-item__desc">{b.description}</span>
          </button>
        ))}
        <s-button variant="tertiary" onClick={onClose}>Cancel</s-button>
      </s-stack>
    </s-section>
  );
}

// Recursive sidebar tree row for the review-card block structure. A left
// guide line grows with depth so nesting is visible at a glance.
// Drag-and-drop reparenting: dragging any non-root row and dropping it onto
// a container row moves it there (reuses the same moveToParent the
// Position dropdown already calls) — a quicker, more direct way to change
// which section a block belongs to than picking from the "Move into"
// select. Reordering within the same parent still uses the settings
// panel's up/down buttons; drag-and-drop here is for reparenting.
function TreeNode({ node, depth, selectedBlockId, onSelect, onAddInside, onDelete, dragState, onDragStart, onDragEnter, onDragEnd, onDropInto }) {
  const info = blockTypeFor(node.blockType);
  const isSelected = node.blockId === selectedBlockId;
  const isRoot = node.blockId === "item";
  const isContainer = node.blockType === "container";
  const isDropTarget = isContainer && dragState.overId === node.blockId && dragState.draggingId !== node.blockId;
  return (
    <>
      <div
        className={`jm-tree-row${isDropTarget ? " is-drop-target" : ""}`}
        draggable={!isRoot}
        onDragStart={(e) => {
          if (isRoot) return;
          e.dataTransfer.effectAllowed = "move";
          onDragStart(node.blockId);
        }}
        onDragEnd={onDragEnd}
        onDragOver={(e) => {
          if (!isContainer) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDragEnter={() => isContainer && onDragEnter(node.blockId)}
        onDrop={(e) => {
          if (!isContainer) return;
          e.preventDefault();
          onDropInto(node.blockId);
        }}
        style={{ marginLeft: depth * 14, borderLeft: depth > 0 ? "2px solid #e3e3e3" : "none", paddingLeft: depth > 0 ? 8 : 0 }}
      >
        <s-stack direction="inline" gap="tight" style={{ alignItems: "center" }}>
          <span className="jm-drag-handle" aria-hidden="true">⠿</span>
          <s-button variant={isSelected ? "primary" : "tertiary"} onClick={() => onSelect(node)}>
            {info ? `${info.icon}  ${info.label}` : node.blockType}
          </s-button>
          {isContainer ? (
            <s-button variant="tertiary" onClick={() => onAddInside(node.blockId)}>+</s-button>
          ) : null}
          {!isRoot ? (
            <s-button variant="tertiary" onClick={() => onDelete(node.blockId)}>Delete</s-button>
          ) : null}
        </s-stack>
      </div>
      {node.children.map((child) => (
        <TreeNode
          key={child.blockId}
          node={child}
          depth={depth + 1}
          selectedBlockId={selectedBlockId}
          onSelect={onSelect}
          onAddInside={onAddInside}
          onDelete={onDelete}
          dragState={dragState}
          onDragStart={onDragStart}
          onDragEnter={onDragEnter}
          onDragEnd={onDragEnd}
          onDropInto={onDropInto}
        />
      ))}
    </>
  );
}

function Sidebar({ tree, selected, onSelectBlock, onSelectFixed, onAddInside, onDelete, dragState, onDragStart, onDragEnter, onDragEnd, onDropInto }) {
  return (
    <s-section heading="Widget structure">
      <s-stack direction="block" gap="loose">
        <div>
          <s-text tone="subdued">Widget</s-text>
          <s-stack direction="block" gap="tight" style={{ marginTop: 6 }}>
            {WIDGET_TARGETS.map((t) => {
              const isSelected = selected.styleTarget === t.value && !selected.blockId;
              return (
                <s-button key={t.value} variant={isSelected ? "primary" : "tertiary"} onClick={() => onSelectFixed(t.value)}>
                  {TARGET_ICONS[t.value] || "•"}  {t.label}
                </s-button>
              );
            })}
          </s-stack>
        </div>
        <div>
          <s-text tone="subdued">Review card</s-text>
          {/* The card itself ("item") is always directly clickable here —
              not just via the tree below, which only ever shows its
              children — so it's never stuck behind a tree that failed to
              parse or a child row that isn't rendered yet. */}
          <div
            className={`jm-tree-row${dragState.overId === "item" && dragState.draggingId ? " is-drop-target" : ""}`}
            style={{ marginTop: 6 }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDragEnter={() => onDragEnter("item")}
            onDrop={(e) => {
              e.preventDefault();
              onDropInto("item");
            }}
          >
            <s-button
              variant={selected.blockId === "item" ? "primary" : "tertiary"}
              onClick={() => onSelectBlock({ blockId: "item", blockType: "container" })}
            >
              ▢  Review card
            </s-button>
          </div>
          <div style={{ marginTop: 6 }}>
            <s-button variant="tertiary" onClick={() => onAddInside("item")}>+ Add section</s-button>
          </div>
          <div style={{ marginTop: 10 }}>
            {tree
              ? tree.children.map((child) => (
                  <TreeNode
                    key={child.blockId}
                    node={child}
                    depth={1}
                    selectedBlockId={selected.blockId}
                    onSelect={onSelectBlock}
                    onAddInside={onAddInside}
                    onDelete={onDelete}
                    dragState={dragState}
                    onDragStart={onDragStart}
                    onDragEnter={onDragEnter}
                    onDragEnd={onDragEnd}
                    onDropInto={onDropInto}
                  />
                ))
              : null}
          </div>
          {/* Diagnostic: a freshly-built card always has 4 default blocks
              (stars/title/body/author), so an empty list here — while the
              preview still visibly shows a title/body/author — means the
              saved markup's data-jm-block-type tags are missing (e.g. from
              hand-editing the raw HTML before, or importing a template that
              didn't include them). See app.widget-style.jsx's raw editor to
              inspect/fix the underlying HTML directly if this happens. */}
          {tree && tree.children.length === 0 ? (
            <div className="jm-diagnostic">
              No blocks detected inside this card&apos;s markup. If the preview still shows a
              title/body/author, this card&apos;s HTML is missing its editor tags (likely from raw-HTML
              edits) — try <strong>Reset to default</strong>, or edit the raw{" "}
              <s-link href="/app/widget-style">HTML/CSS</s-link> directly to add them back.
            </div>
          ) : null}
        </div>
      </s-stack>
    </s-section>
  );
}

// Plain native <input>/<select>, not Shopify's <s-text-field>/<s-select>
// web components — those are injected by the real embedded-admin runtime,
// which this app can't load standalone to verify, and there's good reason
// to suspect their controlled-value updates aren't fully reliable outside
// of a real user-driven change event (see the long comment on
// ControlField's old select branch, now removed, for the exact symptom:
// picking "Center" worked, picking "Left" back afterward silently did
// nothing). Native elements have zero ambiguity here — React's handling of
// them is first-party and exhaustively battle-tested — so every editable
// field in this editor uses one, styled via .jm-field in EDITOR_CHROME_CSS
// to still look consistent with the surrounding Polaris chrome.
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
      <select
        className="jm-field__input"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label={hideLabel ? label : undefined}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

// A plain number input plus a px/%/rem/em dropdown beside it, combined into
// one CSS value ("12px") — the building block for both the "size" control
// (one field) and the "box" control (four of these, one per side). No unit
// ever has to be typed by hand.
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

// A hex swatch a merchant can click to pick from the OS color picker, kept
// in sync with the text field beside it — this is the "colour box so u can
// choose" control, not just a static preview swatch.
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function HelpText({ text }) {
  if (!text) return null;
  return <s-text tone="subdued">{text}</s-text>;
}

// Renders one control from a section/block module's `controls` array
// (reviewWidget/sections/types.ts) — the generic form-field engine every
// section's own controller plugs into. `getVal`/`setVal` already know how
// to read/write a control's own target override, if it has one; `content`/
// `onEditContent` are only used by the "content" control type (the "Custom
// text" block), which edits itemHtml directly instead of a style-block row.
function ControlField({ control, getVal, setVal, content, onEditContent }) {
  if (control.showIf && !control.showIf(getVal)) return null;

  if (control.type === "content") {
    return (
      <div>
        <Field label={control.label} value={content ?? ""} placeholder="Enter text" onChange={onEditContent} />
        <HelpText text={control.helpText} />
      </div>
    );
  }

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

  if (control.type === "number") {
    // The stored CSS value and the number this field displays can differ
    // (e.g. "repeat(3, 1fr)" stored, "3" shown) — fromValue/toValue convert
    // between them; controls that don't need that just leave them unset.
    const displayValue = control.fromValue ? control.fromValue(value) : value;
    const onNumberChange = (raw) => {
      const stored = control.toValue ? control.toValue(raw) : raw;
      setVal(control.property, stored, control.target);
      control.onSet?.(stored, (property, val, target) => setVal(property, val, target ?? control.target));
    };
    return (
      <div>
        <Field
          label={control.label}
          type="number"
          min={control.min}
          max={control.max}
          step={control.step}
          value={displayValue}
          placeholder={control.placeholder}
          onChange={onNumberChange}
        />
        <HelpText text={control.helpText} />
      </div>
    );
  }

  if (control.type === "select") {
    // Never pre-select one of the real options as a fallback for "nothing
    // set yet" — that made a select LOOK like e.g. "Left" was chosen when
    // nothing had actually been written, so clicking the already-displayed
    // "Left" fired no change event (same value) and nothing happened. A
    // real "Default" option (value "") represents that state honestly, and
    // going from it to a real option is always a genuine value change.
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

function SettingsPanel({
  selected,
  styleBlocks,
  setStyleBlocks,
  onDeleteBlock,
  onAddInside,
  moveOptions,
  currentParentId,
  onMoveToParent,
  onReorder,
  content,
  onEditContent,
}) {
  const target = selected.styleTarget;
  const rows = styleBlocks.map((b, i) => ({ ...b, i })).filter((b) => b.target === target);
  // A fixed target (root/summary/rate/list/item/item-stars/...) has its
  // own specific name registered in TARGETS (see sections/index.ts) — that
  // always wins over the generic block-TYPE label, so selecting the review
  // card shows "Review card", not "Section" (every container block,
  // including the card itself, shares blockType "container", but only a
  // dynamically-added one — no TARGETS entry — should fall back to that
  // generic name).
  const fixedTarget = TARGETS.find((t) => t.value === target);
  const blockInfo = selected.blockType ? blockTypeFor(selected.blockType) : null;
  const heading = fixedTarget
    ? `${TARGET_ICONS[target] || "•"} ${fixedTarget.label}`
    : blockInfo
      ? `${blockInfo.icon} ${blockInfo.label}`
      : labelFor(target);

  // getVal/setVal default to the selected element's own target, but a
  // control can override that (see summary.ts's star-color shortcut, which
  // writes to "summary-stars" while the summary bar itself is selected).
  const getVal = (property, controlTarget) => {
    const t = controlTarget || target;
    return styleBlocks.find((b) => b.target === t && b.property === property)?.value ?? "";
  };
  const setVal = (property, value, controlTarget) => {
    const t = controlTarget || target;
    setStyleBlocks((all) => {
      const idx = all.findIndex((b) => b.target === t && b.property === property);
      if (!value) return idx === -1 ? all : all.filter((_, i) => i !== idx);
      if (idx === -1) return [...all, { target: t, property, value }];
      return all.map((b, i) => (i === idx ? { ...b, value } : b));
    });
  };

  const addRow = () => setStyleBlocks((all) => [...all, { target, property: PROPERTIES[0].value, value: "" }]);
  const removeRow = (i) => setStyleBlocks((all) => all.filter((_, idx) => idx !== i));
  const setRow = (i, field, value) => setStyleBlocks((all) => all.map((b, idx) => (idx === i ? { ...b, [field]: value } : b)));

  if (!target) {
    return (
      <s-section heading="Settings">
        <s-paragraph>Click any element in the preview, or pick one from the structure list, to edit it.</s-paragraph>
      </s-section>
    );
  }

  const controls = controlsFor(selected);
  const controlGroups = [];
  for (const c of controls) {
    const heading = c.group || "Settings";
    let bucket = controlGroups.find((g) => g.heading === heading);
    if (!bucket) {
      bucket = { heading, items: [] };
      controlGroups.push(bucket);
    }
    bucket.items.push(c);
  }
  const canAddInside = selected.blockType === "container";
  const canReparent = Boolean(selected.blockId) && selected.blockId !== "item";

  return (
    <s-stack direction="block" gap="base">
      <s-section heading={`Settings — ${heading}`}>
        <s-stack direction="block" gap="loose">
          {controlGroups.length === 0 ? (
            <s-paragraph>This element has no dedicated settings — use Advanced below for any raw CSS property.</s-paragraph>
          ) : null}

          {controlGroups.map((g) => (
            <SettingsGroup key={g.heading} heading={g.heading}>
              {g.items.map((c) => (
                <ControlField key={c.key} control={c} getVal={getVal} setVal={setVal} content={content} onEditContent={onEditContent} />
              ))}
            </SettingsGroup>
          ))}

          {canReparent ? (
            <SettingsGroup heading="Position">
              <NativeSelect
                label="Move into"
                value={currentParentId || ""}
                options={moveOptions.map((o) => ({ value: o.blockId, label: o.path }))}
                onChange={onMoveToParent}
              />
              <s-stack direction="inline" gap="tight">
                <s-button variant="tertiary" onClick={() => onReorder("up")}>↑ Move up</s-button>
                <s-button variant="tertiary" onClick={() => onReorder("down")}>↓ Move down</s-button>
              </s-stack>
            </SettingsGroup>
          ) : null}

          <s-stack direction="inline" gap="tight">
            {canAddInside ? <s-button onClick={() => onAddInside(selected.blockId)}>+ Add block inside</s-button> : null}
            {canReparent ? <s-button variant="tertiary" onClick={onDeleteBlock}>Delete this block</s-button> : null}
          </s-stack>
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
                <Field
                  label="Value"
                  hideLabel
                  value={row.value}
                  placeholder={property?.hint || "value"}
                  onChange={(v) => setRow(row.i, "value", v)}
                />
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

// Editor-chrome-only CSS (spacing/rhythm for the sidebar tree and settings
// groups) — never touches the widget's own compiled output.
const EDITOR_CHROME_CSS = `
  .jm-tree-row { padding: 3px 0; border-radius: 6px; }
  .jm-tree-row.is-drop-target { background: #eef1fd; outline: 2px dashed #5c6ac4; outline-offset: -2px; }
  .jm-drag-handle { cursor: grab; color: #999; font-size: 14px; }
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
  .jm-diagnostic { margin-top: 10px; padding: 8px 10px; background: #fff4e4; border: 1px solid #ffcf8a; border-radius: 6px; font-size: 12px; color: #6b4900; }
  .jm-diagnostic code { background: rgba(0,0,0,0.08); padding: 1px 4px; border-radius: 3px; }
  .jm-palette-item {
    display: block; width: 100%; text-align: left; font: inherit; cursor: pointer;
    background: #fff; border: 1px solid #e1e1e1; border-radius: 8px; padding: 10px 12px;
  }
  .jm-palette-item:hover { background: #f6f6f7; border-color: #ccc; }
  .jm-palette-item__title { display: block; font-weight: 600; }
  .jm-palette-item__desc { display: block; margin-top: 2px; font-size: 12px; color: #6d7175; white-space: normal; }
`;

export default function WidgetEditor() {
  const loaderData = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const iframeRef = useRef(null);

  const [baseHtml, setBaseHtml] = useState(loaderData.html);
  const [itemHtml, setItemHtml] = useState(() => normalizeItemHtml(extractItemHtml(loaderData.html)));
  const [css] = useState(loaderData.css);
  const [styleBlocks, setStyleBlocks] = useState(loaderData.styleBlocks);
  const [selected, setSelected] = useState({ styleTarget: null, blockId: null, blockType: null });
  const [srcDoc, setSrcDoc] = useState("");
  const [dirty, setDirty] = useState(false);
  const [paletteTarget, setPaletteTarget] = useState(null); // containerId to add into, or null when closed
  const [previewMode, setPreviewMode] = useState("withReviews"); // or "empty" — see EMPTY_PREVIEW_DATA
  const [previewHeight, setPreviewHeight] = useState(360);
  const [previewDevice, setPreviewDevice] = useState("desktop"); // or "mobile" — just narrows the iframe itself, no separate render path, so it's exactly what a shopper's phone would see given the same html/css.
  const [dragState, setDragState] = useState({ draggingId: null, overId: null }); // sidebar tree drag-and-drop

  const targetsForIframe = useMemo(() => TARGETS.map((t) => ({ value: t.value, selector: t.selector })), []);
  const tree = useMemo(() => parseItemTree(itemHtml), [itemHtml]);
  const moveOptions = useMemo(() => flattenContainers(tree), [tree]);
  const currentParentId = useMemo(
    () => (selected.blockId ? findParentId(tree, selected.blockId) : null),
    [tree, selected.blockId],
  );
  // A selected tree block (the "Custom text" type) edits its content inside
  // itemHtml, by id; a selected fixed section (e.g. "Summary count text")
  // edits its content inside baseHtml, by CSS selector — see
  // getBlockContent/getFixedContent's comments above.
  const selectedFixedSelector = !selected.blockId ? TARGETS.find((t) => t.value === selected.styleTarget)?.selector : null;
  const blockContent = useMemo(() => {
    if (selected.blockId) return selected.blockType === "text" ? getBlockContent(itemHtml, selected.blockId) : "";
    return selectedFixedSelector ? getFixedContent(baseHtml, selectedFixedSelector) : "";
  }, [itemHtml, baseHtml, selected.blockId, selected.blockType, selectedFixedSelector]);

  const rebuildIframe = (nextItemHtml = itemHtml, mode = previewMode, nextBaseHtml = baseHtml) => {
    const template = injectItemHtml(nextBaseHtml, nextItemHtml);
    const data = mode === "empty" ? EMPTY_PREVIEW_DATA : PREVIEW_DATA;
    const baseHtmlRendered = renderWidgetHtml(template, data);
    const liveCss = [css, compileStyleBlocks(styleBlocks)].filter(Boolean).join("\n\n");
    setSrcDoc(buildSrcDoc({ baseHtmlRendered, css: liveCss, targets: targetsForIframe, labels: IFRAME_LABELS }));
  };

  // Build the iframe once on mount; after that, style edits go over
  // postMessage and only structural changes (add/remove/move block, preview
  // mode switch) rebuild it.
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

  // Keep the iframe's highlighted element in sync when selection changes
  // from the sidebar (a tree block or a fixed target, e.g. "Summary stars")
  // rather than a click inside the iframe itself.
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "jm-select-external", blockId: selected.blockId, styleTarget: selected.styleTarget },
      "*",
    );
  }, [selected.blockId, selected.styleTarget]);

  useEffect(() => {
    function onMessage(e) {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      const msg = e.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "jm-select") {
        setSelected({ styleTarget: msg.styleTarget, blockId: msg.blockId, blockType: msg.blockType });
      } else if (msg.type === "jm-resize" && typeof msg.height === "number") {
        setPreviewHeight(Math.min(900, Math.max(220, msg.height + 4)));
      } else if (msg.type === "jm-drag-end") {
        // Dragging a "Free position" block in the preview (EDITOR_SCRIPT's
        // mousedown/mousemove/mouseup handling above) ends here — commit the
        // pixel position it settled on into styleBlocks, same shape the Top/
        // Left fields in the settings panel write, so either one keeps
        // working after using the other.
        const target = msg.blockId || msg.styleTarget;
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

  const switchPreviewMode = (mode) => {
    setPreviewMode(mode);
    rebuildIframe(itemHtml, mode);
  };

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

  const selectBlockNode = (node) => setSelected({ styleTarget: node.blockId, blockId: node.blockId, blockType: node.blockType });
  const selectFixedTarget = (value) => setSelected({ styleTarget: value, blockId: null, blockType: null });

  const addBlock = (blockDef) => {
    const id = newBlockId();
    const html = blockDef.html(id);
    const containerId = paletteTarget || "item";
    // normalizeItemHtml as a second line of defense on top of insertBlock's
    // own item-not-root fallback — a new block is guaranteed to land, and
    // stay, inside the review card either way.
    const nextItemHtml = normalizeItemHtml(insertBlock(itemHtml, containerId, html));
    setItemHtml(nextItemHtml);
    setSelected({ styleTarget: id, blockId: id, blockType: blockDef.type });
    setDirty(true);
    setPaletteTarget(null);
    rebuildIframe(nextItemHtml);
  };

  // Used both by the settings panel's "Delete this block" button and each
  // sidebar tree row's own Delete button, so a block can be removed without
  // selecting it first.
  const deleteBlock = (blockId) => {
    if (!blockId || blockId === "item") return;
    const nextItemHtml = removeBlock(itemHtml, blockId);
    setItemHtml(nextItemHtml);
    setStyleBlocks((all) => all.filter((b) => b.target !== blockId));
    if (selected.blockId === blockId) setSelected({ styleTarget: null, blockId: null, blockType: null });
    setDirty(true);
    rebuildIframe(nextItemHtml);
  };

  const moveToParent = (newParentId, blockId = selected.blockId) => {
    if (!blockId || !newParentId || blockId === newParentId) return;
    if (blockId === selected.blockId && newParentId === currentParentId) return;
    const nextItemHtml = moveBlockToParent(itemHtml, blockId, newParentId);
    setItemHtml(nextItemHtml);
    setDirty(true);
    rebuildIframe(nextItemHtml);
  };

  // Sidebar tree drag-and-drop (see TreeNode) — dragging a row onto a
  // container drops it there via the same moveToParent above.
  const handleDragStart = (blockId) => setDragState({ draggingId: blockId, overId: null });
  const handleDragEnter = (containerId) => setDragState((s) => (s.draggingId ? { ...s, overId: containerId } : s));
  const handleDragEnd = () => setDragState({ draggingId: null, overId: null });
  const handleDropInto = (containerId) => {
    if (dragState.draggingId) moveToParent(containerId, dragState.draggingId);
    setDragState({ draggingId: null, overId: null });
  };

  const reorder = (direction) => {
    if (!selected.blockId) return;
    const nextItemHtml = reorderBlock(itemHtml, selected.blockId, direction);
    setItemHtml(nextItemHtml);
    setDirty(true);
    rebuildIframe(nextItemHtml);
  };

  const editContent = (text) => {
    if (selected.blockId) {
      const nextItemHtml = setBlockContent(itemHtml, selected.blockId, text);
      setItemHtml(nextItemHtml);
      setDirty(true);
      rebuildIframe(nextItemHtml);
    } else if (selectedFixedSelector) {
      const nextBaseHtml = setFixedContent(baseHtml, selectedFixedSelector, text);
      setBaseHtml(nextBaseHtml);
      setDirty(true);
      rebuildIframe(itemHtml, previewMode, nextBaseHtml);
    }
  };

  const save = () => {
    const html = injectItemHtml(baseHtml, normalizeItemHtml(itemHtml));
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
    <s-page heading="Widget builder" inlineSize="large">
      <style>{EDITOR_CHROME_CSS}</style>
      <s-section heading="Section-based widget editor">
        <s-paragraph>
          Pick a piece from <strong>Widget structure</strong> on the left, or hover then click it
          directly in the preview (a dashed outline + name chip shows what you&apos;re about to select,
          a solid one shows what&apos;s selected), to edit it — layout, size, colors, background image,
          borders and corners. Sections (containers) can hold other blocks or nested sections; the
          <strong> reviews list</strong> itself can be a normal stack or a grid of 2–4 cards per row.
          Use <strong>Position</strong> in the settings panel to move a block into a different section
          or reorder it, and the <strong>With reviews / No reviews yet</strong> toggle above the preview
          to style the empty state too. Every edit here compiles down to plain HTML/CSS, same as the{" "}
          <s-link href="/app/widget-style">raw template editor</s-link>.
        </s-paragraph>
      </s-section>

      <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "flex-start", gap: 24, overflowX: "auto", paddingBottom: 4 }}>
        <div style={{ flex: "0 0 240px", minWidth: 200 }}>
          <Sidebar
            tree={tree}
            selected={selected}
            onSelectBlock={selectBlockNode}
            onSelectFixed={selectFixedTarget}
            onAddInside={(containerId) => setPaletteTarget(containerId)}
            onDelete={deleteBlock}
            dragState={dragState}
            onDragStart={handleDragStart}
            onDragEnter={handleDragEnter}
            onDragEnd={handleDragEnd}
            onDropInto={handleDropInto}
          />
          {paletteTarget ? (
            <div style={{ marginTop: 16 }}>
              <BlockPalette onPick={addBlock} onClose={() => setPaletteTarget(null)} />
            </div>
          ) : null}
        </div>

        <div style={{ flex: "1 1 34%", minWidth: 280 }}>
          <s-section heading="Preview (hover, then click to select)">
            <s-stack direction="inline" gap="tight" style={{ marginBottom: 8, flexWrap: "wrap" }}>
              <s-button variant={previewMode === "withReviews" ? "primary" : "tertiary"} onClick={() => switchPreviewMode("withReviews")}>
                With reviews
              </s-button>
              <s-button variant={previewMode === "empty" ? "primary" : "tertiary"} onClick={() => switchPreviewMode("empty")}>
                No reviews yet
              </s-button>
              <span style={{ width: 1, alignSelf: "stretch", background: "#e1e1e1" }} />
              <s-button variant={previewDevice === "desktop" ? "primary" : "tertiary"} onClick={() => setPreviewDevice("desktop")}>
                🖥 Desktop
              </s-button>
              <s-button variant={previewDevice === "mobile" ? "primary" : "tertiary"} onClick={() => setPreviewDevice("mobile")}>
                📱 Mobile
              </s-button>
            </s-stack>
            {/* Mobile mode just narrows the iframe itself (a real 390px
                viewport, same html/css/media queries a phone gets) rather
                than rendering a second copy of the preview — so it's an
                honest look at what a shopper's phone would actually show,
                not an approximation. */}
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                overflow: "hidden",
                width: previewDevice === "mobile" ? 390 : "100%",
                maxWidth: "100%",
                margin: previewDevice === "mobile" ? "0 auto" : undefined,
                transition: "width 150ms ease",
              }}
            >
              <iframe
                ref={iframeRef}
                title="Widget preview"
                srcDoc={srcDoc}
                style={{ width: "100%", height: previewHeight, border: "0", display: "block", transition: "height 120ms ease" }}
              />
            </div>
            <s-stack direction="inline" gap="tight" style={{ marginTop: 8 }}>
              <s-button variant="primary" onClick={save} disabled={!dirty && !!loaderData.isCustom}>
                Save
              </s-button>
              {loaderData.isCustom || dirty ? (
                <s-button variant="tertiary" onClick={reset}>Reset to default</s-button>
              ) : null}
            </s-stack>
          </s-section>
        </div>

        <div style={{ flex: "1 1 34%", minWidth: 300 }}>
          <SettingsPanel
            selected={selected}
            styleBlocks={styleBlocks}
            setStyleBlocks={setStyleBlocks}
            onDeleteBlock={() => deleteBlock(selected.blockId)}
            onAddInside={(containerId) => setPaletteTarget(containerId)}
            moveOptions={moveOptions}
            currentParentId={currentParentId}
            onMoveToParent={moveToParent}
            onReorder={reorder}
            content={blockContent}
            onEditContent={editContent}
          />
        </div>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
