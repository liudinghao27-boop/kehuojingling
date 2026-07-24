import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { clearDatabase, prisma } from '@/lib/test/setup';
import {
  createUser,
  createVideo,
  createComment,
  createSenderAccount,
} from '@/lib/test/factories';
import { getServerSession } from 'next-auth';

vi.mock('next-auth', async () => {
  const actual = await vi.importActual<typeof import('next-auth')>('next-auth');
  return {
    ...actual,
    getServerSession: vi.fn(),
  };
});

function mockSession(userId: string) {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: userId, email: 'test@test.com', name: 'Test User', plan: 'FREE' },
    expires: new Date(Date.now() + 86400000).toISOString(),
  });
}

describe('GET /api/user/sender-accounts/stats', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetAllMocks();
  });

  it('未登录时返回 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('无账号时返回全零统计', async () => {
    const user = await createUser();
    mockSession(user.id);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stats).toEqual({
      total: 0,
      active: 0,
      cooling: 0,
      disabled: 0,
      expired: 0,
      avgHealthScore: 0,
      todaySent: 0,
      todayLimit: 0,
      todayFailed: 0,
      failureRate: 0,
    });
  });

  it('统计各状态账号数、平均健康度和日限额', async () => {
    const user = await createUser();
    const other = await createUser();
    await createSenderAccount(user.id, { status: 'ACTIVE', healthScore: 80, dailyLimit: 50 });
    await createSenderAccount(user.id, { status: 'ACTIVE', healthScore: 60, dailyLimit: 30 });
    await createSenderAccount(user.id, { status: 'COOLING', healthScore: 20 });
    await createSenderAccount(user.id, { status: 'DISABLED', healthScore: 40 });
    await createSenderAccount(user.id, { status: 'EXPIRED', healthScore: 10 });
    await createSenderAccount(other.id, { status: 'ACTIVE' });
    mockSession(user.id);

    const res = await GET();
    const body = await res.json();

    expect(body.stats.total).toBe(5);
    expect(body.stats.active).toBe(2);
    expect(body.stats.cooling).toBe(1);
    expect(body.stats.disabled).toBe(1);
    expect(body.stats.expired).toBe(1);
    // (80 + 60 + 20 + 40 + 10) / 5 = 42
    expect(body.stats.avgHealthScore).toBe(42);
    // 50 + 30 + 50*3（默认值）
    expect(body.stats.todayLimit).toBe(230);
  });

  it('统计今日成功/失败数并计算 failureRate', async () => {
    const user = await createUser();
    const other = await createUser();
    await createSenderAccount(user.id, {});

    const video = await createVideo(user.id);
    const comment = await createComment(video.id);
    const otherVideo = await createVideo(other.id);
    const otherComment = await createComment(otherVideo.id);

    // 今日：2 成功（reply + dm）、1 失败（reply）
    await prisma.reply.create({
      data: { content: 'r1', status: 'SENT', sentAt: new Date(), commentId: comment.id },
    });
    await prisma.dm.create({
      data: { content: 'd1', status: 'SENT', sentAt: new Date(), commentId: comment.id },
    });
    await prisma.reply.create({
      data: { content: 'r2', status: 'FAILED', commentId: comment.id },
    });
    // 昨天的记录不应计入
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.reply.create({
      data: { content: 'r3', status: 'FAILED', commentId: comment.id, createdAt: yesterday },
    });
    // 其他用户的记录不应计入
    await prisma.dm.create({
      data: { content: 'd2', status: 'FAILED', commentId: otherComment.id },
    });
    // PENDING 不计入
    await prisma.dm.create({
      data: { content: 'd3', status: 'PENDING', commentId: comment.id },
    });

    mockSession(user.id);
    const res = await GET();
    const body = await res.json();

    expect(body.stats.todaySent).toBe(2);
    expect(body.stats.todayFailed).toBe(1);
    expect(body.stats.failureRate).toBeCloseTo(1 / 3);
  });
});
