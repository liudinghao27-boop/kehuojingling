-- AlterTable
ALTER TABLE "ai_research_history" ADD COLUMN     "indexData" JSONB,
ADD COLUMN     "usedRealIndexData" BOOLEAN NOT NULL DEFAULT false;
