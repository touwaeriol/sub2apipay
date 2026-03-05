# Sub2ApiPay

**Language**: [中文](./README.md) | English (current)

Sub2ApiPay is a self-hosted recharge payment gateway built for the [Sub2API](https://sub2api.com) platform. It supports Alipay, WeChat Pay (via EasyPay aggregator), and Stripe. Once a payment is confirmed, the system automatically calls the Sub2API management API to credit the user's balance — no manual intervention required.

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
- [Development](#development)

---

## Features

- **Multiple Payment Methods** — Alipay, WeChat Pay (EasyPay), Stripe credit card
- **Auto Balance Credit** — Automatically calls Sub2API after payment verification, fully hands-free
- **Full Order Lifecycle** — Auto-expiry, user cancellation, admin cancellation, refunds
- **Limit Controls** — Configurable per-transaction cap and daily cumulative cap per user
- **Security** — Token auth, MD5/Webhook signature verification, timing-safe comparison, full audit log
- **Responsive UI** — PC + mobile adaptive layout, dark mode support, iframe embed support
- **Admin Panel** — Order list (pagination/filtering), order details, retry recharge, refunds

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
# EasyPay only
PAYMENT_PROVIDERS=easypay
# Stripe only
PAYMENT_PROVIDERS=stripe
# Both
PAYMENT_PROVIDERS=easypay,stripe
```

**Step 2**: Control which channels are shown to users via `ENABLED_PAYMENT_TYPES`:

```env
# EasyPay supports: alipay, wxpay  |  Stripe supports: stripe
ENABLED_PAYMENT_TYPES=alipay,wxpay
```

#### EasyPay (Alipay / WeChat Pay)

Any payment provider compatible with the **EasyPay protocol** can be used, such as [ZPay](https://z-pay.cn/?uid=23808) (`https://z-pay.cn/?uid=23808`) (this link contains the author's referral code — feel free to remove it).

<details>
<summary>ZPay Registration QR Code</summary>

![ZPay Preview](./docs/zpay-preview.png)

</details>

> **Disclaimer**: Please evaluate the security, reliability, and compliance of any third-party payment provider on your own. This project does not endorse or guarantee any specific provider.

| Variable              | Description                                                      |
| --------------------- | ---------------------------------------------------------------- |
| `EASY_PAY_PID`        | EasyPay merchant ID                                              |
| `EASY_PAY_PKEY`       | EasyPay merchant secret key                                      |
| `EASY_PAY_API_BASE`   | EasyPay API base URL                                             |
| `EASY_PAY_NOTIFY_URL` | Async callback URL: `${NEXT_PUBLIC_APP_URL}/api/easy-pay/notify` |
| `EASY_PAY_RETURN_URL` | Redirect URL after payment: `${NEXT_PUBLIC_APP_URL}/pay`         |
| `EASY_PAY_CID_ALIPAY` | Alipay channel ID (optional)                                     |
| `EASY_PAY_CID_WXPAY`  | WeChat Pay channel ID (optional)                                 |

#### Stripe

| Variable                 | Description                                 |
| ------------------------ | ------------------------------------------- |
| `STRIPE_SECRET_KEY`      | Stripe secret key (`sk_live_...`)           |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_live_...`)      |
| `STRIPE_WEBHOOK_SECRET`  | Stripe webhook signing secret (`whsec_...`) |

> Stripe webhook endpoint: `${NEXT_PUBLIC_APP_URL}/api/stripe/webhook`
> Subscribe to: `payment_intent.succeeded`, `payment_intent.payment_failed`

### Business Rules

| Variable                    | Description                                     | Default                    |
| --------------------------- | ----------------------------------------------- | -------------------------- |
| `MIN_RECHARGE_AMOUNT`       | Minimum amount per transaction (CNY)            | `1`                        |
| `MAX_RECHARGE_AMOUNT`       | Maximum amount per transaction (CNY)            | `1000`                     |
| `MAX_DAILY_RECHARGE_AMOUNT` | Daily cumulative max per user (`0` = unlimited) | `10000`                    |
| `ORDER_TIMEOUT_MINUTES`     | Order expiry in minutes                         | `5`                        |
| `PRODUCT_NAME`              | Product name shown on payment page              | `Sub2API Balance Recharge` |

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

The following page URLs can be configured in the Sub2API admin panel:

| Page             | URL                                  | Description                           |
| ---------------- | ------------------------------------ | ------------------------------------- |
| Payment          | `https://pay.example.com/pay`        | User recharge entry                   |
| My Orders        | `https://pay.example.com/pay/orders` | User views their own recharge history |
| Order Management | `https://pay.example.com/admin`      | Sub2API admin only                    |

Sub2API **v0.1.88** and above will automatically append the following parameters — no manual query string needed:

| Parameter | Description                                       |
| --------- | ------------------------------------------------- |
| `user_id` | Sub2API user ID                                   |
| `token`   | User login token (required to view order history) |
| `theme`   | `light` (default) or `dark`                       |
| `ui_mode` | `standalone` (default) or `embedded` (for iframe) |

---

## Admin Panel

Access: `https://pay.example.com/admin?token=YOUR_ADMIN_TOKEN`

| Feature        | Description                                           |
| -------------- | ----------------------------------------------------- |
| Order List     | Filter by status, paginate, choose 20/50/100 per page |
| Order Detail   | View all fields and audit log timeline                |
| Retry Recharge | Re-trigger recharge for paid-but-failed orders        |
| Cancel Order   | Force-cancel pending orders                           |
| Refund         | Issue refund and deduct Sub2API balance               |

---

## Payment Flow

```
User submits recharge amount
         │
         ▼
  Create Order (PENDING)
  ├─ Validate user status / pending order count / daily limit
  └─ Call payment provider to get payment link
         │
         ▼
  User completes payment
  ├─ EasyPay → QR code / H5 redirect
  └─ Stripe  → Payment Element (PaymentIntent)
         │
         ▼
  Payment callback (signature verified) → Order PAID
         │
         ▼
  Auto-call Sub2API recharge API
  ├─ Success → COMPLETED, balance credited automatically
  └─ Failure → FAILED (admin can retry)
```

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
