import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/encryption';
import { verifyBookmarkletToken } from '@/lib/bookmarklet-token';
import { Platform } from '@prisma/client';

const VALID_PLATFORMS: Platform[] = ['DOUYIN', 'KUAISHOU', 'SHIPINHAO'];

const ALLOWED_ORIGINS = [
  'https://www.douyin.com',
  'https://www.kuaishou.com',
  'https://channels.weixin.qq.com',
];

function getAllowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  return ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

function withCors(response: NextResponse, origin: string): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );
  return response;
}

function corsForbidden(): NextResponse {
  return NextResponse.json({ error: '无效的请求来源' }, { status: 403 });
}

export async function OPTIONS(request: Request) {
  const origin = getAllowedOrigin(request.headers.get('Origin'));
  if (!origin) {
    return corsForbidden();
  }
  return withCors(new NextResponse(null, { status: 204 }), origin);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  const origin = getAllowedOrigin(req.headers.get('Origin'));
  if (!origin) {
    return corsForbidden();
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return withCors(
        NextResponse.json({ error: '缺少授权令牌' }, { status: 401 }),
        origin
      );
    }

    const verified = verifyBookmarkletToken(token);
    if (!verified) {
      return withCors(
        NextResponse.json({ error: '授权令牌无效或已过期' }, { status: 401 }),
        origin
      );
    }

    const { platform } = await params;
    if (!VALID_PLATFORMS.includes(platform as Platform)) {
      return withCors(
        NextResponse.json({ error: '无效的平台' }, { status: 400 }),
        origin
      );
    }

    let body: { cookies?: string };
    try {
      body = await req.json();
    } catch {
      return withCors(
        NextResponse.json({ error: '请求体格式错误' }, { status: 400 }),
        origin
      );
    }

    const cookies = body.cookies;
    if (typeof cookies !== 'string' || cookies.trim().length === 0) {
      return withCors(
        NextResponse.json({ error: '缺少 cookies 字段' }, { status: 400 }),
        origin
      );
    }

    const encryptedCookies = encrypt(cookies);

    const credential = await prisma.platformCredential.upsert({
      where: {
        userId_platform: {
          userId: verified.userId,
          platform: platform as Platform,
        },
      },
      update: {
        cookies: encryptedCookies,
        enabled: true,
      },
      create: {
        userId: verified.userId,
        platform: platform as Platform,
        cookies: encryptedCookies,
        enabled: true,
      },
    });

    return withCors(
      NextResponse.json({
        success: true,
        credential: {
          platform: credential.platform,
          enabled: credential.enabled,
          createdAt: credential.createdAt,
          updatedAt: credential.updatedAt,
        },
      }),
      origin
    );
  } catch (error) {
    console.error('Bookmarklet save cookies error:', error);
    return withCors(
      NextResponse.json({ error: '保存平台凭证失败' }, { status: 500 }),
      origin
    );
  }
}
