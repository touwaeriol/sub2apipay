-- Add refund approval status and request metadata
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'REFUND_REQUESTED';

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "refund_requested_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "refund_request_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "refund_requested_by" INTEGER;
