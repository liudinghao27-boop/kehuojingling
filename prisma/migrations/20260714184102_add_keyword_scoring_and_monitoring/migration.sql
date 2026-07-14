/*
  Warnings:

  - Added the required column `updatedAt` to the `ai_research_history` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ai_research_history" ADD COLUMN     "isFavorite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scoredKeywords" JSONB,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "keyword_monitors" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keyword_monitors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "keyword_monitors_userId_updatedAt_idx" ON "keyword_monitors"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "keyword_monitors_userId_keyword_key" ON "keyword_monitors"("userId", "keyword");

-- CreateIndex
CREATE INDEX "ai_research_history_userId_isFavorite_idx" ON "ai_research_history"("userId", "isFavorite");

-- AddForeignKey
ALTER TABLE "keyword_monitors" ADD CONSTRAINT "keyword_monitors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
