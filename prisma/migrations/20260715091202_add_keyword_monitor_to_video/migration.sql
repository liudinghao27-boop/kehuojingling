-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "matchedKeywords" TEXT[];

-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "keywordMonitorId" TEXT;

-- CreateIndex
CREATE INDEX "videos_keywordMonitorId_idx" ON "videos"("keywordMonitorId");

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_keywordMonitorId_fkey" FOREIGN KEY ("keywordMonitorId") REFERENCES "keyword_monitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
