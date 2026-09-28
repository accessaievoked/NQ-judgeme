# Deploying to Fly.io

Three separate Fly apps, each its own Docker container, matching how this
app is structured locally (`npm run dev` for the web process, `npm run
worker` for the BullMQ worker, `docker-compose.yml`'s Redis for the queue):

| Fly app | Config file | Dockerfile | Purpose |
|---|---|---|---|
| `judgeme-demo-app` | `fly.toml` | `Dockerfile` | Web process — OAuth, webhooks, app proxy, embedded admin UI |
| `judgeme-demo-app-worker` | `fly.worker.toml` | `Dockerfile.worker` | BullMQ worker — shop sync, webhook processing, review request/reminder/thank-you emails |
| `judgeme-demo-app-redis` | `fly.redis.toml` | `Dockerfile.redis` | Redis backing BullMQ — private network only, never public |

Postgres is **not** part of this — `DATABASE_URL` already points at your
existing Neon database (see `prisma/schema.prisma`); nothing to stand up.

All three app names above must be globally unique across every Fly account,
not just yours — pick your own names, then update them consistently in
`fly.toml`, `fly.worker.toml`, `fly.redis.toml`, and anywhere referenced
below. This guide uses the names above as placeholders.

## 0. Prerequisites

```bash
# Install flyctl if you haven't
curl -L https://fly.io/install.sh | sh

fly auth login
```

You'll also want the Shopify CLI already set up for this project (it is, if
you've been running `npm run dev`) — `shopify app config link` should
already have connected this repo to your app in the Partner Dashboard.

## 1. Create the three Fly apps

```bash
fly apps create judgeme-demo-app
fly apps create judgeme-demo-app-worker
fly apps create judgeme-demo-app-redis
```

## 2. Redis: volume, secret, deploy

Redis needs a persistent volume (queued/in-flight jobs survive a restart)
and a password (`Dockerfile.redis` requires `REDIS_PASSWORD` — the stock
Redis image has no auth by default, and this shouldn't be reachable by
anything that guesses the hostname).

```bash
fly volumes create redis_data --app judgeme-demo-app-redis --region iad --size 1

# Generate a password and remember it — you'll reuse it in step 4's REDIS_URL
REDIS_PASSWORD=$(openssl rand -hex 24)
echo "$REDIS_PASSWORD"   # copy this somewhere

fly secrets set REDIS_PASSWORD="$REDIS_PASSWORD" --app judgeme-demo-app-redis

fly deploy --config fly.redis.toml --app judgeme-demo-app-redis
```

Redis is now reachable *only* from other Fly apps in the same org, at
`judgeme-demo-app-redis.internal:6379` — no `[[services]]`/`[http_service]`
block means no public ingress at all.

## 3. Set the app URL and update Shopify's config

Your web app's public URL will be `https://judgeme-demo-app.fly.dev` (or a
custom domain you attach later). Update these two places to match *before*
deploying:

- `shopify.app.toml`: `application_url`, `[app_proxy].url`, and
  `[auth].redirect_urls` all currently say `https://localhost` — change
  every one to your real Fly URL (e.g.
  `https://judgeme-demo-app.fly.dev/apps/reviews` for the proxy URL,
  `https://judgeme-demo-app.fly.dev/api/auth` for the redirect URL).
- Then push that config to the Partner Dashboard:
  ```bash
  npm run deploy   # runs `shopify app deploy`
  ```
  (This deploys the *app configuration* — scopes, webhooks, app proxy,
  redirect URLs — not your code. Confirm the prompt to update the live app
  config.)

## 4. Set secrets on the web app

```bash
fly secrets set \
  DATABASE_URL="<your Neon connection string>" \
  ENCRYPTION_KEY="<your base64 32-byte key>" \
  SHOPIFY_API_KEY="<from shopify.app.toml's client_id / Partner Dashboard>" \
  SHOPIFY_API_SECRET="<from Partner Dashboard > App setup > Client secret>" \
  SCOPES="write_products,write_metaobjects,write_metaobject_definitions,read_orders,read_customers,write_files,read_discounts,write_discounts" \
  SHOPIFY_APP_URL="https://judgeme-demo-app.fly.dev" \
  REDIS_URL="redis://:$REDIS_PASSWORD@judgeme-demo-app-redis.internal:6379" \
  SMTP_HOST="<e.g. smtp.gmail.com>" \
  SMTP_PORT="465" \
  SMTP_USER="<your SMTP username>" \
  SMTP_PASS="<your SMTP password / app password>" \
  SMTP_FROM_NAME="Judge.me Reviews" \
  --app judgeme-demo-app
```

Leave the four `SMTP_*` ones out if you don't have SMTP set up yet — the app
falls back to logging emails to the console instead of sending them
(`app/email/sender.server.ts`), which is fine for testing.

## 5. Set secrets on the worker app

Same values, minus `SHOPIFY_APP_URL` (the worker never serves HTTP, so it
doesn't matter what it's set to — but it still needs to be *set* to
something non-empty or `shopifyApp()` throws on import):

```bash
fly secrets set \
  DATABASE_URL="<same Neon connection string>" \
  ENCRYPTION_KEY="<same key>" \
  SHOPIFY_API_KEY="<same>" \
  SHOPIFY_API_SECRET="<same>" \
  SCOPES="<same>" \
  SHOPIFY_APP_URL="https://judgeme-demo-app.fly.dev" \
  REDIS_URL="redis://:$REDIS_PASSWORD@judgeme-demo-app-redis.internal:6379" \
  SMTP_HOST="<same>" \
  SMTP_PORT="465" \
  SMTP_USER="<same>" \
  SMTP_PASS="<same>" \
  SMTP_FROM_NAME="Judge.me Reviews" \
  --app judgeme-demo-app-worker
```

## 6. Deploy the web app and the worker

```bash
fly deploy --app judgeme-demo-app              # uses fly.toml + Dockerfile by default
fly deploy --config fly.worker.toml --app judgeme-demo-app-worker
```

The web app's container runs `npm run docker-start` on boot, which applies
any pending Prisma migrations (`prisma migrate deploy`) before starting the
server — safe to run on every deploy/restart, including if you later scale
to multiple web machines (Prisma takes an advisory lock).

## 7. Verify

```bash
fly status --app judgeme-demo-app
fly status --app judgeme-demo-app-worker
fly status --app judgeme-demo-app-redis

fly logs --app judgeme-demo-app          # should show the server starting
fly logs --app judgeme-demo-app-worker   # should show "Workers started: ..."
```

Visit `https://judgeme-demo-app.fly.dev` — you should see the plain landing
page (`app/routes/_index/route.jsx`), confirming the web app is up.

## 8. Install it on a Shopify store

You don't need an App Store listing to install this on a store — any store
your Partner organization has access to (its own development stores, or a
store where you've generated a custom-app link) works.

**Easiest path — a development store you already have:**

1. Partner Dashboard → your app → **Test your app** (or **Select store** on
   the app overview page).
2. Pick the development store from the dropdown.
3. It opens `https://<store>.myshopify.com/admin/oauth/install...` in your
   browser and walks you through the standard OAuth install/consent screen
   (showing the scopes from `shopify.app.toml`).
4. Approve it — you land in that store's admin with the app installed,
   under **Apps**.

**Alternative — install link by hand**, if you'd rather not go through the
dashboard:

```
https://<your-store>.myshopify.com/admin/oauth/authorize?client_id=<SHOPIFY_API_KEY>&scope=<SCOPES, comma-separated>&redirect_uri=https://judgeme-demo-app.fly.dev/api/auth&state=<any-random-string>
```

Replace `<your-store>` with the store's `.myshopify.com` handle,
`<SHOPIFY_API_KEY>` and `<SCOPES>` with the same values from step 4. Visiting
that URL while logged into the store's admin starts the same OAuth flow.

**If it's not a development store** (a real merchant's live store, and your
app isn't listed on the App Store): the store owner needs to either (a) be
added as a collaborator/dev-store to your Partner org first, or (b) you
distribute it as a **custom app** instead of `AppDistribution.AppStore` (see
`app/shopify.server.ts`) — that's a bigger change (custom-app installs skip
the public review process but are scoped to one store via a different
install flow) and out of scope here; ask if you want that path instead.

Once installed, `afterAuth` in `app/shopify.server.ts` fires immediately —
it upserts the `Shop` row and enqueues a catalog sync job, which only
actually processes once your worker app (step 6) is up and connected to the
same Redis.

## Redeploying after code changes

```bash
fly deploy --app judgeme-demo-app                              # web
fly deploy --config fly.worker.toml --app judgeme-demo-app-worker   # worker
```

Redis (`fly.redis.toml`) only needs redeploying if you change
`Dockerfile.redis` itself — its data lives on the volume, untouched by app
deploys.
