import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { prisma, clearDatabase } from '@/lib/test/setup';
import { createUser, createVideo, createComment } from '@/lib/test/factories';
import { getServerSession } from 'next-auth';
import { analyzeIntentWithAI, generateReplySuggestion } from '@/lib/ai/intent';
import { analyzeComments } from '@/lib/ai/noise';

vi.mock('next-auth', async () => {
  const actual = await vi.importActual<typeof import('next-auth')>('next-auth');
  return {
    ...actual,
    getServerSession: vi.fn(),
  };
});

vi.mock('@/lib/ai/intent', () => ({
  analyzeIntentWithAI: vi.fn(),
  generateReplySuggestion: vi.fn(),
}));

vi.mock('@/lib/ai/noise', () => ({
  analyzeComments: vi.fn(),
}));

function mockSession(userId: string) {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: userId, email: 'test@test.com', name: 'Test User' },
    expires: new Date(Date.now() + 86400000).toISOString(),
  });
}

describe('POST /api/ai/analyze', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
  });

  it('未登录时返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new NextRequest('http://localhost:3000/api/ai/analyze', {
      method: 'POST',
      body: JSON.stringify({ content: 'test' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('缺少评论内容时返回 400', async () => {
    const user = await createUser();
    mockSession(user.id);
    const req = new NextRequest('http://localhost:3000/api/ai/analyze', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('分析内容并返回回复建议', async () => {
    const user = await createUser();
    mockSession(user.id);
    vi.mocked(analyzeIntentWithAI).mockResolvedValue({
      score: 5,
      keywords: ['buy'],
      category: 'purchase',
      reason: 'Strong intent',
    });
    vi.mocked(generateReplySuggestion).mockResolvedValue('Thanks for your interest!');
    const req = new NextRequest('http://localhost:3000/api/ai/analyze', {
      method: 'POST',
      body: JSON.stringify({ content: 'I want to buy' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.analysis).toMatchObject({ score: 5, keywords: ['buy'], category: 'purchase' });
    expect(json.replySuggestion).toBe('Thanks for your interest!');
  });

  it('传入 commentId 时更新数据库中的评论状态', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id, { content: 'I want to buy' });
    mockSession(user.id);
    vi.mocked(analyzeIntentWithAI).mockResolvedValue({
      score: 5,
      keywords: ['buy'],
      category: 'purchase',
      reason: 'Strong intent',
    });
    vi.mocked(generateReplySuggestion).mockResolvedValue('Thanks!');
    const req = new NextRequest('http://localhost:3000/api/ai/analyze', {
      method: 'POST',
      body: JSON.stringify({ commentId: comment.id, content: 'I want to buy' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const updated = await prisma.comment.findUnique({ where: { id: comment.id } });
    expect(updated?.status).toBe('ANALYZED');
    expect(updated?.intentScore).toBe(5);
    expect(updated?.intentKeywords).toEqual(['buy']);
  });

  it('不能更新他人的评论', async () => {
    const owner = await createUser();
    const attacker = await createUser();
    const video = await createVideo(owner.id);
    const comment = await createComment(video.id, { content: 'I want to buy' });
    mockSession(attacker.id);
    const req = new NextRequest('http://localhost:3000/api/ai/analyze', {
      method: 'POST',
      body: JSON.stringify({ commentId: comment.id, content: 'I want to buy' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const unchanged = await prisma.comment.findUnique({ where: { id: comment.id } });
    expect(unchanged?.status).toBe('NEW');
    expect(unchanged?.intentScore).toBe(0);
    expect(vi.mocked(analyzeIntentWithAI)).not.toHaveBeenCalled();
  });

  it('分数低于阈值时保持 NEW 状态', async () => {
    const user = await createUser({ intentScoreThreshold: 4 });
    const video = await createVideo(user.id);
    const comment = await createComment(video.id, { content: 'Maybe' });
    mockSession(user.id);
    vi.mocked(analyzeIntentWithAI).mockResolvedValue({
      score: 2,
      keywords: [],
      category: 'none',
      reason: 'Low',
    });
    vi.mocked(generateReplySuggestion).mockResolvedValue('OK');
    const req = new NextRequest('http://localhost:3000/api/ai/analyze', {
      method: 'POST',
      body: JSON.stringify({ commentId: comment.id, content: 'Maybe' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const updated = await prisma.comment.findUnique({ where: { id: comment.id } });
    expect(updated?.status).toBe('NEW');
  });
});

describe('GET /api/ai/analyze', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
  });

  it('未登录时返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new NextRequest('http://localhost:3000/api/ai/analyze?videoId=123');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('缺少 videoId 时返回 400', async () => {
    const user = await createUser();
    mockSession(user.id);
    const req = new NextRequest('http://localhost:3000/api/ai/analyze');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('批量分析视频下的 NEW 评论并更新状态', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    const comment = await createComment(video.id, { content: 'I want to buy', status: 'NEW' });
    mockSession(user.id);
    vi.mocked(analyzeComments).mockResolvedValue([
      {
        isNoise: false,
        noiseType: 'none',
        noiseReason: '',
        score: 5,
        keywords: ['buy'],
        category: 'purchase',
        reason: 'Strong',
      },
    ]);
    const req = new NextRequest(`http://localhost:3000/api/ai/analyze?videoId=${video.id}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.analyzed).toBe(1);
    expect(json.results[0].id).toBe(comment.id);
    const updated = await prisma.comment.findUnique({ where: { id: comment.id } });
    expect(updated?.status).toBe('ANALYZED');
    expect(updated?.intentScore).toBe(5);
  });

  it('不能分析他人视频的评论', async () => {
    const owner = await createUser();
    const attacker = await createUser();
    const video = await createVideo(owner.id);
    await createComment(video.id, { content: 'Secret comment', status: 'NEW' });
    mockSession(attacker.id);
    const req = new NextRequest(`http://localhost:3000/api/ai/analyze?videoId=${video.id}`);
    const res = await GET(req);
    expect(res.status).toBe(404);
    expect(vi.mocked(analyzeComments)).not.toHaveBeenCalled();
  });

  it('只分析状态为 NEW 的评论', async () => {
    const user = await createUser();
    const video = await createVideo(user.id);
    await createComment(video.id, { content: 'Already analyzed', status: 'ANALYZED' });
    mockSession(user.id);
    vi.mocked(analyzeComments).mockResolvedValue([]);
    const req = new NextRequest(`http://localhost:3000/api/ai/analyze?videoId=${video.id}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.analyzed).toBe(0);
  });
});
