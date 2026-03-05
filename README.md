# Sub2ApiPay

**语言 / Language**: 中文（当前）｜ [English](./README.en.md)

Sub2ApiPay 是为 [Sub2API](https://sub2api.com) 平台构建的自托管充值支付网关。支持支付宝、微信支付（通过 EasyPay 聚合）和 Stripe，订单支付成功后自动调用 Sub2API 管理接口完成余额到账，无需人工干预。

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
- [开发指南](#开发指南)

---

## 功能特性

- **多支付方式** — 支付宝、微信支付（EasyPay 聚合）、Stripe 信用卡
- **自动到账** — 支付回调验签后自动调用 Sub2API 充值接口，全程无需人工
- **订单全生命周期** — 超时自动取消、用户主动取消、管理员取消、退款
- **限额控制** — 可配置单笔上限与每日累计上限，按用户维度统计
- **安全设计** — Token 鉴权、MD5/Webhook 签名验证、时序安全对比、完整审计日志
- **响应式 UI** — PC + 移动端自适应，支持深色模式，支持 iframe 嵌入
- **管理后台** — 订单列表（分页/筛选）、订单详情、重试充值、退款

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
# 仅易支付
PAYMENT_PROVIDERS=easypay
# 仅 Stripe
PAYMENT_PROVIDERS=stripe
# 两者都用
PAYMENT_PROVIDERS=easypay,stripe
```

**第二步**：通过 `ENABLED_PAYMENT_TYPES` 控制向用户展示哪些支付渠道：

```env
# 易支付支持: alipay, wxpay；Stripe 支持: stripe
ENABLED_PAYMENT_TYPES=alipay,wxpay
```

#### EasyPay（支付宝 / 微信支付）

支付提供商只需兼容**易支付（EasyPay）协议**即可接入，例如 [ZPay](https://z-pay.cn/?uid=23808)（`https://z-pay.cn/?uid=23808`）等平台（链接含本项目作者的邀请码，介意可去掉）。

<details>
<summary>ZPay 申请二维码</summary>

![ZPay 预览](./docs/zpay-preview.png)

</details>

> **注意**：支付渠道的安全性、稳定性及合规性请自行鉴别，本项目不对任何第三方支付服务商做担保或背书。

| 变量                  | 说明                                                          |
| --------------------- | ------------------------------------------------------------- |
| `EASY_PAY_PID`        | EasyPay 商户 ID                                               |
| `EASY_PAY_PKEY`       | EasyPay 商户密钥                                              |
| `EASY_PAY_API_BASE`   | EasyPay API 地址                                              |
| `EASY_PAY_NOTIFY_URL` | 异步回调地址，填 `${NEXT_PUBLIC_APP_URL}/api/easy-pay/notify` |
| `EASY_PAY_RETURN_URL` | 支付完成跳转地址，填 `${NEXT_PUBLIC_APP_URL}/pay`             |
| `EASY_PAY_CID_ALIPAY` | 支付宝通道 ID（可选）                                         |
| `EASY_PAY_CID_WXPAY`  | 微信支付通道 ID（可选）                                       |

#### Stripe

| 变量                     | 说明                                   |
| ------------------------ | -------------------------------------- |
| `STRIPE_SECRET_KEY`      | Stripe 密钥（`sk_live_...`）           |
| `STRIPE_PUBLISHABLE_KEY` | Stripe 可公开密钥（`pk_live_...`）     |
| `STRIPE_WEBHOOK_SECRET`  | Stripe Webhook 签名密钥（`whsec_...`） |

> Stripe Webhook 端点：`${NEXT_PUBLIC_APP_URL}/api/stripe/webhook`
> 需订阅事件：`payment_intent.succeeded`、`payment_intent.payment_failed`

### 业务规则

| 变量                        | 说明                               | 默认值                     |
| --------------------------- | ---------------------------------- | -------------------------- |
| `MIN_RECHARGE_AMOUNT`       | 单笔最低充值金额（元）             | `1`                        |
| `MAX_RECHARGE_AMOUNT`       | 单笔最高充值金额（元）             | `1000`                     |
| `MAX_DAILY_RECHARGE_AMOUNT` | 每日累计最高充值（元，`0` = 不限） | `10000`                    |
| `ORDER_TIMEOUT_MINUTES`     | 订单超时分钟数                     | `5`                        |
| `PRODUCT_NAME`              | 充值商品名称（显示在支付页）       | `Sub2API Balance Recharge` |

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

在 Sub2API 管理后台可配置以下页面链接：

| 页面     | 链接                                 | 说明                    |
| -------- | ------------------------------------ | ----------------------- |
| 充值页面 | `https://pay.example.com/pay`        | 用户充值入口            |
| 我的订单 | `https://pay.example.com/pay/orders` | 用户查看自己的充值记录  |
| 订单管理 | `https://pay.example.com/admin`      | 仅 Sub2API 管理员可访问 |

Sub2API **v0.1.88** 及以上版本会自动拼接以下参数，无需手动添加：

| 参数      | 说明                                             |
| --------- | ------------------------------------------------ |
| `user_id` | Sub2API 用户 ID                                  |
| `token`   | 用户登录 Token（有 token 才能查看订单历史）      |
| `theme`   | `light`（默认）或 `dark`                         |
| `ui_mode` | `standalone`（默认）或 `embedded`（iframe 嵌入） |

---

## 管理后台

访问：`https://pay.example.com/admin?token=YOUR_ADMIN_TOKEN`

| 功能     | 说明                                        |
| -------- | ------------------------------------------- |
| 订单列表 | 按状态筛选、分页浏览，支持每页 20/50/100 条 |
| 订单详情 | 查看完整字段与操作审计日志                  |
| 重试充值 | 对已支付但充值失败的订单重新发起充值        |
| 取消订单 | 强制取消待支付订单                          |
| 退款     | 对已完成订单发起退款并扣减 Sub2API 余额     |

---

## 支付流程

```
用户提交充值金额
       │
       ▼
  创建订单 (PENDING)
  ├─ 校验用户状态 / 待支付订单数 / 每日限额
  └─ 调用支付提供商获取支付链接
       │
       ▼
  用户完成支付
  ├─ EasyPay → 扫码 / H5 跳转
  └─ Stripe  → Payment Element (PaymentIntent)
       │
       ▼
  支付回调（签名验证）→ 订单 PAID
       │
       ▼
  自动调用 Sub2API 充值接口
  ├─ 成功 → COMPLETED，余额自动到账
  └─ 失败 → FAILED（管理员可重试）
```

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
