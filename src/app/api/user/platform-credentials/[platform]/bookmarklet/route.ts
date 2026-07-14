import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/encryption';
import { verifyBookmarkletToken } from '@/lib/bookmarklet-token';
import { Platform } from '@prisma/client';

const VALID_PLATFORMS: Platform[] = ['DOUYIN', 'KUAISHOU', 'SHIPINHAO'];

const CORS_ORIGIN = 'https://www.douyin.com';

function withCors(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', CORS_ORIGIN);
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );
  return response;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return withCors(
        NextResponse.json({ error: '缺少授权令牌' }, { status: 401 })
      );
    }

    const verified = verifyBookmarkletToken(token);
    if (!verified) {
      return withCors(
        NextResponse.json({ error: '授权令牌无效或已过期' }, { status: 401 })
      );
    }

    const { platform } = await params;
    if (!VALID_PLATFORMS.includes(platform as Platform)) {
      return withCors(
        NextResponse.json({ error: '无效的平台' }, { status: 400 })
      );
    }

    let body: { cookies?: string };
    try {
      body = await req.json();
    } catch {
      return withCors(
        NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
      );
    }

    const cookies = body.cookies;
    if (typeof cookies !== 'string' || cookies.trim().length === 0) {
      return withCors(
        NextResponse.json({ error: '缺少 cookies 字段' }, { status: 400 })
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
      })
    );
  } catch (error) {
    console.error('Bookmarklet save cookies error:', error);
    return withCors(
      NextResponse.json({ error: '保存平台凭证失败' }, { status: 500 })
    );
  }
}
