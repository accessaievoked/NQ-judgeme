// app/routes/r.$token.jsx — public hosted review form, no Shopify auth.
import { Form, useActionData, useLoaderData } from "react-router";
import db from "../db.server";

export const loader = async ({ params }) => {
  const reviewRequest = await db.reviewRequest.findUnique({
    where: { token: params.token },
    include: { product: true, shop: true, review: true },
  });

  if (!reviewRequest) {
    throw new Response("This review link is invalid or has expired.", { status: 404 });
  }

  return {
    productTitle: reviewRequest.product?.title ?? "your order",
    productImageUrl: reviewRequest.product?.imageUrl ?? null,
    shopName: reviewRequest.shop.domain,
    alreadySubmitted: Boolean(reviewRequest.review),
  };
};

export const action = async ({ request, params }) => {
  const reviewRequest = await db.reviewRequest.findUnique({
    where: { token: params.token },
    include: { review: true },
  });

  if (!reviewRequest) {
    throw new Response("This review link is invalid or has expired.", { status: 404 });
  }
  if (reviewRequest.review) {
    return { ok: true, alreadySubmitted: true };
  }

  const formData = await request.formData();
  const rating = Number(formData.get("rating"));
  const title = String(formData.get("title") || "").trim().slice(0, 200) || null;
  const body = String(formData.get("body") || "").trim().slice(0, 5000) || null;
  const authorName = String(formData.get("authorName") || "").trim().slice(0, 100) || null;

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Please choose a star rating." };
  }
  if (!reviewRequest.productId) {
    return { ok: false, error: "This review link isn't tied to a product." };
  }

  await db.review.create({
    data: {
      shopId: reviewRequest.shopId,
      productId: reviewRequest.productId,
      reviewRequestId: reviewRequest.id,
      customerId: reviewRequest.customerId,
      rating,
      title,
      body,
      authorName,
    },
  });

  await db.reviewRequest.update({
    where: { id: reviewRequest.id },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  return { ok: true, submitted: true };
};

const PAGE_STYLE = {
  fontFamily: "-apple-system, Segoe UI, Roboto, sans-serif",
  maxWidth: 480,
  margin: "48px auto",
  padding: "0 20px",
  color: "#1a1a1a",
};

export default function ReviewForm() {
  const data = useLoaderData();
  const actionData = useActionData();

  if (data.alreadySubmitted || actionData?.submitted) {
    return (
      <div style={PAGE_STYLE}>
        <h1>Thanks — already got it!</h1>
        <p>Your review for {data.productTitle} has been received.</p>
      </div>
    );
  }

  return (
    <div style={PAGE_STYLE}>
      <h1 style={{ fontSize: 24 }}>How was {data.productTitle}?</h1>
      <p style={{ color: "#555" }}>From {data.shopName}</p>

      {data.productImageUrl ? (
        <img
          src={data.productImageUrl}
          alt={data.productTitle}
          style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8, marginBottom: 16 }}
        />
      ) : null}

      <Form method="POST">
        <fieldset style={{ border: 0, padding: 0, marginBottom: 20 }}>
          <legend style={{ fontWeight: 600, marginBottom: 8 }}>Your rating</legend>
          <div style={{ display: "flex", flexDirection: "row-reverse", justifyContent: "flex-end", gap: 4 }}>
            {[5, 4, 3, 2, 1].map((value) => (
              <label key={value} style={{ cursor: "pointer" }}>
                <input
                  type="radio"
                  name="rating"
                  value={value}
                  required
                  style={{ display: "none" }}
                  className="star-input"
                />
                <span style={{ fontSize: 32, color: "#ddd" }} className="star">★</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Title (optional)</div>
          <input
            type="text"
            name="title"
            maxLength={200}
            style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Your review</div>
          <textarea
            name="body"
            rows={4}
            maxLength={5000}
            style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
          ></textarea>
        </label>

        <label style={{ display: "block", marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Your name (optional)</div>
          <input
            type="text"
            name="authorName"
            maxLength={100}
            style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
          />
        </label>

        {actionData?.error ? (
          <p style={{ color: "#c0392b", marginBottom: 12 }}>{actionData.error}</p>
        ) : null}

        <button
          type="submit"
          style={{
            background: "#1a1a1a",
            color: "#fff",
            border: 0,
            padding: "12px 24px",
            borderRadius: 6,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Submit review
        </button>
      </Form>

      <style>{`
        /* DOM order is 5,4,3,2,1 with row-reverse display (so 1..5 reads
           left-to-right); highlight the checked star and everything after
           it in DOM order, which is every lower value visually to its left. */
        label:has(.star-input:checked) .star,
        label:has(.star-input:checked) ~ label .star {
          color: #f5a623;
        }
      `}</style>
    </div>
  );
}
