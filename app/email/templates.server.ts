import db from "../db.server";
import { compileEmailLayoutHtml, type EmailElement } from "./emailLayoutCompiler";

export interface TemplateTokens {
  customerName?: string;
  productTitle: string;
  shopName: string;
  reviewUrl?: string;
  reminderNumber?: number;
  // Pre-rendered HTML block (or "" for none) — used by review_thankyou to
  // conditionally show a discount code without a full conditional-block
  // templating syntax. See reviewRequests/sendThankYou.server.ts.
  discountSection?: string;
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
  // Not tied to a Shopify webhook — fired by the no-review-yet reminder
  // chain (see reviewRequests/sendReminder.server.ts). {{reminderNumber}}
  // is this reminder's 1-based position (1, 2, or 3).
  review_reminder: {
    subject: "Reminder: how's your {{productTitle}}?",
    bodyHtml: `<div style="${WRAPPER_STYLE}">
      <h2 style="margin-top:0;">Hi {{customerName}},</h2>
      <p>Just a friendly reminder (#{{reminderNumber}}) — we'd still love to hear
      what you think of <strong>{{productTitle}}</strong> from <strong>{{shopName}}</strong>.</p>
      <p style="text-align:center;">
        <a href="{{reviewUrl}}" style="${BUTTON_STYLE}">Leave a review</a>
      </p>
      <p style="color:#666;font-size:13px;margin-top:32px;">— {{shopName}}</p>
    </div>`,
  },
  // Fired after a review is actually submitted (r.$token.jsx action), not
  // tied to a webhook. {{discountSection}} is "" when the shop has the
  // thank-you discount off, the discount call failed, or there's no
  // customer email to send a code to — the wording below reads fine either
  // way since the discount block is a self-contained aside.
  review_thankyou: {
    subject: "Thanks for reviewing {{productTitle}}!",
    bodyHtml: `<div style="${WRAPPER_STYLE}">
      <h2 style="margin-top:0;">Thanks, {{customerName}}!</h2>
      <p>We really appreciate you taking the time to review
      <strong>{{productTitle}}</strong> from <strong>{{shopName}}</strong>.</p>
      {{discountSection}}
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
    .replace(/\{\{\s*reviewUrl\s*\}\}/g, tokens.reviewUrl ?? "")
    .replace(/\{\{\s*reminderNumber\s*\}\}/g, String(tokens.reminderNumber ?? ""))
    .replace(/\{\{\s*discountSection\s*\}\}/g, tokens.discountSection ?? "");
}

// Resolution order: a saved EmailLayout (the visual canvas builder) wins
// first, then a saved EmailTemplate (the older rich-text/raw-HTML editor),
// then the built-in default for that trigger, or the review-ask default for
// anything unknown. A shop only ever has one or the other in practice (each
// editor writes its own table), but checking EmailLayout first means
// switching a trigger over to the canvas builder always takes effect
// immediately without needing to also clear out any EmailTemplate row.
export async function resolveTemplate(
  shopId: string,
  triggerType: string,
  tokens: TemplateTokens,
): Promise<{ subject: string; html: string }> {
  const layout = await db.emailLayout.findUnique({
    where: { shopId_triggerType: { shopId, triggerType } },
  });
  if (layout) {
    const html =
      layout.mode === "html"
        ? layout.rawHtml
        : compileEmailLayoutHtml(Array.isArray(layout.elements) ? (layout.elements as unknown as EmailElement[]) : [], layout.canvasWidth);
    return {
      subject: fillTokens(layout.subject, tokens),
      html: fillTokens(html, tokens),
    };
  }

  const custom = await db.emailTemplate.findUnique({
    where: { shopId_triggerType: { shopId, triggerType } },
  });
  const template = custom ?? DEFAULT_TEMPLATES[triggerType] ?? FALLBACK_TEMPLATE;

  return {
    subject: fillTokens(template.subject, tokens),
    html: fillTokens(template.bodyHtml, tokens),
  };
}
