// app/routes/app.import.jsx — bulk review import from a CSV file, modeled
// on Judge.me's own real "Import reviews from a spreadsheet" flow (see
// https://judge.me/help/en/articles/8223181-importing-reviews-from-any-spreadsheet):
// a fixed set of named columns (title, body, rating, review_date,
// reviewer_name, reviewer_email, reply, picture_urls, product_handle),
// "Picture URLs" holding up to 5 comma-separated direct image links, and a
// required product identifier to match each row to a product already synced
// into this shop (see products/*.server.ts) — matched by handle first, then
// falling back to an exact (case-insensitive) title match, since handle is
// the least ambiguous identifier a merchant is likely to have on hand.
//
// Genuinely new reviews (not linked to a ReviewRequest, same as the manual
// "Add a review" form on /app/reviews) — status defaults to PUBLISHED so
// imported history shows up immediately, verifiedBuyer defaults to false
// since there's no real Shopify order behind an imported row to verify
// against (a merchant can still mark one verified by hand afterwards).
import { useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import Papa from "papaparse";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { invalidateReviewCache } from "../reviewWidget/reviewCache.server";

// The exact columns this importer reads — anything else in the file is
// ignored, so a merchant's export from elsewhere (Loox, Yotpo, ...) still
// needs re-mapping into this shape first (same as it would for Judge.me's
// own real importer, which the linked article above walks through — this
// demo app skips that separate re-mapping/verification wizard and just
// reads these headers directly).
const TEMPLATE_HEADERS = ["title", "body", "rating", "review_date", "reviewer_name", "reviewer_email", "reply", "picture_urls", "product_handle"];

const TEMPLATE_SAMPLE_ROW = [
  "Love it",
  "Exactly what I needed, great quality.",
  "5",
  "24/03/2026",
  "Jordan Lee",
  "jordan@example.com",
  "",
  "https://cdn.shopify.com/s/files/1/example/photo1.jpg,https://cdn.shopify.com/s/files/1/example/photo2.jpg",
  "your-product-handle",
];

function parseDateDDMMYYYY(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePictureUrls(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { productCount: 0 };

  const productCount = await db.product.count({ where: { shopId: shop.id } });
  return { productCount };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { ok: false, error: "Shop not found." };

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string" || !file.size) {
    return { ok: false, error: "Choose a CSV file first." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "File is too large (5MB max)." };
  }

  const text = await file.text();
  const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
  if (parsed.errors?.length) {
    return { ok: false, error: `Couldn't read that CSV: ${parsed.errors[0].message}` };
  }
  const rows = parsed.data;
  if (!rows.length) return { ok: false, error: "That file has no rows." };
  if (rows.length > 2000) return { ok: false, error: "Import is capped at 2000 rows at a time — split the file and run it again." };

  // Product lookup tables built once, not re-queried per row.
  const products = await db.product.findMany({ where: { shopId: shop.id }, select: { id: true, handle: true, title: true } });
  const byHandle = new Map(products.map((p) => [p.handle?.toLowerCase(), p]));
  const byTitle = new Map(products.map((p) => [p.title?.toLowerCase(), p]));

  let imported = 0;
  const skipped = [];
  const touchedProductIds = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // header is row 1
    const body = String(row.body || "").trim().slice(0, 5000);
    const rating = Number(row.rating);

    if (!body) {
      skipped.push({ row: rowNum, reason: "Missing body" });
      continue;
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      skipped.push({ row: rowNum, reason: "Rating must be 1–5" });
      continue;
    }

    const handleKey = String(row.product_handle || "").trim().toLowerCase();
    const product = (handleKey && byHandle.get(handleKey)) || byTitle.get(handleKey);
    if (!product) {
      skipped.push({ row: rowNum, reason: `No product matching "${row.product_handle || ""}"` });
      continue;
    }

    const email = String(row.reviewer_email || "").trim().toLowerCase() || null;
    const customer = email ? await db.customer.findFirst({ where: { shopId: shop.id, email } }) : null;

    const title = String(row.title || "").trim().slice(0, 200) || null;
    const authorName = String(row.reviewer_name || "").trim().slice(0, 100) || null;
    const reply = String(row.reply || "").trim().slice(0, 5000) || null;
    const createdAt = parseDateDDMMYYYY(row.review_date) ?? undefined;
    const images = parsePictureUrls(row.picture_urls);

    await db.review.create({
      data: {
        shopId: shop.id,
        productId: product.id,
        customerId: customer?.id,
        rating,
        title,
        body,
        authorName,
        verifiedBuyer: false,
        status: "PUBLISHED",
        reply,
        repliedAt: reply ? new Date() : null,
        ...(createdAt ? { createdAt } : {}),
        images: images.length ? { create: images.map((url, position) => ({ url, position })) } : undefined,
      },
    });
    imported += 1;
    touchedProductIds.add(product.id);
  }

  await Promise.all([...touchedProductIds].map((productId) => invalidateReviewCache(shop.id, productId)));

  return {
    ok: true,
    imported,
    skippedCount: skipped.length,
    skipped: skipped.slice(0, 20),
    totalRows: rows.length,
  };
};

function downloadTemplate() {
  const csv = Papa.unparse({ fields: TEMPLATE_HEADERS, data: [TEMPLATE_SAMPLE_ROW] });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "judgeme-review-import-template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ResultBanner({ result }) {
  if (!result) return null;
  if (!result.ok) return <s-banner tone="critical">{result.error}</s-banner>;

  return (
    <s-banner tone={result.skippedCount > 0 ? "warning" : "success"}>
      <s-stack direction="block" gap="tight">
        <s-text>
          Imported <strong>{result.imported}</strong> of {result.totalRows} row{result.totalRows === 1 ? "" : "s"}
          {result.skippedCount > 0 ? `, skipped ${result.skippedCount}.` : "."}
        </s-text>
        {result.skipped.length > 0 ? (
          <s-stack direction="block" gap="none">
            {result.skipped.map((s) => (
              <s-text key={s.row} tone="subdued">Row {s.row}: {s.reason}</s-text>
            ))}
            {result.skippedCount > result.skipped.length ? (
              <s-text tone="subdued">…and {result.skippedCount - result.skipped.length} more.</s-text>
            ) : null}
          </s-stack>
        ) : null}
      </s-stack>
    </s-banner>
  );
}

function CsvImportCard({ productCount }) {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [lastResult, setLastResult] = useState(null);

  const submitting = fetcher.state !== "idle";

  if (fetcher.data && fetcher.data !== lastResult) {
    setLastResult(fetcher.data);
    if (fetcher.data.ok && fetcher.data.imported > 0) {
      shopify.toast.show(`Imported ${fetcher.data.imported} review${fetcher.data.imported === 1 ? "" : "s"}`);
    }
  }

  const submit = () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    fetcher.submit(formData, { method: "POST", encType: "multipart/form-data" });
  };

  return (
    <s-section heading="Import from a spreadsheet">
      <s-stack direction="block" gap="base">
        <s-paragraph>
          Upload a CSV with columns <code>{TEMPLATE_HEADERS.join(", ")}</code>. <code>body</code>,{" "}
          <code>rating</code> (1–5) and <code>product_handle</code> are required — everything else is
          optional. <code>picture_urls</code> takes direct image links, comma-separated (up to 5, same as{" "}
          Judge.me&apos;s own importer). <code>product_handle</code> is matched against{" "}
          {productCount > 0 ? <>your {productCount} synced product{productCount === 1 ? "" : "s"}</> : "your synced products"}{" "}
          by handle, then by exact title if no handle matches.
        </s-paragraph>

        <s-button variant="tertiary" onClick={downloadTemplate}>Download CSV template</s-button>

        <div className="jm-import-drop">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFileName(e.target.files?.[0]?.name || "")}
          />
          {fileName ? <s-text tone="subdued">Selected: {fileName}</s-text> : null}
        </div>

        <s-button variant="primary" disabled={submitting || !fileName} onClick={submit}>
          {submitting ? "Importing…" : "Import reviews"}
        </s-button>

        <ResultBanner result={lastResult} />
      </s-stack>
    </s-section>
  );
}

export default function Import() {
  const { productCount } = useLoaderData();

  return (
    <s-page heading="Import reviews">
      <style>{`
        .jm-import-drop {
          border: 1px dashed #c9cccf; border-radius: 8px; padding: 16px;
          display: flex; flex-direction: column; gap: 8px; background: #fafafb;
        }
        .jm-import-drop input[type="file"] { font-size: 13px; }
      `}</style>

      <s-section heading="Migrating from another review app">
        <s-paragraph>
          Coming from Loox, Yotpo, or another provider? Export your reviews from there first, then
          re-save that file with the columns below before uploading it here. Judge.me&apos;s own migration
          guides (e.g.{" "}
          <s-link href="https://judge.me/help/en/articles/10826547-migrating-reviews-from-loox-to-judge-me" target="_blank">
            Loox → Judge.me
          </s-link>) walk through exporting from each platform — this importer expects the Judge.me-style
          spreadsheet shape on the other end, not a provider&apos;s raw export.
        </s-paragraph>
      </s-section>

      <CsvImportCard productCount={productCount} />
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
