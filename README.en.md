# Sub2ApiPay

**Language**: [中文](./README.md) | English (current)

Sub2ApiPay is a self-hosted payment gateway built for the [Sub2API](https://sub2api.com) platform. It supports four payment channels — **EasyPay** (aggregated Alipay/WeChat Pay), **Alipay** (official), **WeChat Pay** (official), and **Stripe** — with both pay-as-you-go balance top-up and subscription plans. Once a payment is confirmed, the system automatically calls the Sub2API management API to credit the user's balance or activate the subscription — no manual intervention required.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
- [Sub2API Integration](#sub2api-integration)
- [Admin Panel](#admin-panel)
- [Payment Flow](#payment-flow)
- [API Endpoints](#api-endpoints)
- [Development](#development)

---

## Features

- **Four Payment Channels** — EasyPay aggregation, Alipay (official), WeChat Pay (official), Stripe
- **Dual Billing Modes** — Pay-as-you-go balance top-up + subscription plans
- **Auto Balance Credit** — Automatically calls Sub2API after payment verification, fully hands-free
- **Full Order Lifecycle** — Auto-expiry, user cancellation, admin cancellation, refunds
- **Limit Controls** — Per-transaction cap, daily per-user cap, daily per-channel global cap
- **Security** — Token auth, RSA2/MD5/Webhook signature verification, timing-safe comparison, full audit log
- **Responsive UI** — PC + mobile adaptive layout, dark/light theme, iframe embed support
- **Bilingual** — Automatic Chinese/English interface adaptation
- **Admin Panel** — Dashboard, order management (pagination/filtering/retry/refund), channel & subscription management

> **EasyPay Recommendation**: We personally recommend [ZPay](https://z-pay.cn/?uid=23808) as an EasyPay provider (referral link — feel free to remove). ZPay supports **individual users** (no business license) with a daily limit of ¥10,000; business license holders have no limit. Please evaluate the security, reliability, and compliance of any third-party payment provider on your own — this project does not endorse or guarantee any specific provider.

<details>
<summary>ZPay Registration QR Code</summary>

![ZPay Preview](./docs/zpay-preview.png)

</details>

---

## Tech Stack

| Category        | Technology                 |
| --------------- | -------------------------- |
| Framework       | Next.js 16 (App Router)    |
| Language        | TypeScript 5 + React 19    |
| Styling         | TailwindCSS 4              |
| ORM             | Prisma 7 (adapter-pg mode) |
| Database        | PostgreSQL 16              |
| Container       | Docker + Docker Compose    |
| Package Manager | pnpm                       |

---

## Quick Start

### Using Docker Hub Image (Recommended)

No Node.js or pnpm required on the server — just Docker.

```bash
mkdir -p /opt/sub2apipay && cd /opt/sub2apipay

# Download Compose file and env template
curl -O https://raw.githubusercontent.com/touwaeriol/sub2apipay/main/docker-compose.hub.yml
curl -O https://raw.githubusercontent.com/touwaeriol/sub2apipay/main/.env.example
cp .env.example .env

# Fill in required environment variables
nano .env

# Start (includes bundled PostgreSQL)
docker compose -f docker-compose.hub.yml up -d
```

### Build from Source

```bash
git clone https://github.com/touwaeriol/sub2apipay.git
cd sub2apipay
cp .env.example .env
nano .env
docker compose up -d --build
```

---

## Environment Variables

See [`.env.example`](./.env.example) for the full template.

### Core (Required)

| Variable                | Description                                                |
| ----------------------- | ---------------------------------------------------------- |
| `SUB2API_BASE_URL`      | Sub2API service URL, e.g. `https://sub2api.com`            |
| `SUB2API_ADMIN_API_KEY` | Sub2API admin API key                                      |
| `ADMIN_TOKEN`           | Admin panel access token (use a strong random string)      |
| `NEXT_PUBLIC_APP_URL`   | Public URL of this service, e.g. `https://pay.example.com` |

> `DATABASE_URL` is automatically injected by Docker Compose when using the bundled database.

### Payment Providers & Methods

**Step 1**: Declare which payment providers to load via `PAYMENT_PROVIDERS` (comma-separated):

```env
# Available: easypay, alipay, wxpay, stripe
# Example: EasyPay only
PAYMENT_PROVIDERS=easypay
# Example: Alipay + WeChat Pay + Stripe (official channels)
PAYMENT_PROVIDERS=alipay,wxpay,stripe
```

> **Alipay / WeChat Pay (official)** and **EasyPay** can coexist. Official channels connect directly to Alipay/WeChat Pay APIs with funds going straight to your merchant account and lower fees; EasyPay uses a third-party aggregation platform with a lower barrier to entry. When using EasyPay, choose providers where funds are routed through official Alipay/WeChat Pay channels rather than third-party collection.

#### EasyPay (Alipay / WeChat Pay Aggregation)

Any payment provider compatible with the **EasyPay protocol** can be used.

| Variable              | Description                                                      |
| --------------------- | ---------------------------------------------------------------- |
| `EASY_PAY_PID`        | EasyPay merchant ID                                              |
| `EASY_PAY_PKEY`       | EasyPay merchant secret key                                      |
| `EASY_PAY_API_BASE`   | EasyPay API base URL                                             |
| `EASY_PAY_NOTIFY_URL` | Async callback URL: `${NEXT_PUBLIC_APP_URL}/api/easy-pay/notify` |
| `EASY_PAY_RETURN_URL` | Redirect URL after payment: `${NEXT_PUBLIC_APP_URL}/pay/result`  |
| `EASY_PAY_CID_ALIPAY` | Alipay channel ID (optional)                                     |
| `EASY_PAY_CID_WXPAY`  | WeChat Pay channel ID (optional)                                 |

#### Alipay (Official)

Direct integration with the Alipay Open Platform. Supports PC page payment (`alipay.trade.page.pay`) and mobile web payment (`alipay.trade.wap.pay`), automatically switching based on device type.

| Variable             | Description                                    |
| -------------------- | ---------------------------------------------- |
| `ALIPAY_APP_ID`      | Alipay application AppID                       |
| `ALIPAY_PRIVATE_KEY` | Application private key (content or file path) |
| `ALIPAY_PUBLIC_KEY`  | Alipay public key (content or file path)       |
| `ALIPAY_NOTIFY_URL`  | Async callback URL                             |
| `ALIPAY_RETURN_URL`  | Sync redirect URL (optional)                   |

#### WeChat Pay (Official)

Direct integration with WeChat Pay APIv3. Supports Native QR code payment and H5 payment, with mobile devices preferring H5 and auto-fallback to QR code.

| Variable              | Description                                     |
| --------------------- | ----------------------------------------------- |
| `WXPAY_APP_ID`        | WeChat Pay AppID                                |
| `WXPAY_MCH_ID`        | Merchant ID                                     |
| `WXPAY_PRIVATE_KEY`   | Merchant API private key (content or file path) |
| `WXPAY_CERT_SERIAL`   | Merchant certificate serial number              |
| `WXPAY_API_V3_KEY`    | APIv3 key                                       |
| `WXPAY_PUBLIC_KEY`    | WeChat Pay public key (content or file path)    |
| `WXPAY_PUBLIC_KEY_ID` | WeChat Pay public key ID                        |
| `WXPAY_NOTIFY_URL`    | Async callback URL                              |

#### Stripe

| Variable                 | Description                                 |
| ------------------------ | ------------------------------------------- |
| `STRIPE_SECRET_KEY`      | Stripe secret key (`sk_live_...`)           |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_live_...`)      |
| `STRIPE_WEBHOOK_SECRET`  | Stripe webhook signing secret (`whsec_...`) |

> Stripe webhook endpoint: `${NEXT_PUBLIC_APP_URL}/api/stripe/webhook`
> Subscribe to: `payment_intent.succeeded`, `payment_intent.payment_failed`

### Business Rules

| Variable                         | Description                                       | Default                    |
| -------------------------------- | ------------------------------------------------- | -------------------------- |
| `MIN_RECHARGE_AMOUNT`            | Minimum amount per transaction (CNY)              | `1`                        |
| `MAX_RECHARGE_AMOUNT`            | Maximum amount per transaction (CNY)              | `1000`                     |
| `MAX_DAILY_RECHARGE_AMOUNT`      | Daily cumulative max per user (`0` = unlimited)   | `10000`                    |
| `MAX_DAILY_AMOUNT_ALIPAY`        | EasyPay Alipay channel daily global limit (opt.)  | Provider default           |
| `MAX_DAILY_AMOUNT_ALIPAY_DIRECT` | Alipay official channel daily global limit (opt.) | Provider default           |
| `MAX_DAILY_AMOUNT_WXPAY`         | WeChat Pay channel daily global limit (opt.)      | Provider default           |
| `MAX_DAILY_AMOUNT_STRIPE`        | Stripe channel daily global limit (opt.)          | Provider default           |
| `ORDER_TIMEOUT_MINUTES`          | Order expiry in minutes                           | `5`                        |
| `PRODUCT_NAME`                   | Product name shown on payment page                | `Sub2API Balance Recharge` |

### UI Customization (Optional)

Display a support contact image and description on the right side of the payment page.

| Variable             | Description                                                                     |
| -------------------- | ------------------------------------------------------------------------------- |
| `PAY_HELP_IMAGE_URL` | Help image URL — external URL or local path (see below)                         |
| `PAY_HELP_TEXT`      | Help text; use `\n` for line breaks, e.g. `Scan to add WeChat\nMon–Fri 9am–6pm` |

**Two ways to provide the image:**

- **External URL** (recommended — no Compose changes needed): any publicly accessible image link (CDN, OSS, image hosting).

  ```env
  PAY_HELP_IMAGE_URL=https://cdn.example.com/help-qr.jpg
  ```

- **Local file**: place the image in `./uploads/` and reference it as `/uploads/<filename>`.
  The directory must be mounted in `docker-compose.app.yml` (included by default):
  ```yaml
  volumes:
    - ./uploads:/app/public/uploads:ro
  ```
  ```env
  PAY_HELP_IMAGE_URL=/uploads/help-qr.jpg
  ```

> Clicking the help image opens it full-screen in the center of the screen.

### Docker Compose Variables

| Variable      | Description                      | Default                               |
| ------------- | -------------------------------- | ------------------------------------- |
| `APP_PORT`    | Host port mapping                | `3001`                                |
| `DB_PASSWORD` | PostgreSQL password (bundled DB) | `password` (**change in production**) |

---

## Deployment

### Option 1: Docker Hub Image + Bundled Database

Use `docker-compose.hub.yml` — the simplest deployment:

```bash
docker compose -f docker-compose.hub.yml up -d
```

Image: [`touwaeriol/sub2apipay:latest`](https://hub.docker.com/r/touwaeriol/sub2apipay)

### Option 2: Docker Hub Image + External Database

For existing PostgreSQL instances (shared with other services):

1. Set `DATABASE_URL` in `.env`
2. Use `docker-compose.app.yml` (app only, no DB):

```bash
docker compose -f docker-compose.app.yml up -d
```

### Option 3: Build from Source

For custom builds after modifications:

```bash
# On the build server
docker compose build
docker tag sub2apipay-app:latest touwaeriol/sub2apipay:latest
docker push touwaeriol/sub2apipay:latest

# On the deploy server
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

### Reverse Proxy

The default host port is `3001` (configurable via `APP_PORT`). Use Nginx or Caddy as a reverse proxy with HTTPS:

```nginx
server {
    listen 443 ssl;
    server_name pay.example.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Database Migrations

Migrations run automatically on container startup via `prisma migrate deploy`. To run manually:

```bash
docker compose exec app npx prisma migrate deploy
```

---

## Sub2API Integration

Assuming this service is deployed at `https://pay.example.com`.

### User-Facing Pages

Configure the following URLs in the Sub2API admin panel under **Recharge Settings**, so users can navigate from Sub2API to the payment and order pages:

| Setting   | URL                                  | Description                                        |
| --------- | ------------------------------------ | -------------------------------------------------- |
| Payment   | `https://pay.example.com/pay`        | User top-up & subscription purchase page           |
| My Orders | `https://pay.example.com/pay/orders` | User views their own recharge/subscription history |

Sub2API **v0.1.88** and above will automatically append the following parameters — no manual query string needed:

| Parameter | Description                                       |
| --------- | ------------------------------------------------- |
| `user_id` | Sub2API user ID                                   |
| `token`   | User login token (required to view order history) |
| `theme`   | `light` (default) or `dark`                       |
| `lang`    | Interface language, `zh` (default) or `en`        |
| `ui_mode` | `standalone` (default) or `embedded` (for iframe) |

### Admin Panel

The admin panel is authenticated via the `token` URL parameter (set to the `ADMIN_TOKEN` environment variable). When integrating with Sub2API, just configure the paths — **no query parameters needed** — Sub2API will automatically append `token` and other parameters:

| Page          | URL                                           | Description                                                   |
| ------------- | --------------------------------------------- | ------------------------------------------------------------- |
| Overview      | `https://pay.example.com/admin`               | Aggregated entry with card-style navigation                   |
| Orders        | `https://pay.example.com/admin/orders`        | Filter by status, paginate, view details, retry/cancel/refund |
| Dashboard     | `https://pay.example.com/admin/dashboard`     | Revenue stats, order trends, payment method breakdown         |
| Channels      | `https://pay.example.com/admin/channels`      | Configure API channels & rates, sync from Sub2API             |
| Subscriptions | `https://pay.example.com/admin/subscriptions` | Manage subscription plans & user subscriptions                |

> **Tip**: When accessing directly (not via Sub2API), you need to manually append `?token=YOUR_ADMIN_TOKEN` to the URL. All admin pages share the same token — once you enter any page, you can navigate between modules via the sidebar.

---

## Admin Panel

Access: `https://pay.example.com/admin?token=YOUR_ADMIN_TOKEN`

| Module        | Path                   | Description                                                   |
| ------------- | ---------------------- | ------------------------------------------------------------- |
| Overview      | `/admin`               | Aggregated entry with card-style navigation                   |
| Orders        | `/admin/orders`        | Filter by status, paginate, view details, retry/cancel/refund |
| Dashboard     | `/admin/dashboard`     | Revenue stats, order trends, payment method breakdown         |
| Channels      | `/admin/channels`      | Configure API channels & rates, sync from Sub2API             |
| Subscriptions | `/admin/subscriptions` | Manage subscription plans & user subscriptions                |

---

## Payment Flow

```
User selects top-up / subscription plan
         │
         ▼
  Create Order (PENDING)
  ├─ Validate user status / pending orders / daily limit / channel limit
  └─ Call payment provider to get payment link
         │
         ▼
  User completes payment
  ├─ EasyPay       → QR code / H5 redirect
  ├─ Alipay (official) → PC page payment / H5 mobile web payment
  ├─ WeChat Pay (official) → Native QR code / H5 payment
  └─ Stripe        → Payment Element (PaymentIntent)
         │
         ▼
  Payment callback (RSA2 / MD5 / Webhook signature verified) → Order PAID
         │
         ▼
  Auto-call Sub2API recharge / subscription API
  ├─ Success → COMPLETED, balance credited / subscription activated
  └─ Failure → FAILED (admin can retry)
```

---

## API Endpoints

All API paths are prefixed with `/api`.

### Public API

User-facing endpoints, authenticated via `user_id` + `token` URL parameters.

| Method | Path                      | Description                                         |
| ------ | ------------------------- | --------------------------------------------------- |
| `GET`  | `/api/user`               | Get current user info                               |
| `GET`  | `/api/users/:id`          | Get specific user info                              |
| `POST` | `/api/orders`             | Create recharge / subscription order                |
| `GET`  | `/api/orders/:id`         | Query order details                                 |
| `POST` | `/api/orders/:id/cancel`  | User cancels pending order                          |
| `GET`  | `/api/orders/my`          | List current user's orders                          |
| `GET`  | `/api/channels`           | Get channel list (for frontend display)             |
| `GET`  | `/api/subscription-plans` | Get available subscription plans                    |
| `GET`  | `/api/subscriptions/my`   | Query current user's subscriptions                  |
| `GET`  | `/api/limits`             | Query recharge limits & payment method availability |

### Payment Callbacks

Called asynchronously by payment providers; signature verified before triggering credit flow.

| Method | Path                   | Description                    |
| ------ | ---------------------- | ------------------------------ |
| `GET`  | `/api/easy-pay/notify` | EasyPay async callback         |
| `POST` | `/api/alipay/notify`   | Alipay (official) callback     |
| `POST` | `/api/wxpay/notify`    | WeChat Pay (official) callback |
| `POST` | `/api/stripe/webhook`  | Stripe webhook callback        |

### Admin API

Authenticated via `token` parameter set to `ADMIN_TOKEN`.

| Method   | Path                                | Description                          |
| -------- | ----------------------------------- | ------------------------------------ |
| `GET`    | `/api/admin/orders`                 | Order list (paginated, filterable)   |
| `GET`    | `/api/admin/orders/:id`             | Order details (with audit log)       |
| `POST`   | `/api/admin/orders/:id/cancel`      | Admin cancels order                  |
| `POST`   | `/api/admin/orders/:id/retry`       | Retry failed recharge / subscription |
| `POST`   | `/api/admin/refund`                 | Issue refund                         |
| `GET`    | `/api/admin/dashboard`              | Dashboard (revenue stats, trends)    |
| `GET`    | `/api/admin/channels`               | Channel list                         |
| `POST`   | `/api/admin/channels`               | Create channel                       |
| `PUT`    | `/api/admin/channels/:id`           | Update channel                       |
| `DELETE` | `/api/admin/channels/:id`           | Delete channel                       |
| `GET`    | `/api/admin/subscription-plans`     | Subscription plan list               |
| `POST`   | `/api/admin/subscription-plans`     | Create subscription plan             |
| `PUT`    | `/api/admin/subscription-plans/:id` | Update subscription plan             |
| `DELETE` | `/api/admin/subscription-plans/:id` | Delete subscription plan             |
| `GET`    | `/api/admin/subscriptions`          | User subscription records            |
| `GET`    | `/api/admin/config`                 | Get system configuration             |
| `PUT`    | `/api/admin/config`                 | Update system configuration          |
| `GET`    | `/api/admin/sub2api/groups`         | Sync channel groups from Sub2API     |
| `GET`    | `/api/admin/sub2api/search-users`   | Search Sub2API users                 |

---

## Development

### Requirements

- Node.js 22+
- pnpm
- PostgreSQL 16+

### Local Setup

```bash
pnpm install
cp .env.example .env
# Edit .env with DATABASE_URL and other required values
pnpm prisma migrate dev
pnpm dev
```

### Commands

```bash
pnpm dev                      # Dev server with hot reload
pnpm build                    # Production build
pnpm test                     # Run tests
pnpm typecheck                # TypeScript type check
pnpm lint                     # ESLint
pnpm format                   # Prettier format

pnpm prisma generate          # Generate Prisma client
pnpm prisma migrate dev       # Create and apply migration (dev)
pnpm prisma migrate deploy    # Apply migrations (production)
pnpm prisma studio            # Visual database browser
```

---

## License

MIT
