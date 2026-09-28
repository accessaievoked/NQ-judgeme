// app/routes/app.analytics.jsx — a real dashboard instead of the previous
// stub: headline stat tiles, a rating-distribution bar chart, a "Needs
// attention" table of low-rated reviews (server-sorted via ?sort=, no client
// chart library and no embedding/similarity search — just plain SQL
// grouping/sorting, per the brief), and a "Products to look into" table
// (published reviews grouped by product, averaged, filtered to <=3★).
import { useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const SORTS = {
  rating: { label: "Lowest rating first", orderBy: [{ rating: "asc" }, { createdAt: "desc" }] },
  newest: { label: "Newest first", orderBy: [{ createdAt: "desc" }] },
  oldest: { label: "Oldest first", orderBy: [{ createdAt: "asc" }] },
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return null;

  const url = new URL(request.url);
  const sortKey = SORTS[url.searchParams.get("sort")] ? url.searchParams.get("sort") : "rating";

  const [statusCounts, avgRating, ratingCounts, withImages, withReply, needsAttention, productGroups] = await Promise.all([
    db.review.groupBy({ by: ["status"], where: { shopId: shop.id }, _count: { _all: true } }),

    db.review.aggregate({ where: { shopId: shop.id, status: "PUBLISHED" }, _avg: { rating: true } }),

    db.review.groupBy({ by: ["rating"], where: { shopId: shop.id, status: "PUBLISHED" }, _count: { _all: true } }),

    db.review.count({ where: { shopId: shop.id, images: { some: {} } } }),

    db.review.count({ where: { shopId: shop.id, reply: { not: null } } }),

    // Low-rated reviews across every non-spam/rejected status — the thing a
    // merchant actually needs to act on (reply to, follow up on, etc.).
    db.review.findMany({
      where: { shopId: shop.id, rating: { lte: 2 }, status: { notIn: ["SPAM", "REJECTED"] } },
      orderBy: SORTS[sortKey].orderBy,
      take: 25,
      include: { product: { select: { title: true } } },
    }),

    db.review.groupBy({
      by: ["productId"],
      where: { shopId: shop.id, status: "PUBLISHED" },
      _avg: { rating: true },
      _count: { _all: true },
      having: { rating: { _avg: { lte: 3 } } },
      orderBy: { _avg: { rating: "asc" } },
      take: 10,
    }),
  ]);

  const countByStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]));
  const totalReviews = statusCounts.reduce((sum, s) => sum + s._count._all, 0);
  const published = countByStatus.PUBLISHED || 0;

  const distribution = [5, 4, 3, 2, 1].map((r) => ({
    rating: r,
    count: ratingCounts.find((c) => c.rating === r)?._count._all || 0,
  }));
  const maxDistCount = Math.max(1, ...distribution.map((d) => d.count));

  const productIds = productGroups.map((g) => g.productId);
  const products = productIds.length
    ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, title: true } })
    : [];
  const productTitleById = Object.fromEntries(products.map((p) => [p.id, p.title]));

  return {
    totalReviews,
    published,
    pending: countByStatus.PENDING || 0,
    hidden: countByStatus.HIDDEN || 0,
    spam: countByStatus.SPAM || 0,
    rejected: countByStatus.REJECTED || 0,
    averageRating: avgRating._avg.rating,
    distribution,
    maxDistCount,
    withImages,
    withReply,
    sortKey,
    needsAttention: needsAttention.map((r) => ({
      id: r.id,
      productTitle: r.product.title,
      rating: r.rating,
      title: r.title,
      body: r.body,
      status: r.status,
      createdAt: r.createdAt,
    })),
    problemProducts: productGroups.map((g) => ({
      productId: g.productId,
      title: productTitleById[g.productId] || "Unknown product",
      avgRating: g._avg.rating,
      count: g._count._all,
    })),
  };
};

function StatTile({ label, value, sub }) {
  return (
    <div className="jm-stat-tile">
      <div className="jm-stat-tile__label">{label}</div>
      <div className="jm-stat-tile__value">{value}</div>
      {sub ? <div className="jm-stat-tile__sub">{sub}</div> : null}
    </div>
  );
}

function RatingBars({ distribution, maxCount }) {
  return (
    <div className="jm-bars">
      {distribution.map((d) => (
        <div key={d.rating} className="jm-bars__row">
          <span className="jm-bars__label">{d.rating}★</span>
          <div className="jm-bars__track">
            <div className="jm-bars__fill" style={{ width: `${Math.round((d.count / maxCount) * 100)}%` }} />
          </div>
          <span className="jm-bars__count">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

function NeedsAttentionTable({ reviews, sortKey }) {
  const [, setSearchParams] = useSearchParams();

  if (reviews.length === 0) {
    return <s-paragraph>Nothing at or below 2★ right now — nice.</s-paragraph>;
  }

  return (
    <s-stack direction="block" gap="base">
      <label className="jm-sort-field">
        <span>Sort by</span>
        <select
          className="jm-sort-field__input"
          value={sortKey}
          onChange={(e) => setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("sort", e.target.value);
            return next;
          })}
        >
          {Object.entries(SORTS).map(([key, s]) => (
            <option key={key} value={key}>{s.label}</option>
          ))}
        </select>
      </label>

      <s-table>
        <s-table-header-row>
          <s-table-header listSlot="primary">Product</s-table-header>
          <s-table-header listSlot="secondary">Rating</s-table-header>
          <s-table-header listSlot="secondary">Review</s-table-header>
          <s-table-header listSlot="secondary">Status</s-table-header>
          <s-table-header listSlot="secondary">Date</s-table-header>
        </s-table-header-row>
        <s-table-body>
          {reviews.map((r) => (
            <s-table-row key={r.id}>
              <s-table-cell>{r.productTitle}</s-table-cell>
              <s-table-cell>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</s-table-cell>
              <s-table-cell>{r.title || r.body?.slice(0, 60) || "—"}</s-table-cell>
              <s-table-cell><s-badge tone={r.status === "PUBLISHED" ? undefined : "warning"}>{r.status}</s-badge></s-table-cell>
              <s-table-cell>{new Date(r.createdAt).toLocaleDateString()}</s-table-cell>
            </s-table-row>
          ))}
        </s-table-body>
      </s-table>
    </s-stack>
  );
}

export default function Analytics() {
  const data = useLoaderData();

  if (!data) {
    return (
      <s-page heading="Analytics">
        <s-section heading="Analytics">
          <s-paragraph>No shop found for this session.</s-paragraph>
        </s-section>
      </s-page>
    );
  }

  const {
    totalReviews, published, pending, hidden, spam, rejected,
    averageRating, distribution, maxDistCount, withImages, withReply,
    needsAttention, sortKey, problemProducts,
  } = data;

  return (
    <s-page heading="Analytics">
      <style>{`
        .jm-stat-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;
        }
        .jm-stat-tile {
          border: 1px solid #e1e1e1; border-radius: 10px; padding: 14px 16px; background: #fff;
        }
        .jm-stat-tile__label { font-size: 12px; color: #6b6b6b; margin-bottom: 6px; }
        .jm-stat-tile__value { font-size: 26px; font-weight: 700; color: #1a1a1a; line-height: 1.1; }
        .jm-stat-tile__sub { font-size: 12px; color: #8a8a8a; margin-top: 4px; }
        .jm-bars { display: flex; flex-direction: column; gap: 8px; max-width: 480px; }
        .jm-bars__row { display: flex; align-items: center; gap: 10px; }
        .jm-bars__label { width: 28px; font-size: 13px; color: #4a4a4a; text-align: right; }
        .jm-bars__track { flex: 1; height: 14px; background: #f1f1f1; border-radius: 999px; overflow: hidden; }
        .jm-bars__fill { height: 100%; background: #f5a623; border-radius: 999px; }
        .jm-bars__count { width: 34px; font-size: 12px; color: #6b6b6b; }
        .jm-sort-field { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; }
        .jm-sort-field__input {
          font: inherit; font-size: 13px; padding: 6px 8px; border: 1px solid #c9cccf;
          border-radius: 6px; background: #fff; cursor: pointer;
        }
      `}</style>

      <s-section heading="Overview">
        <div className="jm-stat-grid">
          <StatTile label="Total reviews" value={totalReviews} />
          <StatTile label="Published" value={published} sub={totalReviews ? `${Math.round((published / totalReviews) * 100)}% of total` : null} />
          <StatTile label="Average rating" value={averageRating != null ? averageRating.toFixed(2) : "—"} sub={published ? `from ${published} published` : "no published reviews yet"} />
          <StatTile label="Pending" value={pending} sub="awaiting moderation" />
          <StatTile label="With photos" value={withImages} />
          <StatTile label="Replied to" value={withReply} />
          <StatTile label="Hidden / Spam / Rejected" value={`${hidden} / ${spam} / ${rejected}`} />
        </div>
      </s-section>

      <s-section heading="Rating breakdown">
        {totalReviews === 0 ? (
          <s-paragraph>No reviews yet — this fills in once shoppers start reviewing.</s-paragraph>
        ) : (
          <RatingBars distribution={distribution} maxCount={maxDistCount} />
        )}
      </s-section>

      <s-section heading="Needs attention (2★ and below)">
        <NeedsAttentionTable reviews={needsAttention} sortKey={sortKey} />
      </s-section>

      <s-section heading="Products to look into (published average ≤ 3★)">
        {problemProducts.length === 0 ? (
          <s-paragraph>No product is averaging 3★ or below — nothing flagged.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header listSlot="secondary">Average rating</s-table-header>
              <s-table-header listSlot="secondary">Published reviews</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {problemProducts.map((p) => (
                <s-table-row key={p.productId}>
                  <s-table-cell>{p.title}</s-table-cell>
                  <s-table-cell>{p.avgRating.toFixed(2)}★</s-table-cell>
                  <s-table-cell>{p.count}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
