import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { Platform } from '@prisma/client';

const VALID_PLATFORMS: Platform[] = ['DOUYIN', 'KUAISHOU', 'SHIPINHAO'];

export async function DELETE(
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

    await prisma.platformCredential.deleteMany({
      where: {
        userId: session.user.id,
        platform: platform as Platform,
      },
    });

    return NextResponse.json({
      success: true,
      message: `${platform} 凭证已删除`,
    });
  } catch (error) {
    console.error('Delete platform credential error:', error);
    return NextResponse.json({ error: '删除平台凭证失败' }, { status: 500 });
  }
}
