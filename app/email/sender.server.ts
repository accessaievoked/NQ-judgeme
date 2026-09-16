export interface ReviewRequestEmailInput {
  to: string;
  productTitle: string;
  token: string;
  shopDomain: string;
}

/**
 * Sends the "how was your order?" review-request email. No real provider is
 * wired up yet (needs Postmark/Resend/SES credentials) — with no
 * EMAIL_PROVIDER set, this logs instead of sending, so the scheduling
 * pipeline can be built and tested end-to-end before a provider is chosen.
 * Swap in the real call here when ready; nothing else in the app needs to
 * change.
 */
export async function sendReviewRequestEmail(
  input: ReviewRequestEmailInput,
): Promise<void> {
  const reviewUrl = `${process.env.SHOPIFY_APP_URL ?? ""}/r/${input.token}`;
  const provider = process.env.EMAIL_PROVIDER;

  if (!provider) {
    console.log(
      `[email:dev] review request -> ${input.to} for "${input.productTitle}": ${reviewUrl}`,
    );
    return;
  }

  throw new Error(
    `EMAIL_PROVIDER="${provider}" has no implementation yet. Add it here.`,
  );
}
