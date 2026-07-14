import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createAIClient, getAIModel } from '@/lib/ai/client';
import { getErrorMessage } from '@/lib/errors';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const apiKey = body?.aiApiKey?.trim();

    if (!apiKey) {
      return NextResponse.json({ error: '请输入 API Key' }, { status: 400 });
    }

    const client = createAIClient(apiKey);
    const response = await client.chat.completions.create({
      model: getAIModel(),
      messages: [{ role: 'user', content: '你好' }],
      max_tokens: 5,
    });

    if (!response.choices?.[0]?.message) {
      throw new Error('DeepSeek 返回异常');
    }

    return NextResponse.json({
      success: true,
      message: 'API Key 验证通过',
      model: response.model,
    });
  } catch (error) {
    console.error('Verify AI key error:', error);
    const message = getErrorMessage(error) || '验证失败';
    return NextResponse.json(
      { error: `API Key 验证失败：${message}` },
      { status: 400 }
    );
  }
}
