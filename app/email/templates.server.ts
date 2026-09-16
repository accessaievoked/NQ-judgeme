const WRAPPER_STYLE =
  "font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a1a1a;";
const BUTTON_STYLE =
  "display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;margin-top:16px;";

function wrap(body: string): string {
  return `<div style="${WRAPPER_STYLE}">${body}</div>`;
}

/** Day 0: sent right after an order is placed. No review ask yet — just a thank-you. */
export function day0IntroTemplate(input: { shopName: string; customerName?: string }) {
  const greeting = input.customerName ? `Hi ${input.customerName},` : "Hi there,";
  return {
    subject: `Thanks for your order from ${input.shopName}!`,
    html: wrap(`
      <h2 style="margin-top:0;">${greeting}</h2>
      <p>Thanks so much for shopping with <strong>${input.shopName}</strong> — your order is on its way.</p>
      <p>Once it arrives, we'll follow up with a quick link to share what you think. No action needed from you right now.</p>
      <p style="color:#666;font-size:13px;margin-top:32px;">— ${input.shopName}</p>
    `),
  };
}

/** The actual review ask, with the /r/:token link. Default for any trigger type. */
export function reviewRequestTemplate(input: {
  shopName: string;
  productTitle: string;
  reviewUrl: string;
  customerName?: string;
}) {
  const greeting = input.customerName ? `Hi ${input.customerName},` : "Hi there,";
  return {
    subject: `How's your ${input.productTitle}?`,
    html: wrap(`
      <h2 style="margin-top:0;">${greeting}</h2>
      <p>You recently bought <strong>${input.productTitle}</strong> from <strong>${input.shopName}</strong>.
      Mind leaving a quick review? It takes less than a minute and really helps.</p>
      <p style="text-align:center;">
        <a href="${input.reviewUrl}" style="${BUTTON_STYLE}">Leave a review</a>
      </p>
      <p style="color:#666;font-size:13px;margin-top:32px;">— ${input.shopName}</p>
    `),
  };
}

/**
 * Picks the template for a trigger type. "orders/paid" gets the no-ask
 * thank-you (order isn't even delivered yet); everything else — fulfilled,
 * or any future trigger — gets the real review ask.
 */
export function resolveTemplate(
  triggerType: string,
  input: { shopName: string; productTitle: string; reviewUrl: string; customerName?: string },
) {
  if (triggerType === "orders/paid") return day0IntroTemplate(input);
  return reviewRequestTemplate(input);
}
