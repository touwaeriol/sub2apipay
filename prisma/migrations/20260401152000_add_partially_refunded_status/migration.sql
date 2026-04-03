-- Add partially refunded status
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';
