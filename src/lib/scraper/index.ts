import { prisma } from '../db';
import { analyzeComments } from '../ai/noise';
import { tryDecryptAiApiKey } from '../encryption';
import { getErrorMessage } from '../errors';
import { parseVideoUrl, scrapeComments, scrapeCommentsReal } from './douyin';

export async function scrapeAndSaveComments(videoId: string, url: string) {
  console.log(`[Scrape] Processing video ${videoId}: ${url}`);

  try {
    // 1. 解析视频链接
    const parsedVideo = parseVideoUrl(url);
    if (!parsedVideo) {
      throw new Error(`无法解析视频链接: ${url}`);
    }

    // 2. 抓取评论（优先真实 API，失败则回退到 mock）
    let comments: Awaited<ReturnType<typeof scrapeComments>> = [];
    try {
      comments = await scrapeCommentsReal(parsedVideo);
    } catch (error) {
      console.warn(`[Scrape] Real scraper failed for ${videoId}, using mock:`, error);
      comments = await scrapeComments(parsedVideo, { maxComments: 50 });
    }

    if (comments.length === 0) {
      console.log(`[Scrape] No comments found for ${videoId}`);
      return { success: true, commentsCount: 0 };
    }

    // 3. 获取视频所属用户的行业上下文
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { user: true },
    });
    const industryContext = video?.user?.industryContext || undefined;
    const aiApiKey = tryDecryptAiApiKey(video?.user?.aiApiKey) || undefined;

    // 4. 过滤已存在的评论
    const newComments = [];
    for (const comment of comments) {
      const existing = await prisma.comment.findFirst({
        where: {
          videoId,
          authorName: comment.authorName,
          content: comment.content,
        },
      });
      if (!existing) {
        newComments.push(comment);
      }
    }

    if (newComments.length === 0) {
      console.log(`[Scrape] No new comments to analyze for ${videoId}`);
      return { success: true, commentsCount: 0 };
    }

    // 5. 批量 AI 意向分析 + 白噪音过滤（带行业上下文）
    const contents = newComments.map(c => c.content);
    const analyses = await analyzeComments(contents, industryContext, aiApiKey);

    // 6. 保存所有新评论（含噪音），便于后续统计与展示过滤原因
    const savedComments = [];
    let noiseCount = 0;
    let lowIntentCount = 0;
    for (let i = 0; i < newComments.length; i++) {
      const comment = newComments[i];
      const analysis = analyses[i] || { isNoise: false, noiseType: 'none', score: 1, keywords: [], category: 'none', reason: '' };

      if (analysis.isNoise) {
        noiseCount++;
        console.log(`[Scrape] Save noise comment [${analysis.noiseType}]: ${comment.content.slice(0, 30)}`);
      } else if (analysis.score < 3) {
        lowIntentCount++;
        console.log(`[Scrape] Save low intent comment (${analysis.score}分): ${comment.content.slice(0, 30)}`);
      }

      const saved = await prisma.comment.create({
        data: {
          content: comment.content,
          authorName: comment.authorName,
          authorAvatar: comment.authorAvatar,
          videoId,
          intentScore: analysis.isNoise ? 1 : analysis.score,
          intentKeywords: analysis.isNoise ? [] : analysis.keywords,
          isNoise: analysis.isNoise,
          noiseType: analysis.isNoise ? analysis.noiseType : null,
          noiseReason: analysis.isNoise ? analysis.noiseReason || analysis.reason : null,
          status: !analysis.isNoise && analysis.score >= 4 ? 'ANALYZED' : 'NEW',
        },
      });

      savedComments.push(saved);
    }

    // 7. 更新视频状态与最近抓取时间，重置连续失败计数
    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'MONITORING', lastScrapedAt: new Date(), consecutiveFailures: 0 },
    });

    const qualifiedCount = savedComments.length - noiseCount - lowIntentCount;
    console.log(
      `[Scrape] Saved ${savedComments.length} comments for ${videoId} ` +
      `(qualified=${qualifiedCount}, noise=${noiseCount}, lowIntent=${lowIntentCount})`
    );
    return { success: true, commentsCount: savedComments.length, qualifiedCount, noiseCount, lowIntentCount };
  } catch (error) {
    console.error(`[Scrape] Failed to process video ${videoId}:`, getErrorMessage(error));

    // 递增连续失败计数，达到阈值后再标记为 ERROR
    try {
      const video = await prisma.video.update({
        where: { id: videoId },
        data: { consecutiveFailures: { increment: 1 } },
      });

      if (video.consecutiveFailures >= 3) {
        await prisma.video.update({
          where: { id: videoId },
          data: { status: 'ERROR' },
        });
        await prisma.activity.create({
          data: {
            type: 'ERROR',
            description: `视频「${video.title || video.url}」连续 3 次抓取失败，已暂停监控`,
            metadata: { videoId, failures: video.consecutiveFailures },
            userId: video.userId,
          },
        });
      }
    } catch (e) {
      console.error('Update video failure count failed:', e);
    }

    throw error;
  }
}
