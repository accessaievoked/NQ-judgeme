import nodemailer from "nodemailer";

export interface SendEmailInput {
  to: string;
  toName?: string;
  subject: string;
  html: string;
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null | undefined;

// Uses SMTP_* env vars (e.g. Gmail + an app password). No creds set ->
// null -> callers fall back to console logging.
function getTransporter() {
  if (transporter !== undefined) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    transporter = null;
    return transporter;
  }

  const port = Number(process.env.SMTP_PORT) || 465;
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transporter;
}

// Strip tags for a plain-text fallback — HTML-only single-link emails get
// flagged as spam far more often than ones with a text alternative.
function htmlToText(html: string): string {
  return html
    .replace(/<a\s+[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const client = getTransporter();

  if (!client) {
    console.log(`[email:dev] to=${input.to} subject="${input.subject}"\n${input.html}`);
    return;
  }

  await client.sendMail({
    from: `"${process.env.SMTP_FROM_NAME || "Judge.me Reviews"}" <${process.env.SMTP_USER}>`,
    to: input.toName ? `"${input.toName}" <${input.to}>` : input.to,
    subject: input.subject,
    html: input.html,
    text: htmlToText(input.html),
  });
}
