import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractMatchedKeywords, scrapeAndSaveComments } from './index';
import { prisma, clearDatabase } from '@/lib/test/setup';
import { createUser, createVideo } from '@/lib/test/factories';
import { parseVideoUrl, scrapeComments, scrapeCommentsReal } from './douyin';
import { analyzeComments } from '@/lib/ai/noise';

vi.mock('./douyin', () => ({
  parseVideoUrl: vi.fn(),
  scrapeComments: vi.fn(),
  scrapeCommentsReal: vi.fn(),
}));

vi.mock('@/lib/ai/noise', () => ({
  analyzeComments: vi.fn(),
}));

describe('extractMatchedKeywords', () => {
  it('忽略大小写匹配关键词', () => {
    const result = extractMatchedKeywords('我想学习玫瑰包装技巧', ['玫瑰包装']);
    expect(result).toEqual(['玫瑰包装']);
  });

  it('返回多个命中的关键词', () => {
    const result = extractMatchedKeywords('玫瑰包装和花艺培训都很感兴趣', ['玫瑰包装', '花艺培训']);
    expect(result).toContain('玫瑰包装');
    expect(result).toContain('花艺培训');
  });

  it('没有命中时返回空数组', () => {
    const result = extractMatchedKeywords('这是一条普通评论', ['玫瑰包装', '花艺培训']);
    expect(result).toEqual([]);
  });

  it('去重相同关键词', () => {
    const result = extractMatchedKeywords('玫瑰包装玫瑰包装', ['玫瑰包装']);
    expect(result).toEqual(['玫瑰包装']);
  });
});

describe('scrapeAndSaveComments mock 回退开关', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
    vi.mocked(parseVideoUrl).mockReturnValue({
      platform: 'DOUYIN',
      videoId: 'v1',
      originalUrl: 'https://douyin.com/video/v1',
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('默认未开启开关时，真实抓取失败直接抛错且不落库', async () => {
    vi.stubEnv('SCRAPER_ALLOW_MOCK', '');
    const user = await createUser();
    const video = await createVideo(user.id);
    vi.mocked(scrapeCommentsReal).mockRejectedValue(new Error('scraper down'));

    await expect(scrapeAndSaveComments(video.id, video.url)).rejects.toThrow('scraper down');
    expect(vi.mocked(scrapeComments)).not.toHaveBeenCalled();
    const commentCount = await prisma.comment.count({ where: { videoId: video.id } });
    expect(commentCount).toBe(0);
  });

  it('SCRAPER_ALLOW_MOCK=true 时回退 mock 数据并入库', async () => {
    vi.stubEnv('SCRAPER_ALLOW_MOCK', 'true');
    const user = await createUser();
    const video = await createVideo(user.id);
    vi.mocked(scrapeCommentsReal).mockRejectedValue(new Error('scraper down'));
    vi.mocked(scrapeComments).mockResolvedValue([
      { id: 'c1', authorName: 'mock用户', content: '多少钱？', createdAt: new Date().toISOString(), likes: 1 },
    ]);
    vi.mocked(analyzeComments).mockResolvedValue([
      {
        isNoise: false,
        noiseType: 'none',
        noiseReason: '',
        score: 5,
        keywords: ['多少钱'],
        category: 'purchase',
        reason: '',
      },
    ]);

    const result = await scrapeAndSaveComments(video.id, video.url);
    expect(result.success).toBe(true);
    expect(result.commentsCount).toBe(1);
    const comment = await prisma.comment.findFirst({ where: { videoId: video.id } });
    expect(comment?.content).toBe('多少钱？');
  });
});

describe('scrapeAndSaveComments 连续失败计数语义', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
    vi.stubEnv('SCRAPER_ALLOW_MOCK', '');
    vi.mocked(parseVideoUrl).mockReturnValue({
      platform: 'DOUYIN',
      videoId: 'v1',
      originalUrl: 'https://douyin.com/video/v1',
    });
    vi.mocked(scrapeCommentsReal).mockRejectedValue(new Error('scraper down'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('非最终尝试失败（Bull 还会重试）不递增 consecutiveFailures', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);

    await expect(
      scrapeAndSaveComments(video.id, video.url, { isFinalAttempt: false })
    ).rejects.toThrow('scraper down');

    const after = await prisma.video.findUnique({ where: { id: video.id } });
    expect(after?.consecutiveFailures).toBe(0);
    expect(after?.status).not.toBe('ERROR');
  });

  it('最终尝试失败才递增 consecutiveFailures，累计 3 次后视频标记 ERROR', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);

    for (let i = 0; i < 3; i++) {
      await expect(
        scrapeAndSaveComments(video.id, video.url, { isFinalAttempt: true })
      ).rejects.toThrow('scraper down');
    }

    const after = await prisma.video.findUnique({ where: { id: video.id } });
    expect(after?.consecutiveFailures).toBe(3);
    expect(after?.status).toBe('ERROR');
  });

  it('默认不传选项时视为最终尝试（保持直接调用既有行为）', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);

    await expect(scrapeAndSaveComments(video.id, video.url)).rejects.toThrow('scraper down');

    const after = await prisma.video.findUnique({ where: { id: video.id } });
    expect(after?.consecutiveFailures).toBe(1);
  });
});
