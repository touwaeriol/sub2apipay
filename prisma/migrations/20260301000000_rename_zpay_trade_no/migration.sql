-- Rename zpay_trade_no to payment_trade_no
ALTER TABLE "orders" RENAME COLUMN "zpay_trade_no" TO "payment_trade_no";
