# Sub2ApiPay - 项目指南

## 技术栈

- **框架**: Next.js 16 (App Router)
- **语言**: TypeScript 5, React 19
- **UI**: TailwindCSS 4
- **数据库**: PostgreSQL (Prisma 7 ORM, adapter 模式 `@prisma/adapter-pg`)
- **测试**: Vitest
- **部署**: Docker Compose
- **包管理**: pnpm

## 部署规范

### 构建与发布流程

1. **在 `clicodeplus` 服务器上本地构建**，使用受限 buildx builder（3 核心、4G 内存）
2. 构建时同时 tag 为 `sub2apipay:latest` 和 `touwaeriol/sub2apipay:latest`
3. 两个环境分别 `docker compose up -d`
4. **每次发布必须推送 `touwaeriol/sub2apipay:latest` 到 Docker Hub**

```bash
# 1. 克隆代码到临时目录
ssh clicodeplus "cd /tmp && git clone https://github.com/touwaeriol/sub2apipay.git sub2apipay-build"

# 2. 创建受限 builder（3核4G）
ssh clicodeplus "docker buildx create --name limited-builder --driver docker-container --driver-opt default-load=true && \
  docker buildx inspect --bootstrap limited-builder >/dev/null 2>&1 && \
  docker update --cpus 3 --memory 4g --memory-swap 4g buildx_buildkit_limited-builder0"

# 3. 构建镜像
ssh clicodeplus "cd /tmp/sub2apipay-build && docker buildx build --builder limited-builder --load -t sub2apipay:latest -t touwaeriol/sub2apipay:latest ."

# 4. 部署 Beta 环境（端口 8087）
ssh clicodeplus "cd /opt/sub2apipay && docker compose up -d"

# 5. 部署正式环境（端口 8088）
ssh clicodeplus "cd /opt/sub2apipay-prod && docker compose -f docker-compose.app.yml up -d"

# 6. 推送到 Docker Hub（latest + 版本 tag）
ssh clicodeplus "docker tag touwaeriol/sub2apipay:latest touwaeriol/sub2apipay:v{VERSION} && \
  docker push touwaeriol/sub2apipay:latest && \
  docker push touwaeriol/sub2apipay:v{VERSION}"

# 7. 清理
ssh clicodeplus "rm -rf /tmp/sub2apipay-build && docker buildx rm limited-builder"
```

### 环境信息

**正式环境**:

- **Sub2API 域名**: https://clicodeplus.com
- **支付项目域名**: https://pay.clicodeplus.com
- **部署路径**: `/opt/sub2apipay-prod/`
- **Compose 文件**: `docker-compose.app.yml`
- **端口**: 8088

**Beta 环境**:

- **Sub2API 域名**: https://beta.clicodeplus.com
- **支付项目域名**: https://pay.beta.clicodeplus.com
- **部署路径**: `/opt/sub2apipay/`
- **Compose 文件**: `docker-compose.yml`
- **端口**: 8087

## 常用命令

```bash
# 开发
pnpm dev

# 构建
pnpm build

# 测试
pnpm test

# Prisma
pnpm prisma generate
pnpm prisma migrate dev
pnpm prisma migrate deploy
```

## 数据库迁移

采用 **Prisma Migrate** 版本化迁移机制（类似 Flyway / Goose）：

- 迁移文件位于 `prisma/migrations/` 目录，每个迁移为带时间戳的子目录 + `migration.sql`
- 已执行的迁移记录在数据库 `_prisma_migrations` 表中，不会重复执行
- **容器启动时自动执行迁移**：`start.sh` 会在应用启动前运行 `prisma migrate deploy`
- 开发时本地无数据库，**手动创建迁移目录和 SQL 文件**即可，无需 `prisma migrate dev`
- 命名规范：`{YYYYMMDD}{序号}_描述`，如 `20260313100000_add_validity_unit`

### 新增迁移的流程

1. 修改 `prisma/schema.prisma`
2. 运行 `npx prisma generate` 更新 Prisma Client
3. 手动创建 `prisma/migrations/{timestamp}_{name}/migration.sql`
4. 编写对应的 `ALTER TABLE` / `CREATE TABLE` SQL
5. 部署后容器启动时自动应用

## Prisma 7 注意事项

- schema 中 **不能** 写 `url = env("DATABASE_URL")`，数据源 URL 通过 `prisma.config.ts` 配置
- 运行时使用 adapter 模式: `@prisma/adapter-pg` + `PrismaPg({ connectionString })`
- Decimal 类型从 `Prisma` 命名空间导入: `import { Prisma } from '@prisma/client'` → `new Prisma.Decimal(...)`
- 生成的客户端不再位于 `node_modules/.prisma`，Dockerfile 中无需单独 COPY 该路径

## 支付渠道配置

项目支持四种支付服务商，通过 `PAYMENT_PROVIDERS` 环境变量启用（逗号分隔）：

| 服务商       | 标识      | 说明                                   | 必需环境变量                                                                                                                         |
| ------------ | --------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| EasyPay      | `easypay` | 易支付聚合平台，代理 alipay/wxpay 渠道 | `EASY_PAY_PID`, `EASY_PAY_PKEY`                                                                                                      |
| 支付宝直连   | `alipay`  | 直接对接支付宝开放平台                 | `ALIPAY_APP_ID`, `ALIPAY_PRIVATE_KEY`, `ALIPAY_NOTIFY_URL`                                                                           |
| 微信支付直连 | `wxpay`   | 直接对接微信支付 APIv3                 | `WXPAY_APP_ID`, `WXPAY_MCH_ID`, `WXPAY_PRIVATE_KEY`, `WXPAY_API_V3_KEY`, `WXPAY_PUBLIC_KEY`, `WXPAY_CERT_SERIAL`, `WXPAY_NOTIFY_URL` |
| Stripe       | `stripe`  | 国际支付 (信用卡等)                    | `STRIPE_SECRET_KEY`                                                                                                                  |

`ENABLED_PAYMENT_TYPES` 控制前端展示哪些支付方式（可选值: `alipay`, `wxpay`, `stripe`），需确保对应的服务商已在 `PAYMENT_PROVIDERS` 中启用。

## 项目结构

```
src/
├── app/            # Next.js App Router (页面 + API Routes)
├── lib/            # 核心业务逻辑
│   ├── config.ts   # 环境变量 (zod 校验)
│   ├── db.ts       # Prisma 单例
│   ├── easy-pay/   # EasyPay 支付平台集成
│   ├── alipay/     # 支付宝直连集成 (当面付 / 手机网站支付)
│   ├── wxpay/      # 微信支付直连集成 (PC扫码 / H5)
│   ├── stripe/     # Stripe 支付集成 (PaymentIntent + Payment Element)
│   ├── sub2api/    # Sub2API 管理 API 客户端
│   └── order/      # 订单服务、超时、充值码
├── components/     # React 组件
│   └── admin/      # 管理后台组件 (Dashboard 图表等)
└── __tests__/      # Vitest 测试
prisma/
├── schema.prisma   # 数据库 schema
docker-compose.yml
Dockerfile
prisma.config.ts
```
