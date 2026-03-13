-- AlterTable: make group_id nullable on subscription_plans
ALTER TABLE "subscription_plans" ALTER COLUMN "group_id" DROP NOT NULL;
