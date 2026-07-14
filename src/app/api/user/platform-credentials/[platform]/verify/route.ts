import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { getActiveProvider } from '@/lib/sender/config';
import { Platform } from '@prisma/client';

const VALID_PLATFORMS: Platform[] = ['DOUYIN', 'KUAISHOU', 'SHIPINHAO'];

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { platform } = await params;

    if (!VALID_PLATFORMS.includes(platform as Platform)) {
      return NextResponse.json({ error: '无效的平台' }, { status: 400 });
    }

    const credential = await prisma.platformCredential.findUnique({
      where: {
        userId_platform: {
          userId: session.user.id,
          platform: platform as Platform,
        },
      },
    });

    if (!credential) {
      return NextResponse.json(
        { error: '未找到该平台凭证' },
        { status: 404 }
      );
    }

    let cookies: string;
    try {
      cookies = decrypt(credential.cookies);
    } catch (error) {
      console.error('Decrypt cookies error:', error);
      return NextResponse.json(
        { valid: false, error: '凭证解密失败' },
        { status: 200 }
      );
    }

    const provider = getActiveProvider(platform);
    const validation = await provider.validateCredentials({ cookies });

    return NextResponse.json(validation);
  } catch (error) {
    console.error('Verify platform credential error:', error);
    return NextResponse.json(
      { valid: false, error: '验证平台凭证失败' },
      { status: 500 }
    );
  }
}
