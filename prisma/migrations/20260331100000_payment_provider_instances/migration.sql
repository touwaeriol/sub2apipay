-- 支付服务商多实例表
CREATE TABLE "payment_provider_instances" (
    "id" TEXT NOT NULL,
    "provider_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payment_provider_instances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_provider_instances_provider_key_idx" ON "payment_provider_instances"("provider_key");
CREATE INDEX "payment_provider_instances_provider_key_enabled_idx" ON "payment_provider_instances"("provider_key", "enabled");

-- Order 关联实例
ALTER TABLE "orders" ADD COLUMN "provider_instance_id" TEXT;
