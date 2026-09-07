

/**
 * 抖音/TikTok 视频信息解析服务
 * 基于 Evil0ctal/Douyin_TikTok_Download_API 原理实现
 * 文档: https://github.com/Evil0ctal/Douyin_TikTok_Download_API
 */

export function getScraperApiUrl(): string {
  const configured = process.env.SCRAPER_API_URL?.trim();
  if (!configured || configured === '/api/scraper') {
    // 服务端自调 /api/scraper 代理缺少登录态必然 401，必须配置抓取服务直连地址
    throw new Error(
      '未配置抓取服务地址：请将 SCRAPER_API_URL 设置为抓取服务直连地址（如 http://localhost:8000）；' +
        '不要填 /api/scraper，服务端自调代理路由会因缺少登录态返回 401'
    );
  }
  return configured.replace(/\/$/, '');
}

// 自建爬虫为可选 fallback：未配置时返回 undefined 而不是抛错（TikHub 主调足够时用不到）
function tryGetScraperEndpoint(apiEndpoint?: string): string | undefined {
  const configured = apiEndpoint?.trim() || process.env.SCRAPER_API_URL?.trim();
  if (!configured || configured === '/api/scraper') return undefined;
  return configured.replace(/\/$/, '');
}

export function getTikHubApiKey(): string | undefined {
  const key = process.env.TIKHUB_API_KEY?.trim();
  return key || undefined;
}

const TIKHUB_API_BASE = 'https://api.tikhub.io';

function buildScraperUrl(endpoint: string, path: string, search: string): string {
  const base = endpoint.replace(/\/$/, '');
  const isProxy = base.endsWith('/api/scraper');
  const prefix = isProxy ? '' : '/api';
  return `${base}${prefix}${path}${search}`;
}

// 抓取服务响应可能较慢，统一 60s 超时并给出友好错误
const SCRAPER_TIMEOUT_MS = 60_000;

async function scraperFetch(url: string, headers?: Record<string, string>): Promise<Response> {
  try {
    return await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(SCRAPER_TIMEOUT_MS) });
  } catch (error) {
    if ((error as { name?: string })?.name === 'TimeoutError') {
      throw new Error(`抓取服务请求超时（${SCRAPER_TIMEOUT_MS / 1000}s），请稍后重试`);
    }
    throw error;
  }
}

interface ParsedVideo {
  platform: 'DOUYIN' | 'KUAISHOU' | 'SHIPINHAO';
  videoId: string;
  originalUrl: string;
  title?: string;
  author?: string;
}

interface ScrapedComment {
  id: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  createdAt: string;
  likes: number;
}

// 从分享文本中提取第一个 http/https 链接
function extractUrlFromText(text: string): string | null {
  // 保守匹配：到空白或常见中文标点/右括号为止
  const urlRegex = /https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/i;
  const match = text.match(urlRegex);
  return match ? match[0].replace(/[，。！？、；：“”‘’（）【】]+$/, '') : null;
}

// 解析视频链接，支持从抖音分享文案中提取链接
export function parseVideoUrl(rawInput: string): ParsedVideo | null {
  const input = rawInput.trim();

  // 1. 如果用户复制的是带文案的分享文本，先提取链接
  let url = input;
  try {
    new URL(input);
  } catch {
    const extracted = extractUrlFromText(input);
    if (!extracted) return null;
    url = extracted;
  }

  try {
    const urlObj = new URL(url);

    // 抖音链接解析
    if (url.includes('douyin.com') || url.includes('iesdouyin.com')) {
      // 支持的抖音格式:
      // https://v.douyin.com/xxxxx (短链，可能带 ?utm_source=... 等参数)
      // https://www.douyin.com/video/xxxxx?modeFrom=
      // https://www.douyin.com/user/xxx?modal_id=xxxxx
      // https://m.douyin.com/video/xxxxx

      let videoId = '';

      if (urlObj.pathname.includes('/video/')) {
        videoId = urlObj.pathname.split('/video/')[1]?.split('/')[0] || '';
      } else if (urlObj.searchParams.has('modal_id')) {
        videoId = urlObj.searchParams.get('modal_id') || '';
      } else if (urlObj.pathname.length > 1) {
        // 短链处理：取路径最后一段
        videoId = urlObj.pathname.split('/').filter(Boolean).pop() || '';
      }

      // 清理多余参数，只保留解析需要的部分，避免 scraper 解析异常
      const cleanUrl = url.split('?')[0];

      return {
        platform: 'DOUYIN',
        videoId: videoId || `douyin_${Date.now()}`,
        originalUrl: cleanUrl,
      };
    }

    // 快手链接解析
    if (url.includes('kuaishou.com') || url.includes('kuaishou.cn')) {
      let videoId = '';

      if (urlObj.pathname.includes('/short-video/')) {
        videoId = urlObj.pathname.split('/short-video/')[1]?.split('/')[0] || '';
      } else {
        videoId = urlObj.pathname.split('/').filter(Boolean).pop() || '';
      }

      const cleanUrl = url.split('?')[0];

      return {
        platform: 'KUAISHOU',
        videoId: videoId || `kuaishou_${Date.now()}`,
        originalUrl: cleanUrl,
      };
    }

    // 视频号链接解析 (微信)
    if (url.includes('channels.weixin.qq.com') || url.includes('weixin.qq.com')) {
      return {
        platform: 'SHIPINHAO',
        videoId: `sph_${Date.now()}`,
        originalUrl: url,
      };
    }

    return null;
  } catch {
    return null;
  }
}

// 模拟抓取评论（实际生产环境应调用真实API或爬虫服务）
// 这里使用基于 Evil0ctal 项目的模拟数据生成逻辑
export async function scrapeComments(
  parsedVideo: ParsedVideo,
  options: { maxComments?: number; minDelay?: number; maxDelay?: number } = {}
): Promise<ScrapedComment[]> {
  const { maxComments = 50 } = options;
  
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // 基于视频平台生成模拟评论数据
  // 实际项目中这里会调用:
  // 1. Evil0ctal/Douyin_TikTok_Download_API 的 API 端点
  // 2. 或自建的无头浏览器爬虫服务 (Puppeteer/Playwright)
  
  const platformNames: Record<string, string> = {
    DOUYIN: '抖音用户',
    KUAISHOU: '快手用户',
    SHIPINHAO: '视频号用户',
  };
  
  const highIntentTemplates = [
    '多少钱？能便宜吗？',
    '怎么联系你？想学',
    '在哪里可以买到？',
    '可以批发吗？大量采购',
    '求带，想学习',
    '怎么购买？',
    '有联系方式吗？',
    '这个怎么做？',
    '能详细说说吗？',
    '怎么加入？',
  ];
  
  const mediumIntentTemplates = [
    '看起来不错',
    '有点意思',
    '收藏了',
    '关注你了',
    '期待更多',
    '已点赞',
    '学习了',
    '很实用',
  ];
  
  const lowIntentTemplates = [
    '666',
    '哈哈哈',
    '不错不错',
    '厉害了',
    '好',
    '赞',
    '支持',
    '顶',
  ];
  
  const comments: ScrapedComment[] = [];
  const count = Math.min(maxComments, 20 + Math.floor(Math.random() * 30));
  
  for (let i = 0; i < count; i++) {
    const rand = Math.random();
    let content: string;
    let likes: number;
    
    if (rand < 0.15) {
      // 15% 高意向评论
      content = highIntentTemplates[Math.floor(Math.random() * highIntentTemplates.length)];
      likes = Math.floor(Math.random() * 20) + 5;
    } else if (rand < 0.4) {
      // 25% 中等意向
      content = mediumIntentTemplates[Math.floor(Math.random() * mediumIntentTemplates.length)];
      likes = Math.floor(Math.random() * 10) + 2;
    } else {
      // 60% 低意向
      content = lowIntentTemplates[Math.floor(Math.random() * lowIntentTemplates.length)];
      likes = Math.floor(Math.random() * 5);
    }
    
    comments.push({
      id: `${parsedVideo.videoId}_c${i}`,
      authorName: `${platformNames[parsedVideo.platform]}${Math.floor(Math.random() * 10000)}`,
      authorAvatar: '',
      content,
      createdAt: new Date(Date.now() - Math.floor(Math.random() * 86400000 * 7)).toISOString(),
      likes,
    });
  }
  
  return comments;
}

// 生产环境真实API调用：抖音走「TikHub 主数据源 + 自建爬虫 fallback」，其他平台仍走自建爬虫
// TikHub 文档: https://tikhub.io/zh/api-reference（接口形态与 Evil0ctal 项目一致）
export async function scrapeCommentsReal(
  parsedVideo: ParsedVideo,
  apiEndpoint?: string
): Promise<ScrapedComment[]> {
  const endpoint = tryGetScraperEndpoint(apiEndpoint);

  if (parsedVideo.platform === 'DOUYIN') {
    return scrapeDouyinComments(parsedVideo, endpoint);
  }

  // 其他平台：保持原有 hybrid 路径
  if (!endpoint) {
    throw new Error(
      '未配置抓取服务地址：请将 SCRAPER_API_URL 设置为抓取服务直连地址（如 http://localhost:8000）'
    );
  }
  return scrapeOtherPlatformComments(parsedVideo, endpoint);
}

// 抖音评论抓取：aweme_id 本地解析优先，评论 TikHub 主调、自建爬虫兜底
async function scrapeDouyinComments(
  parsedVideo: ParsedVideo,
  endpoint?: string
): Promise<ScrapedComment[]> {
  const tikhubKey = getTikHubApiKey();
  if (!tikhubKey && !endpoint) {
    throw new Error(
      '未配置评论数据源：请配置 TIKHUB_API_KEY（推荐，tikhub.io 注册获取），' +
        '或将 SCRAPER_API_URL 设置为自建抓取服务直连地址作为 fallback'
    );
  }

  const awemeId = await resolveAwemeId(parsedVideo, endpoint);

  let tikhubError: Error | undefined;
  if (tikhubKey) {
    try {
      return await fetchDouyinCommentsViaTikHub(parsedVideo.videoId, awemeId, tikhubKey);
    } catch (error) {
      tikhubError = error as Error;
      console.warn(`[Scraper] TikHub 评论抓取失败（${tikhubError.message}），尝试自建爬虫 fallback`);
    }
  }

  if (endpoint) {
    const commentsRes = await scraperFetch(
      buildScraperUrl(
        endpoint,
        '/douyin/web/fetch_video_comments',
        `?aweme_id=${awemeId}&cursor=0&count=50`
      )
    );

    if (!commentsRes.ok) {
      throw new Error(`Comments API error: ${commentsRes.status}`);
    }

    const commentsData = await commentsRes.json();
    const comments = commentsData?.data?.comments || [];
    return comments.map((c: unknown, idx: number) => mapDouyinComment(c, parsedVideo.videoId, idx));
  }

  throw new Error(`TikHub 评论抓取失败且无自建爬虫 fallback：${tikhubError?.message}`);
}

// aweme_id 解析：数字 ID 直取 → 短链本地 follow 302 → 自建 hybrid 兜底
async function resolveAwemeId(parsedVideo: ParsedVideo, endpoint?: string): Promise<string> {
  if (/^\d+$/.test(parsedVideo.videoId)) {
    return parsedVideo.videoId;
  }

  // v.douyin.com 短链：普通 GET follow 302 即可拿到最终落地页 URL（非签名接口，任意出口 IP 可用）
  try {
    const res = await scraperFetch(parsedVideo.originalUrl);
    await res.body?.cancel().catch(() => {});
    const finalUrl = res.url || '';
    const match = finalUrl.match(/\/video\/(\d+)/) || finalUrl.match(/[?&]modal_id=(\d+)/);
    if (match) return match[1];
  } catch {
    // 落入 hybrid 兜底
  }

  if (endpoint) {
    const hybridRes = await scraperFetch(
      buildScraperUrl(
        endpoint,
        '/hybrid/video_data',
        `?url=${encodeURIComponent(parsedVideo.originalUrl)}`
      )
    );

    if (!hybridRes.ok) {
      throw new Error(`Hybrid API error: ${hybridRes.status}`);
    }

    const hybridData = await hybridRes.json();
    const awemeId = hybridData?.data?.aweme_id;
    if (awemeId) return String(awemeId);
  }

  throw new Error(`无法从视频链接解析出 aweme_id: ${parsedVideo.originalUrl}`);
}

// TikHub 主数据源：成功判定 = HTTP 200 且 body code === 200（TikHub 业务错误也可能返回 HTTP 200）
async function fetchDouyinCommentsViaTikHub(
  videoId: string,
  awemeId: string,
  apiKey: string
): Promise<ScrapedComment[]> {
  const res = await scraperFetch(
    `${TIKHUB_API_BASE}/api/v1/douyin/web/fetch_video_comments?aweme_id=${awemeId}&cursor=0&count=50`,
    { Authorization: `Bearer ${apiKey}` }
  );

  if (!res.ok) {
    throw new Error(`TikHub API error: HTTP ${res.status}`);
  }

  const body = await res.json();
  if (body?.code !== 200) {
    throw new Error(`TikHub API error: code ${body?.code}`);
  }

  const comments = body?.data?.comments || [];
  return comments.map((c: unknown, idx: number) => mapDouyinComment(c, videoId, idx));
}

// 抖音评论字段映射（TikHub 与自建爬虫返回结构一致，共用）
function mapDouyinComment(c: unknown, videoId: string, idx: number): ScrapedComment {
  const comment = c as {
    user?: {
      nickname?: string;
      avatar_thumb?: { url_list?: string[] };
      avatar?: { url_list?: string[] };
    };
    text?: string;
    create_time?: number;
    digg_count?: number;
  };
  return {
    id: `${videoId}_c${idx}`,
    authorName: comment.user?.nickname || '未知用户',
    authorAvatar: comment.user?.avatar_thumb?.url_list?.[0] || comment.user?.avatar?.url_list?.[0] || '',
    content: comment.text || '',
    createdAt: comment.create_time ? new Date(comment.create_time * 1000).toISOString() : new Date().toISOString(),
    likes: comment.digg_count || 0,
  };
}

// 快手/视频号等其他平台：hybrid 解析 + comment_list
async function scrapeOtherPlatformComments(
  parsedVideo: ParsedVideo,
  endpoint: string
): Promise<ScrapedComment[]> {
  const hybridRes = await scraperFetch(
    buildScraperUrl(
      endpoint,
      '/hybrid/video_data',
      `?url=${encodeURIComponent(parsedVideo.originalUrl)}`
    )
  );

  if (!hybridRes.ok) {
    throw new Error(`Hybrid API error: ${hybridRes.status}`);
  }

  const hybridData = await hybridRes.json();
  const comments = hybridData?.data?.comment_list || [];
  return comments.map((c: unknown, idx: number) => {
    const comment = c as {
      user?: { nickname?: string; avatar?: string };
      text?: string;
      create_time?: string;
      digg_count?: number;
    };
    return {
      id: `${parsedVideo.videoId}_c${idx}`,
      authorName: comment.user?.nickname || '未知用户',
      authorAvatar: comment.user?.avatar || '',
      content: comment.text || '',
      createdAt: comment.create_time || new Date().toISOString(),
      likes: comment.digg_count || 0,
    };
  });
}
