import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { startQrLogin, getQrLoginStatus } from '@/lib/qr-login';
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

    const { sessionId, qrCodeDataUrl } = await startQrLogin(
      session.user.id,
      platform
    );

    return NextResponse.json({ sessionId, qrCodeDataUrl });
  } catch (error) {
    console.error('Start QR login error:', error);
    return NextResponse.json(
      { error: '启动扫码登录失败' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
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

    const sessionId = req.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json(
        { error: '缺少 sessionId 参数' },
        { status: 400 }
      );
    }

    const { status, error, qrCodeDataUrl } = await getQrLoginStatus(sessionId);

    return NextResponse.json({ status, error, qrCodeDataUrl });
  } catch (error) {
    console.error('Get QR login status error:', error);
    return NextResponse.json(
      { error: '获取扫码登录状态失败' },
      { status: 500 }
    );
  }
}
