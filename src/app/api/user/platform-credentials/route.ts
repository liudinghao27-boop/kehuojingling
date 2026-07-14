import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/encryption';
import { z } from 'zod';

const platformSchema = z.enum(['DOUYIN', 'KUAISHOU', 'SHIPINHAO']);

const saveCredentialSchema = z.object({
  platform: platformSchema,
  cookies: z.union([z.string(), z.record(z.string(), z.any())]),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const credentials = await prisma.platformCredential.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        platform: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      credentials: credentials.map((credential) => ({
        ...credential,
        createdAt: credential.createdAt.toISOString(),
        updatedAt: credential.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('List platform credentials error:', error);
    return NextResponse.json(
      { error: '获取平台凭证列表失败' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const result = saveCredentialSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { platform, cookies } = result.data;

    // 如果前端传入的是对象，先序列化为字符串；字符串则 trim 后直接加密
    const cookiesToEncrypt =
      typeof cookies === 'object'
        ? JSON.stringify(cookies)
        : cookies.trim();

    const encryptedCookies = encrypt(cookiesToEncrypt);

    const credential = await prisma.platformCredential.upsert({
      where: {
        userId_platform: {
          userId: session.user.id,
          platform,
        },
      },
      update: {
        cookies: encryptedCookies,
        enabled: true,
      },
      create: {
        userId: session.user.id,
        platform,
        cookies: encryptedCookies,
        enabled: true,
      },
      select: {
        id: true,
        platform: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      credential: {
        ...credential,
        createdAt: credential.createdAt.toISOString(),
        updatedAt: credential.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Save platform credential error:', error);
    return NextResponse.json({ error: '保存平台凭证失败' }, { status: 500 });
  }
}
