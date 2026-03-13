# Sub2ApiPay

**语言 / Language**: 中文（当前）｜ [English](./README.en.md)

Sub2ApiPay 是为 [Sub2API](https://sub2api.com) 平台构建的自托管支付网关。支持 **EasyPay 易支付聚合**、**支付宝官方**、**微信官方**和 **Stripe** 四种支付渠道，提供按量充值与套餐订阅两种计费模式，支付成功后自动调用 Sub2API 管理接口完成到账，无需人工干预。

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [部署指南](#部署指南)
- [集成到 Sub2API](#集成到-sub2api)
- [管理后台](#管理后台)
- [支付流程](#支付流程)
- [API 端点](#api-端点)
- [开发指南](#开发指南)

---

## 功能特性

- **四渠道支付** — EasyPay 易支付聚合、支付宝官方、微信官方、Stripe
- **双计费模式** — 按量余额充值 + 套餐订阅，灵活适配不同业务场景
- **自动到账** — 支付回调验签后自动调用 Sub2API 充值 / 订阅接口，全程无需人工
- **订单全生命周期** — 超时自动取消、用户主动取消、管理员取消、退款
- **限额控制** — 单笔上限、每日用户累计上限、每日渠道全局限额，多维度风控
- **安全设计** — Token 鉴权、RSA2 / MD5 / Webhook 签名验证、时序安全对比、完整审计日志
- **响应式 UI** — PC + 移动端自适应，暗色 / 亮色主题，支持 iframe 嵌入
- **中英双语** — 支付页面自动适配中英文
- **管理后台** — 数据概览、订单管理（分页/筛选/重试/退款）、渠道管理、订阅管理

> **EasyPay 推荐**：个人推荐 [ZPay](https://z-pay.cn/?uid=23808) 作为 EasyPay 服务商（链接含作者邀请码，介意可去掉）。ZPay 支持**个人用户**（无营业执照）每日 1 万元以内交易；拥有营业执照则无限额。支付渠道的安全性、稳定性及合规性请自行鉴别，本项目不对任何第三方支付服务商做担保或背书。

<details>
<summary>ZPay 申请二维码</summary>

![ZPay 预览](./docs/zpay-preview.png)

</details>

---

## 技术栈

| 类别   | 技术                        |
| ------ | --------------------------- |
| 框架   | Next.js 16 (App Router)     |
| 语言   | TypeScript 5 + React 19     |
| 样式   | TailwindCSS 4               |
| ORM    | Prisma 7（adapter-pg 模式） |
| 数据库 | PostgreSQL 16               |
| 容器   | Docker + Docker Compose     |
| 包管理 | pnpm                        |

---

## 快速开始

### 使用 Docker Hub 镜像（推荐）

无需本地安装 Node.js 或 pnpm，服务器上只需 Docker。

```bash
mkdir -p /opt/sub2apipay && cd /opt/sub2apipay

# 下载 Compose 文件和环境变量模板
curl -O https://raw.githubusercontent.com/touwaeriol/sub2apipay/main/docker-compose.hub.yml
curl -O https://raw.githubusercontent.com/touwaeriol/sub2apipay/main/.env.example
cp .env.example .env

# 填写必填环境变量
nano .env

# 启动（含自带 PostgreSQL）
docker compose -f docker-compose.hub.yml up -d
```

### 从源码构建

```bash
git clone https://github.com/touwaeriol/sub2apipay.git
cd sub2apipay
cp .env.example .env
nano .env
docker compose up -d --build
```

---

## 环境变量

完整模板见 [`.env.example`](./.env.example)。

### 核心（必填）

| 变量                    | 说明                                           |
| ----------------------- | ---------------------------------------------- |
| `SUB2API_BASE_URL`      | Sub2API 服务地址，如 `https://sub2api.com`     |
| `SUB2API_ADMIN_API_KEY` | Sub2API 管理 API 密钥                          |
| `ADMIN_TOKEN`           | 管理后台访问令牌（自定义强密码）               |
| `NEXT_PUBLIC_APP_URL`   | 本服务的公网地址，如 `https://pay.example.com` |

> `DATABASE_URL` 使用自带数据库时由 Compose 自动注入，无需手动填写。

### 支付服务商与支付方式

**第一步**：通过 `PAYMENT_PROVIDERS` 声明启用哪些支付服务商（逗号分隔）：

```env
# 可选值: easypay, alipay, wxpay, stripe
# 示例：仅使用 EasyPay 易支付聚合
PAYMENT_PROVIDERS=easypay
# 示例：同时启用支付宝官方 + 微信官方 + Stripe
PAYMENT_PROVIDERS=alipay,wxpay,stripe
```

> **支付宝官方 / 微信官方**与 **EasyPay** 可以共存。官方渠道直接对接支付宝/微信 API，资金直达商户账户，手续费更低；EasyPay 通过第三方聚合平台代收，接入门槛更低。使用 EasyPay 时请尽量选择资金直接走支付宝/微信官方渠道，而非第三方代收的、不经过第三方中转的服务商。

#### EasyPay（支付宝 / 微信支付聚合）

任何兼容**易支付（EasyPay）协议**的支付服务商均可接入。

| 变量                  | 说明                                                          |
| --------------------- | ------------------------------------------------------------- |
| `EASY_PAY_PID`        | EasyPay 商户 ID                                               |
| `EASY_PAY_PKEY`       | EasyPay 商户密钥                                              |
| `EASY_PAY_API_BASE`   | EasyPay API 地址                                              |
| `EASY_PAY_NOTIFY_URL` | 异步回调地址，填 `${NEXT_PUBLIC_APP_URL}/api/easy-pay/notify` |
| `EASY_PAY_RETURN_URL` | 支付完成跳转地址，填 `${NEXT_PUBLIC_APP_URL}/pay/result`      |
| `EASY_PAY_CID_ALIPAY` | 支付宝通道 ID（可选）                                         |
| `EASY_PAY_CID_WXPAY`  | 微信支付通道 ID（可选）                                       |

#### 支付宝官方

直接对接支付宝开放平台，支持 PC 页面支付（`alipay.trade.page.pay`）和手机网站支付（`alipay.trade.wap.pay`），自动根据终端类型切换。

| 变量                 | 说明                         |
| -------------------- | ---------------------------- |
| `ALIPAY_APP_ID`      | 支付宝应用 AppID             |
| `ALIPAY_PRIVATE_KEY` | 应用私钥（内容或文件路径）   |
| `ALIPAY_PUBLIC_KEY`  | 支付宝公钥（内容或文件路径） |
| `ALIPAY_NOTIFY_URL`  | 异步回调地址                 |
| `ALIPAY_RETURN_URL`  | 同步跳转地址（可选）         |

#### 微信官方

直接对接微信支付 APIv3，支持 Native 扫码支付和 H5 支付，移动端优先尝试 H5，自动 fallback 到扫码。

| 变量                  | 说明                            |
| --------------------- | ------------------------------- |
| `WXPAY_APP_ID`        | 微信支付 AppID                  |
| `WXPAY_MCH_ID`        | 商户号                          |
| `WXPAY_PRIVATE_KEY`   | 商户 API 私钥（内容或文件路径） |
| `WXPAY_CERT_SERIAL`   | 商户证书序列号                  |
| `WXPAY_API_V3_KEY`    | APIv3 密钥                      |
| `WXPAY_PUBLIC_KEY`    | 微信支付公钥（内容或文件路径）  |
| `WXPAY_PUBLIC_KEY_ID` | 微信支付公钥 ID                 |
| `WXPAY_NOTIFY_URL`    | 异步回调地址                    |

#### Stripe

| 变量                     | 说明                                   |
| ------------------------ | -------------------------------------- |
| `STRIPE_SECRET_KEY`      | Stripe 密钥（`sk_live_...`）           |
| `STRIPE_PUBLISHABLE_KEY` | Stripe 可公开密钥（`pk_live_...`）     |
| `STRIPE_WEBHOOK_SECRET`  | Stripe Webhook 签名密钥（`whsec_...`） |

> Stripe Webhook 端点：`${NEXT_PUBLIC_APP_URL}/api/stripe/webhook`
> 需订阅事件：`payment_intent.succeeded`、`payment_intent.payment_failed`

### 业务规则

| 变量                             | 说明                                     | 默认值                     |
| -------------------------------- | ---------------------------------------- | -------------------------- |
| `MIN_RECHARGE_AMOUNT`            | 单笔最低充值金额（元）                   | `1`                        |
| `MAX_RECHARGE_AMOUNT`            | 单笔最高充值金额（元）                   | `1000`                     |
| `MAX_DAILY_RECHARGE_AMOUNT`      | 每日每用户累计最高充值（元，`0` = 不限） | `10000`                    |
| `MAX_DAILY_AMOUNT_ALIPAY`        | 易支付支付宝渠道每日全局限额（可选）     | 由提供商默认               |
| `MAX_DAILY_AMOUNT_ALIPAY_DIRECT` | 支付宝官方渠道每日全局限额（可选）       | 由提供商默认               |
| `MAX_DAILY_AMOUNT_WXPAY`         | 微信支付渠道每日全局限额（可选）         | 由提供商默认               |
| `MAX_DAILY_AMOUNT_STRIPE`        | Stripe 渠道每日全局限额（可选）          | 由提供商默认               |
| `ORDER_TIMEOUT_MINUTES`          | 订单超时分钟数                           | `5`                        |
| `PRODUCT_NAME`                   | 充值商品名称（显示在支付页）             | `Sub2API Balance Recharge` |

### UI 定制（可选）

在充值页面右侧可展示客服联系方式、说明图片等帮助内容。

| 变量                 | 说明                                                            |
| -------------------- | --------------------------------------------------------------- |
| `PAY_HELP_IMAGE_URL` | 帮助图片地址（支持外部 URL 或本地路径，见下方说明）             |
| `PAY_HELP_TEXT`      | 帮助说明文字，用 `\n` 换行，如 `扫码加微信\n工作日 9-18 点在线` |

**图片地址两种方式：**

- **外部 URL**（推荐，无需改 Compose 配置）：直接填图片的公网地址，如 OSS / CDN / 图床链接。

  ```env
  PAY_HELP_IMAGE_URL=https://cdn.example.com/help-qr.jpg
  ```

- **本地文件**：将图片放到 `./uploads/` 目录，通过 `/uploads/文件名` 引用。
  需在 `docker-compose.app.yml` 中挂载目录（默认已包含）：
  ```yaml
  volumes:
    - ./uploads:/app/public/uploads:ro
  ```
  ```env
  PAY_HELP_IMAGE_URL=/uploads/help-qr.jpg
  ```

> 点击帮助图片可在屏幕中央全屏放大查看。

### Docker Compose 专用

| 变量          | 说明                                | 默认值                       |
| ------------- | ----------------------------------- | ---------------------------- |
| `APP_PORT`    | 宿主机映射端口                      | `3001`                       |
| `DB_PASSWORD` | PostgreSQL 密码（使用自带数据库时） | `password`（**生产请修改**） |

---

## 部署指南

### 方案一：Docker Hub 镜像 + 自带数据库

使用 `docker-compose.hub.yml`，最省事的部署方式：

```bash
docker compose -f docker-compose.hub.yml up -d
```

镜像：[`touwaeriol/sub2apipay:latest`](https://hub.docker.com/r/touwaeriol/sub2apipay)

### 方案二：Docker Hub 镜像 + 外部数据库

适用于已有 PostgreSQL 实例（如与其他服务共用）：

1. 在 `.env` 中填写 `DATABASE_URL`
2. 使用 `docker-compose.app.yml`（仅启动应用，不含 DB）：

```bash
docker compose -f docker-compose.app.yml up -d
```

### 方案三：从源码构建

适用于自定义修改后自行构建：

```bash
# 在构建服务器上
docker compose build
docker tag sub2apipay-app:latest touwaeriol/sub2apipay:latest
docker push touwaeriol/sub2apipay:latest

# 在部署服务器上
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

### 端口与反向代理

默认宿主机端口为 `3001`（可通过 `APP_PORT` 修改）。建议使用 Nginx/Caddy 作反向代理并配置 HTTPS：

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

### 数据库迁移

容器启动时自动执行 `prisma migrate deploy`，无需手动操作。如需手动执行：

```bash
docker compose exec app npx prisma migrate deploy
```

---

## 集成到 Sub2API

假设本服务部署在 `https://pay.example.com`。

### 用户端页面

在 Sub2API 管理后台的**充值设置**中配置以下链接，用户即可从 Sub2API 平台跳转到充值和订单页面：

| 配置项   | URL                                  | 说明                        |
| -------- | ------------------------------------ | --------------------------- |
| 充值页面 | `https://pay.example.com/pay`        | 用户充值、购买订阅套餐入口  |
| 我的订单 | `https://pay.example.com/pay/orders` | 用户查看自己的充值/订阅记录 |

Sub2API **v0.1.88** 及以上版本会自动拼接以下参数，无需手动添加：

| 参数      | 说明                                             |
| --------- | ------------------------------------------------ |
| `user_id` | Sub2API 用户 ID                                  |
| `token`   | 用户登录 Token（有 token 才能查看订单历史）      |
| `theme`   | `light`（默认）或 `dark`                         |
| `lang`    | 界面语言，`zh`（默认）或 `en`                    |
| `ui_mode` | `standalone`（默认）或 `embedded`（iframe 嵌入） |

### 管理后台

管理后台通过 URL 参数 `token` 鉴权（值为环境变量 `ADMIN_TOKEN`）。在 Sub2API 中集成时只需配置路径，**无需附加任何查询参数**——Sub2API 会自动拼接 `token` 等参数：

| 页面     | URL                                           | 说明                                           |
| -------- | --------------------------------------------- | ---------------------------------------------- |
| 管理总览 | `https://pay.example.com/admin`               | 聚合入口，卡片式导航到各管理模块               |
| 订单管理 | `https://pay.example.com/admin/orders`        | 按状态筛选、分页浏览、订单详情、重试/取消/退款 |
| 数据概览 | `https://pay.example.com/admin/dashboard`     | 收入统计、订单趋势、支付方式分布               |
| 渠道管理 | `https://pay.example.com/admin/channels`      | 配置 API 渠道与倍率，支持从 Sub2API 同步       |
| 订阅管理 | `https://pay.example.com/admin/subscriptions` | 管理订阅套餐与用户订阅                         |

> **提示**：若独立访问（不通过 Sub2API 跳转），需手动在 URL 后添加 `?token=YOUR_ADMIN_TOKEN`。管理后台所有页面间共享同一个 token，进入任一页面后可通过侧边导航切换。

---

## 管理后台

访问：`https://pay.example.com/admin?token=YOUR_ADMIN_TOKEN`

| 模块     | 路径                   | 说明                                           |
| -------- | ---------------------- | ---------------------------------------------- |
| 总览     | `/admin`               | 聚合入口，卡片式导航到各管理模块               |
| 订单管理 | `/admin/orders`        | 按状态筛选、分页浏览、订单详情、重试/取消/退款 |
| 数据概览 | `/admin/dashboard`     | 收入统计、订单趋势、支付方式分布               |
| 渠道管理 | `/admin/channels`      | 配置 API 渠道与倍率，支持从 Sub2API 同步       |
| 订阅管理 | `/admin/subscriptions` | 管理订阅套餐与用户订阅                         |

---

## 支付流程

```
用户选择充值 / 订阅套餐
       │
       ▼
  创建订单 (PENDING)
  ├─ 校验用户状态 / 待支付订单数 / 每日限额 / 渠道限额
  └─ 调用支付提供商获取支付链接
       │
       ▼
  用户完成支付
  ├─ EasyPay   → 扫码 / H5 跳转
  ├─ 支付宝官方 → PC 页面支付 / H5 手机网站支付
  ├─ 微信官方   → Native 扫码 / H5 支付
  └─ Stripe    → Payment Element (PaymentIntent)
       │
       ▼
  支付回调（RSA2 / MD5 / Webhook 签名验证）→ 订单 PAID
       │
       ▼
  自动调用 Sub2API 充值 / 订阅接口
  ├─ 成功 → COMPLETED，余额到账 / 订阅生效
  └─ 失败 → FAILED（管理员可重试）
```

---

## API 端点

所有 API 路径前缀为 `/api`。

### 公开 API

用户侧接口，通过 URL 参数 `user_id` + `token` 鉴权。

| 方法   | 路径                      | 说明                           |
| ------ | ------------------------- | ------------------------------ |
| `GET`  | `/api/user`               | 获取当前用户信息               |
| `GET`  | `/api/users/:id`          | 获取指定用户信息               |
| `POST` | `/api/orders`             | 创建充值 / 订阅订单            |
| `GET`  | `/api/orders/:id`         | 查询订单详情                   |
| `POST` | `/api/orders/:id/cancel`  | 用户取消待支付订单             |
| `GET`  | `/api/orders/my`          | 查询当前用户的订单列表         |
| `GET`  | `/api/channels`           | 获取渠道列表（前端展示用）     |
| `GET`  | `/api/subscription-plans` | 获取在售订阅套餐列表           |
| `GET`  | `/api/subscriptions/my`   | 查询当前用户的订阅状态         |
| `GET`  | `/api/limits`             | 查询充值限额与支付方式可用状态 |

### 支付回调

由支付服务商异步调用，签名验证后触发到账流程。

| 方法   | 路径                   | 说明                    |
| ------ | ---------------------- | ----------------------- |
| `GET`  | `/api/easy-pay/notify` | EasyPay 异步回调（GET） |
| `POST` | `/api/alipay/notify`   | 支付宝官方异步回调      |
| `POST` | `/api/wxpay/notify`    | 微信官方异步回调        |
| `POST` | `/api/stripe/webhook`  | Stripe Webhook 回调     |

### 管理 API

需通过 `token` 参数传递 `ADMIN_TOKEN` 鉴权。

| 方法     | 路径                                | 说明                       |
| -------- | ----------------------------------- | -------------------------- |
| `GET`    | `/api/admin/orders`                 | 订单列表（分页、状态筛选） |
| `GET`    | `/api/admin/orders/:id`             | 订单详情（含审计日志）     |
| `POST`   | `/api/admin/orders/:id/cancel`      | 管理员取消订单             |
| `POST`   | `/api/admin/orders/:id/retry`       | 重试失败的充值 / 订阅      |
| `POST`   | `/api/admin/refund`                 | 发起退款                   |
| `GET`    | `/api/admin/dashboard`              | 数据概览（收入统计、趋势） |
| `GET`    | `/api/admin/channels`               | 渠道列表                   |
| `POST`   | `/api/admin/channels`               | 创建渠道                   |
| `PUT`    | `/api/admin/channels/:id`           | 更新渠道                   |
| `DELETE` | `/api/admin/channels/:id`           | 删除渠道                   |
| `GET`    | `/api/admin/subscription-plans`     | 订阅套餐列表               |
| `POST`   | `/api/admin/subscription-plans`     | 创建订阅套餐               |
| `PUT`    | `/api/admin/subscription-plans/:id` | 更新订阅套餐               |
| `DELETE` | `/api/admin/subscription-plans/:id` | 删除订阅套餐               |
| `GET`    | `/api/admin/subscriptions`          | 用户订阅记录列表           |
| `GET`    | `/api/admin/config`                 | 获取系统配置               |
| `PUT`    | `/api/admin/config`                 | 更新系统配置               |
| `GET`    | `/api/admin/sub2api/groups`         | 从 Sub2API 同步渠道分组    |
| `GET`    | `/api/admin/sub2api/search-users`   | 搜索 Sub2API 用户          |

---

## 开发指南

### 环境要求

- Node.js 22+
- pnpm
- PostgreSQL 16+

### 本地启动

```bash
pnpm install
cp .env.example .env
# 编辑 .env，填写 DATABASE_URL 和其他必填项
pnpm prisma migrate dev
pnpm dev
```

### 常用命令

```bash
pnpm dev                      # 开发服务器（热重载）
pnpm build                    # 生产构建
pnpm test                     # 运行测试
pnpm typecheck                # TypeScript 类型检查
pnpm lint                     # ESLint 代码检查
pnpm format                   # Prettier 格式化

pnpm prisma generate          # 生成 Prisma 客户端
pnpm prisma migrate dev       # 创建迁移（开发）
pnpm prisma migrate deploy    # 应用迁移（生产）
pnpm prisma studio            # 可视化数据库管理
```

---

## License

MIT
