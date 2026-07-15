import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getErrorMessage } from '@/lib/errors';

function getScraperBaseUrl(): string {
  const configured = process.env.SCRAPER_API_URL?.trim();
  if (!configured || configured.startsWith('/')) {
    return 'http://localhost:8000';
  }
  return configured.replace(/\/$/, '');
}

function buildTargetUrl(
  baseUrl: string,
  pathSegments: string[],
  searchParams: URLSearchParams
): string {
  const path = pathSegments.map((segment) => encodeURIComponent(segment)).join('/');
  const url = new URL(`${baseUrl}/${path}`);
  searchParams.forEach((value, key) => {
    url.searchParams.append(key, value);
  });
  return url.toString();
}

async function proxyRequest(req: NextRequest, pathSegments: string[]) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const baseUrl = getScraperBaseUrl();
  const targetUrl = buildTargetUrl(baseUrl, pathSegments, req.nextUrl.searchParams);

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === 'host' ||
      lower === 'connection' ||
      lower === 'content-length' ||
      lower === 'transfer-encoding'
    ) {
      return;
    }
    headers.set(key, value);
  });

  try {
    const body = req.method !== 'GET' && req.method !== 'HEAD'
      ? await req.arrayBuffer()
      : undefined;

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      // 抓取服务响应可能较慢，给予充足超时
      signal: AbortSignal.timeout(60_000),
    });

    const responseBody = await upstream.arrayBuffer();
    const response = new NextResponse(responseBody, {
      status: upstream.status,
      statusText: upstream.statusText,
    });

    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (
        lower === 'content-encoding' ||
        lower === 'transfer-encoding' ||
        lower === 'content-length'
      ) {
        return;
      }
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    console.error('[ScraperProxy] Failed to proxy request:', targetUrl, error);
    return NextResponse.json(
      {
        error: '抓取服务暂不可用',
        detail: process.env.NODE_ENV === 'development' ? getErrorMessage(error) : undefined,
      },
      { status: 502 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(req, path);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(req, path);
}
