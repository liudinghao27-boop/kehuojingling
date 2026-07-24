-- AlterTable
ALTER TABLE "users" ADD COLUMN     "alertChannelType" TEXT,
ADD COLUMN     "alertEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "alertWebhook" TEXT;
