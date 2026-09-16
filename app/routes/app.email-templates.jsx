// app/routes/app.email-templates.jsx
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { DEFAULT_TEMPLATES } from "../email/templates.server";

const TRIGGER_LABELS = {
  "orders/paid": "On order paid",
  "orders/fulfilled": "On order fulfilled",
};

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

  await db.emailTemplate.upsert({
    where: { shopId_triggerType: { shopId: shop.id, triggerType } },
    create: { shopId: shop.id, triggerType, subject, bodyHtml },
    update: { subject, bodyHtml },
  });

  return { ok: true, triggerType };
};

function TemplateEditor({ template }) {
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  if (fetcher.data?.ok && fetcher.data.triggerType === template.triggerType) {
    shopify.toast.show("Template saved");
  }

  return (
    <s-section heading={template.label}>
      <fetcher.Form method="POST">
        <input type="hidden" name="triggerType" value={template.triggerType} />
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Tokens: {"{{customerName}}"} {"{{productTitle}}"} {"{{shopName}}"} {"{{reviewUrl}}"}
          </s-paragraph>

          <s-text-field label="Subject" name="subject" defaultValue={template.subject}></s-text-field>

          <s-text-area label="Body (HTML)" name="bodyHtml" rows={8} defaultValue={template.bodyHtml}></s-text-area>

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
