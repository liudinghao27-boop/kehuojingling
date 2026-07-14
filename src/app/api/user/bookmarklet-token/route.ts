import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { generateBookmarkletToken } from '@/lib/bookmarklet-token';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const token = generateBookmarkletToken(session.user.id);
    return NextResponse.json({ token });
  } catch (error) {
    console.error('Get bookmarklet token error:', error);
    return NextResponse.json({ error: '获取书签令牌失败' }, { status: 500 });
  }
}
