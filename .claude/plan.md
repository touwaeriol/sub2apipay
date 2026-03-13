# Sub2ApiPay 改造方案

## 一、概述

基于 Pincc 参考界面，改造 Sub2ApiPay 项目，新增：
- **用户页面**：双 Tab（按量付费 / 包月套餐），渠道卡片展示，充值弹窗，订阅购买流程
- **管理员界面**：渠道管理、订阅套餐管理、系统配置
- **数据库存储配置**：支付渠道等配置从环境变量迁移至数据库，支持运行时修改

---

## 二、数据库 Schema 变更

### 2.1 新增模型

```prisma
// 渠道展示配置（管理员配置，对应 Sub2API 的 group）
model Channel {
  id             String   @id @default(cuid())
  groupId        Int      @unique @map("group_id")     // Sub2API group ID
  name           String                                  // 显示名称
  platform       String   @default("claude")             // 分类: claude/openai/gemini/codex
  rateMultiplier Decimal  @db.Decimal(10, 4) @map("rate_multiplier") // 倍率
  description    String?  @db.Text                       // 描述
  models         String?  @db.Text                       // JSON数组: 支持的模型列表
  features       String?  @db.Text                       // JSON数组: 功能特性列表
  sortOrder      Int      @default(0) @map("sort_order") // 排序
  enabled        Boolean  @default(true)                  // 是否启用
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@index([sortOrder])
  @@map("channels")
}

// 订阅套餐配置（管理员配置价格后才可售卖）
model SubscriptionPlan {
  id            String   @id @default(cuid())
  groupId       Int      @unique @map("group_id")       // Sub2API group ID
  name          String                                    // 套餐名称
  description   String?  @db.Text                         // 描述
  price         Decimal  @db.Decimal(10, 2)               // CNY 价格
  originalPrice Decimal? @db.Decimal(10, 2) @map("original_price") // 原价（划线价）
  validityDays  Int      @default(30) @map("validity_days") // 有效期天数
  features      String?  @db.Text                         // JSON数组: 特性描述
  forSale       Boolean  @default(false) @map("for_sale") // 是否启用售卖
  sortOrder     Int      @default(0) @map("sort_order")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  orders        Order[]

  @@index([forSale, sortOrder])
  @@map("subscription_plans")
}

// 系统配置（键值对，支持运行时修改）
model SystemConfig {
  key       String   @id
  value     String   @db.Text
  group     String   @default("general")  // general / payment / limits / display
  label     String?                        // 配置项显示名称
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([group])
  @@map("system_configs")
}
```

### 2.2 扩展 Order 模型

在现有 Order 模型上新增字段，复用整套支付流程：

```prisma
model Order {
  // ... 现有字段不变 ...

  // 新增：订单类型
  orderType     String   @default("balance") @map("order_type")  // "balance" | "subscription"

  // 新增：订阅相关（orderType="subscription" 时有值）
  planId              String?           @map("plan_id")
  plan                SubscriptionPlan? @relation(fields: [planId], references: [id])
  subscriptionGroupId Int?              @map("subscription_group_id")  // Sub2API group ID
  subscriptionDays    Int?              @map("subscription_days")      // 购买时的有效天数

  // 新增索引
  @@index([orderType])
}
```

**设计理由**：订阅订单和余额充值订单共享同一套支付流程（创建→支付→回调→履约），仅在最终「履约」步骤不同：
- `balance`：调用 `createAndRedeem()` 充值余额
- `subscription`：调用 Sub2API `POST /admin/subscriptions/assign` 分配订阅

---

## 三、Sub2API Client 扩展

在 `src/lib/sub2api/client.ts` 新增方法：

```typescript
// 获取所有分组（管理员）
async function getAllGroups(): Promise<Sub2ApiGroup[]>
// GET /api/v1/admin/groups/all

// 获取单个分组
async function getGroup(groupId: number): Promise<Sub2ApiGroup | null>
// GET /api/v1/admin/groups/:id

// 分配订阅（支付成功后调用）
async function assignSubscription(userId: number, groupId: number, validityDays: number, notes?: string): Promise<Sub2ApiSubscription>
// POST /api/v1/admin/subscriptions/assign

// 获取用户的订阅列表
async function getUserSubscriptions(userId: number): Promise<Sub2ApiSubscription[]>
// GET /api/v1/admin/users/:id/subscriptions

// 延长订阅（续费）
async function extendSubscription(subscriptionId: number, days: number): Promise<void>
// POST /api/v1/admin/subscriptions/:id/extend
```

类型定义：
```typescript
interface Sub2ApiGroup {
  id: number
  name: string
  description: string
  platform: string
  status: string
  rate_multiplier: number
  subscription_type: string
  daily_limit_usd: number | null
  weekly_limit_usd: number | null
  monthly_limit_usd: number | null
  default_validity_days: number
  sort_order: number
}

interface Sub2ApiSubscription {
  id: number
  user_id: number
  group_id: number
  starts_at: string
  expires_at: string
  status: string
  daily_usage_usd: number
  weekly_usage_usd: number
  monthly_usage_usd: number
  notes: string | null
}
```

---

## 四、API 路由新增

### 4.1 用户 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/channels` | 获取已启用的渠道列表（用户token验证 + 校验Sub2API分组是否存在） |
| GET | `/api/subscription-plans` | 获取可售卖的订阅套餐列表（同上校验） |
| POST | `/api/orders` | **扩展**：支持 `order_type: "subscription"` + `plan_id` |
| GET | `/api/subscriptions/my` | 获取当前用户的活跃订阅列表 |

### 4.2 管理员 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/channels` | 渠道列表（含Sub2API分组同步状态） |
| POST | `/api/admin/channels` | 创建/更新渠道 |
| PUT | `/api/admin/channels/[id]` | 更新渠道 |
| DELETE | `/api/admin/channels/[id]` | 删除渠道 |
| GET | `/api/admin/sub2api/groups` | 从Sub2API拉取所有分组（供选择） |
| GET | `/api/admin/subscription-plans` | 订阅套餐列表 |
| POST | `/api/admin/subscription-plans` | 创建套餐 |
| PUT | `/api/admin/subscription-plans/[id]` | 更新套餐 |
| DELETE | `/api/admin/subscription-plans/[id]` | 删除套餐 |
| GET | `/api/admin/subscriptions` | 所有用户的订阅列表 |
| GET | `/api/admin/config` | 获取系统配置 |
| PUT | `/api/admin/config` | 批量更新系统配置 |

---

## 五、订单服务改造

### 5.1 订单创建（扩展 `createOrder`）

```typescript
interface CreateOrderInput {
  // 现有字段...
  orderType?: 'balance' | 'subscription'  // 新增
  planId?: string                          // 新增（订阅时必填）
}
```

订阅订单创建时的校验逻辑：
1. 验证 `planId` 对应的 SubscriptionPlan 存在且 `forSale=true`
2. 调用 Sub2API 验证 `groupId` 对应的分组仍然存在且 status=active
3. 金额使用 plan.price（不允许用户自定义）
4. 其余流程（支付方式选择、限额检查等）与余额订单一致

### 5.2 订单履约（修改 `executeRecharge` → `executeFulfillment`）

```
if (order.orderType === 'subscription') {
  // 1. 再次验证 Sub2API 分组存在
  const group = await getGroup(order.subscriptionGroupId)
  if (!group || group.status !== 'active') {
    // 标记 FAILED，reason = "订阅分组已不存在"
    // 前端展示常驻错误提示
    return
  }
  // 2. 调用 Sub2API 分配订阅
  await assignSubscription(order.userId, order.subscriptionGroupId, order.subscriptionDays)
  // 3. 标记 COMPLETED
} else {
  // 原有余额充值逻辑不变
  await createAndRedeem(...)
}
```

### 5.3 订阅退款

订阅订单的退款需要额外步骤：撤销 Sub2API 中的订阅（`DELETE /admin/subscriptions/:id`）。
如果撤销失败，标记为 REFUND_FAILED 并记录审计日志，需人工介入。

---

## 六、用户页面改造

### 6.1 页面结构（参考 Pincc 的 top-up-main.png）

```
/pay 页面
├── 顶部标题区："选择适合你的 订阅套餐"
├── 双 Tab 切换：[ 按量付费 | 包月套餐 ]
│
├── Tab 1: 按量付费
│   ├── Banner: 按量付费模式说明（倍率换算、余额通用等）
│   ├── 渠道卡片网格（3列，从 /api/channels 获取）
│   │   └── 每张卡片：平台标签 + 名称 + 倍率 + 余额换算 + 描述 + 模型标签 + 功能标签 + "立即充值" 按钮
│   └── 点击"立即充值" → 弹出充值金额选择弹窗（参考 top-up.png）
│       └── 金额网格（管理员可配置档位）→ "确认充值" → 支付方式选择 → 支付流程
│
├── Tab 2: 包月套餐
│   ├── 订阅套餐卡片（从 /api/subscription-plans 获取）
│   │   └── 每张卡片：套餐名 + 价格/月 + 划线原价 + 限额特性列表 + "立即开通" 按钮
│   └── 点击"立即开通" → 确认订单页（参考 subscribe.png）
│       └── 套餐详情 + 价格 + 选择支付方式 + "立即购买"
│       （注：我们的用户已通过 token 认证，不需要 Pincc 的邮箱/密码输入框）
│
├── 用户已有订阅展示区
│   └── 活跃订阅列表 + 到期提醒 + "续费" 按钮
│
└── 底部：购买流程说明 + 温馨提示
```

**条件逻辑**：
- 如果管理员 **没有配置渠道**（Channel 表为空）→ 直接显示现有的充值界面（PaymentForm），不显示卡片
- 如果管理员 **配置了渠道** → 显示渠道卡片网格，点击"立即充值"弹出金额选择弹窗
- 如果管理员 **没有配置订阅套餐**（SubscriptionPlan 无 forSale=true）→ 隐藏"包月套餐" Tab

### 6.2 新增组件

| 组件 | 说明 |
|------|------|
| `ChannelCard.tsx` | 渠道卡片（平台标签、倍率、模型标签等） |
| `ChannelGrid.tsx` | 渠道卡片网格容器 |
| `TopUpModal.tsx` | 充值金额选择弹窗 |
| `SubscriptionPlanCard.tsx` | 订阅套餐卡片 |
| `SubscriptionConfirm.tsx` | 订阅确认订单页 |
| `UserSubscriptions.tsx` | 用户已有订阅展示 |
| `MainTabs.tsx` | 按量付费/包月套餐 Tab 切换 |
| `PurchaseFlow.tsx` | 购买流程说明（4步骤图标） |

### 6.3 异常处理

- 支付成功但订阅分组不存在：前端显示**常驻红色告警框**，包含：
  - 错误说明："您已成功支付，但订阅分组已下架，无法自动开通"
  - 订单信息（订单号、金额、支付时间）
  - 引导："请联系客服处理，提供订单号 xxx"

---

## 七、管理员页面新增

### 7.1 页面路由

| 路由 | 说明 |
|------|------|
| `/admin/channels` | 渠道管理（列表 + 编辑弹窗，参考 channel-conf.png） |
| `/admin/subscriptions` | 订阅套餐管理 + 已有订阅列表 |
| `/admin/settings` | 系统配置（支付渠道配置、业务参数等） |

### 7.2 渠道管理页（/admin/channels）

- 顶部操作栏：[从 Sub2API 同步分组] [新建渠道]
- 渠道列表表格：名称 | 分类 | 倍率 | Sub2API状态 | 排序 | 启用 | 操作
- 编辑弹窗（参考 channel-conf.png）：
  - 渠道名称、分类（下拉）、倍率、描述
  - 支持模型（textarea，每行一个）
  - 功能特性（textarea，每行一个）
  - 排序、启用开关
- "从 Sub2API 同步"：拉取所有分组 → 显示差异 → 可选批量导入

### 7.3 订阅套餐管理页（/admin/subscriptions）

两个区域：
1. **套餐配置**：
   - 列表：套餐名 | 关联分组 | 价格 | 有效天数 | 启用售卖 | Sub2API状态 | 操作
   - 新建/编辑表单：选择 Sub2API 分组 → 配置名称、价格、原价、有效天数、特性描述、启用售卖

2. **已有订阅**：
   - 从 Sub2API 查询所有订阅记录
   - 表格：用户 | 分组 | 开始时间 | 到期时间 | 状态 | 用量

### 7.4 系统配置页（/admin/settings）

分组展示：
- **支付渠道配置**：PAYMENT_PROVIDERS、各支付商的 Key/密钥等（敏感字段脱敏显示）
- **业务参数**：ORDER_TIMEOUT_MINUTES、MIN/MAX_RECHARGE_AMOUNT、MAX_DAILY_RECHARGE_AMOUNT 等
- **充值档位配置**：自定义充值金额选项（如 50/100/500/1000）
- **显示配置**：PAY_HELP_IMAGE_URL、PAY_HELP_TEXT、PAYMENT_SUBLABEL_* 等
- **前端定制**：站点名称、联系客服信息等

配置优先级：**数据库配置 > 环境变量**（环境变量作为默认值/回退值）

---

## 八、配置系统改造

### 8.1 `getConfig()` 函数改造

```typescript
// 新的配置读取优先级：
// 1. 数据库 SystemConfig 表（运行时可修改）
// 2. 环境变量（作为回退/初始值）

async function getConfig(key: string): Promise<string | undefined> {
  const dbConfig = await prisma.systemConfig.findUnique({ where: { key } })
  if (dbConfig) return dbConfig.value
  return process.env[key]
}

// 批量获取（带缓存，避免频繁查DB）
async function getConfigs(keys: string[]): Promise<Record<string, string>> { ... }
```

### 8.2 缓存策略

- 使用内存缓存（Map + TTL 30秒），避免每次请求都查数据库
- 管理员更新配置时清除缓存
- 支付商密钥等敏感配置仍可通过环境变量传入（数据库中存储 `__FROM_ENV__` 标记表示使用环境变量值）

---

## 九、管理员入口

管理员通过以下方式进入：
1. Sub2API 管理面板中跳转（携带 admin token）
2. 直接访问 `/admin?token=xxx`（现有机制）

管理员页面新增导航侧边栏：
- 订单管理（现有）
- 数据概览（现有）
- **渠道管理**（新增）
- **订阅管理**（新增）
- **系统配置**（新增）

---

## 十、实施顺序

### Phase 1：数据库 & 基础设施（预估 2-3 步）
1. Prisma schema 变更 + migration
2. SystemConfig 服务层（CRUD + 缓存）
3. Sub2API client 扩展（分组/订阅 API）

### Phase 2：管理员 API & 页面（预估 4-5 步）
4. 渠道管理 API + 页面
5. 订阅套餐管理 API + 页面
6. 系统配置 API + 页面
7. 管理员导航侧边栏

### Phase 3：订单服务改造（预估 2 步）
8. Order 模型扩展 + 订阅订单创建逻辑
9. 订阅履约逻辑（executeSubscriptionFulfillment）

### Phase 4：用户页面改造（预估 3-4 步）
10. 用户 API（channels、subscription-plans、subscriptions/my）
11. 按量付费 Tab（ChannelGrid + TopUpModal）
12. 包月套餐 Tab（SubscriptionPlanCard + SubscriptionConfirm）
13. 用户订阅展示 + 续费 + 异常处理

### Phase 5：配置迁移 & 收尾（预估 1-2 步）
14. getEnv() 改造（数据库优先 + 环境变量回退）
15. 测试 + 端到端验证

---

## 十一、安全考虑

1. **订阅分组校验**：每次展示和下单都实时校验 Sub2API 分组是否存在且 active
2. **价格篡改防护**：订阅订单金额从服务端 SubscriptionPlan.price 读取，不信任客户端传值
3. **支付后分组消失**：订单标记 FAILED + 常驻错误提示 + 审计日志，不自动退款（需人工确认）
4. **敏感配置**：支付密钥在 API 响应中脱敏，前端仅展示 `****...最后4位`
5. **幂等性**：订阅分配使用 `orderId` 作为幂等 key，防止重复分配
