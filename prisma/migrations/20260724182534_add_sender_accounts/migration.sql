-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'COOLING', 'DISABLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "sender_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL DEFAULT 'DOUYIN',
    "label" TEXT NOT NULL,
    "cookies" TEXT NOT NULL,
    "proxyUrl" TEXT,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "healthScore" INTEGER NOT NULL DEFAULT 100,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "dailySent" INTEGER NOT NULL DEFAULT 0,
    "dailyLimit" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sender_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sender_accounts_userId_platform_status_idx" ON "sender_accounts"("userId", "platform", "status");

-- AddForeignKey
ALTER TABLE "sender_accounts" ADD CONSTRAINT "sender_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
