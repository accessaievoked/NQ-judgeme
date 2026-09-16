import db from "../db.server";

export interface TemplateTokens {
  customerName?: string;
  productTitle: string;
  shopName: string;
  reviewUrl: string;
}

const WRAPPER_STYLE =
  "font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a1a1a;";
const BUTTON_STYLE =
  "display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;margin-top:16px;";

// Default wording per trigger, as plain {{token}} strings — same format a
// vendor's custom EmailTemplate row uses, so both go through one fill path.
export const DEFAULT_TEMPLATES: Record<string, { subject: string; bodyHtml: string }> = {
  "orders/paid": {
    subject: "How's your {{productTitle}}?",
    bodyHtml: `<div style="${WRAPPER_STYLE}">
      <p>Hi {{customerName}}, thanks for ordering {{productTitle}} from {{shopName}}.</p>
      <p>We'd love to hear what you think once you've had a chance to try it out.</p>
      <p><a href="{{reviewUrl}}">Leave a review</a></p>
      <p style="color:#666;font-size:13px;">— {{shopName}}</p>
    </div>`,
  },
  "orders/fulfilled": {
    subject: "How's your {{productTitle}}?",
    bodyHtml: `<div style="${WRAPPER_STYLE}">
      <h2 style="margin-top:0;">Hi {{customerName}},</h2>
      <p>You recently bought <strong>{{productTitle}}</strong> from <strong>{{shopName}}</strong>.
      Mind leaving a quick review? It takes less than a minute and really helps.</p>
      <p style="text-align:center;">
        <a href="{{reviewUrl}}" style="${BUTTON_STYLE}">Leave a review</a>
      </p>
      <p style="color:#666;font-size:13px;margin-top:32px;">— {{shopName}}</p>
    </div>`,
  },
};

const FALLBACK_TEMPLATE = DEFAULT_TEMPLATES["orders/fulfilled"];

function fillTokens(text: string, tokens: TemplateTokens): string {
  return text
    .replace(/\{\{\s*customerName\s*\}\}/g, tokens.customerName || "there")
    .replace(/\{\{\s*productTitle\s*\}\}/g, tokens.productTitle)
    .replace(/\{\{\s*shopName\s*\}\}/g, tokens.shopName)
    .replace(/\{\{\s*reviewUrl\s*\}\}/g, tokens.reviewUrl);
}

// Vendor's saved EmailTemplate wins; otherwise fall back to the built-in
// default for that trigger, or the review-ask default for anything unknown.
export async function resolveTemplate(
  shopId: string,
  triggerType: string,
  tokens: TemplateTokens,
): Promise<{ subject: string; html: string }> {
  const custom = await db.emailTemplate.findUnique({
    where: { shopId_triggerType: { shopId, triggerType } },
  });
  const template = custom ?? DEFAULT_TEMPLATES[triggerType] ?? FALLBACK_TEMPLATE;

  return {
    subject: fillTokens(template.subject, tokens),
    html: fillTokens(template.bodyHtml, tokens),
  };
}
