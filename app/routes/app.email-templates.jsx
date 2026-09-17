// app/routes/app.email-templates.jsx
import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { DEFAULT_TEMPLATES } from "../email/templates.server";
import RichTextEditor from "../components/RichTextEditor";

const TRIGGER_LABELS = {
  "orders/paid": "On order paid",
  "orders/fulfilled": "On order fulfilled",
  review_reminder: "Reminder (no review yet)",
  review_thankyou: "Thank you (after review submitted)",
};

const MERGE_TOKENS = [
  { label: "Customer name", value: "{{customerName}}" },
  { label: "Product title", value: "{{productTitle}}" },
  { label: "Shop name", value: "{{shopName}}" },
  { label: "Review link", value: "{{reviewUrl}}", isLink: true },
];

const REMINDER_TOKENS = [...MERGE_TOKENS, { label: "Reminder number", value: "{{reminderNumber}}" }];

// {{discountSection}} expands to a whole pre-built HTML block (code +
// expiry), or "" — only present when the shop's review discount is on and
// generation succeeded. Not a plain-text token, so it's listed but not
// mixed into a sentence.
const THANKYOU_TOKENS = [
  { label: "Customer name", value: "{{customerName}}" },
  { label: "Product title", value: "{{productTitle}}" },
  { label: "Shop name", value: "{{shopName}}" },
  { label: "Discount block (code + expiry, if enabled)", value: "{{discountSection}}" },
];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { shopId: null, templates: [] };

  const saved = await db.emailTemplate.findMany({ where: { shopId: shop.id } });

  return {
    shopId: shop.id,
    templates: Object.entries(DEFAULT_TEMPLATES).map(([triggerType, defaults]) => {
      const override = saved.find((t) => t.triggerType === triggerType);
      return {
        triggerType,
        label: TRIGGER_LABELS[triggerType] ?? triggerType,
        subject: override?.subject ?? defaults.subject,
        bodyHtml: override?.bodyHtml ?? defaults.bodyHtml,
        mode: override?.mode ?? "normal",
        isCustom: Boolean(override),
      };
    }),
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
    await db.emailTemplate.deleteMany({ where: { shopId: shop.id, triggerType } });
    return { ok: true, triggerType };
  }

  const subject = String(formData.get("subject") || "").slice(0, 300);
  const bodyHtml = String(formData.get("bodyHtml") || "").slice(0, 20000);
  const mode = formData.get("mode") === "html" ? "html" : "normal";

  await db.emailTemplate.upsert({
    where: { shopId_triggerType: { shopId: shop.id, triggerType } },
    create: { shopId: shop.id, triggerType, subject, bodyHtml, mode },
    update: { subject, bodyHtml, mode },
  });

  return { ok: true, triggerType, mode };
};

function TemplateEditor({ template }) {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [mode, setMode] = useState(template.mode);
  const tokens =
    template.triggerType === "review_reminder"
      ? REMINDER_TOKENS
      : template.triggerType === "review_thankyou"
        ? THANKYOU_TOKENS
        : MERGE_TOKENS;

  if (fetcher.data?.ok && fetcher.data.triggerType === template.triggerType) {
    shopify.toast.show("Template saved");
  }

  return (
    <s-section heading={template.label}>
      <fetcher.Form method="POST">
        <input type="hidden" name="triggerType" value={template.triggerType} />
        <input type="hidden" name="mode" value={mode} />
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base">
            <s-text>Editor:</s-text>
            <s-stack direction="inline" gap="tight">
              <s-button
                variant={mode === "normal" ? "primary" : "tertiary"}
                onClick={() => setMode("normal")}
              >
                Normal
              </s-button>
              <s-button
                variant={mode === "html" ? "primary" : "tertiary"}
                onClick={() => setMode("html")}
              >
                Complete coder (raw HTML)
              </s-button>
            </s-stack>
          </s-stack>

          {mode === "normal" ? (
            <s-paragraph>
              Use <strong>Insert token…</strong> in the toolbar below to drop in the
              customer&apos;s name, the product they bought, your shop name, or their
              personal review link — Shopify fills each one in automatically when
              the email is sent. <strong>Insert image</strong> and{" "}
              <strong>Insert file link</strong> take a URL you already have (e.g. a
              Shopify CDN link) rather than uploading a file directly.
            </s-paragraph>
          ) : (
            <s-paragraph>
              Full flexibility — write or paste any HTML/inline CSS you want,
              no toolbar limits. It&apos;s sent exactly as written, so there&apos;s no
              safety net here: preview it (Save, then check the Preview
              below) before relying on it. Same {"{{tokens}}"} work:{" "}
              {tokens.map((t) => t.value).join(", ")}.
            </s-paragraph>
          )}

          <s-text-field label="Subject" name="subject" defaultValue={template.subject}></s-text-field>

          <s-stack direction="block" gap="tight">
            <s-text type="strong">Body</s-text>
            {mode === "normal" ? (
              <RichTextEditor
                name="bodyHtml"
                defaultValue={template.bodyHtml}
                tokens={tokens}
              />
            ) : (
              <s-text-area
                label="Raw HTML"
                labelAccessibilityVisibility="exclusive"
                name="bodyHtml"
                rows={16}
                defaultValue={template.bodyHtml}
              ></s-text-area>
            )}
          </s-stack>

          <s-stack direction="inline" gap="tight">
            <s-button type="submit" name="intent" value="save" variant="primary">Save</s-button>
            {template.isCustom ? (
              <s-button type="submit" name="intent" value="reset">Reset to default</s-button>
            ) : null}
          </s-stack>
        </s-stack>
      </fetcher.Form>
    </s-section>
  );
}

export default function EmailTemplates() {
  const { templates } = useLoaderData();

  return (
    <s-page heading="Email templates">
      {templates.map((template) => (
        <TemplateEditor key={template.triggerType} template={template} />
      ))}
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
