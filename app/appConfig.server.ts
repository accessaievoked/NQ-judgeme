import db from "./db.server";

const APP_URL_KEY = "appUrl";

export async function setAppUrl(url: string): Promise<void> {
  await db.appConfig.upsert({
    where: { key: APP_URL_KEY },
    create: { key: APP_URL_KEY, value: url },
    update: { value: url },
  });
}

/** Falls back to SHOPIFY_APP_URL if the DB has nothing yet (e.g. first boot). */
export async function getAppUrl(): Promise<string> {
  const row = await db.appConfig.findUnique({ where: { key: APP_URL_KEY } });
  return row?.value || process.env.SHOPIFY_APP_URL || "";
}
