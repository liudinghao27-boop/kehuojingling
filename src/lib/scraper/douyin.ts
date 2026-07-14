

/**
 * 抖音/TikTok 视频信息解析服务
 * 基于 Evil0ctal/Douyin_TikTok_Download_API 原理实现
 * 文档: https://github.com/Evil0ctal/Douyin_TikTok_Download_API
 */

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

// 生产环境真实API调用（ Evil0ctal/Douyin_TikTok_Download_API ）
export async function scrapeCommentsReal(
  parsedVideo: ParsedVideo,
  apiEndpoint: string = process.env.SCRAPER_API_URL || 'http://localhost:8000'
): Promise<ScrapedComment[]> {
  const endpoint = apiEndpoint.replace(/\/$/, '');

  // 1. 先解析出平台内部视频ID
  const hybridRes = await fetch(
    `${endpoint}/api/hybrid/video_data?url=${encodeURIComponent(parsedVideo.originalUrl)}`,
    { method: 'GET' }
  );

  if (!hybridRes.ok) {
    throw new Error(`Hybrid API error: ${hybridRes.status}`);
  }

  const hybridData = await hybridRes.json();
  const awemeId = hybridData?.data?.aweme_id;

  if (!awemeId) {
    throw new Error('无法从视频链接解析出 aweme_id');
  }

  // 2. 拉取评论（抖音）
  if (parsedVideo.platform === 'DOUYIN') {
    const commentsRes = await fetch(
      `${endpoint}/api/douyin/web/fetch_video_comments?aweme_id=${awemeId}&cursor=0&count=50`,
      { method: 'GET' }
    );

    if (!commentsRes.ok) {
      throw new Error(`Comments API error: ${commentsRes.status}`);
    }

    const commentsData = await commentsRes.json();
    const comments = commentsData?.data?.comments || [];

    return comments.map((c: unknown, idx: number) => {
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
        id: `${parsedVideo.videoId}_c${idx}`,
        authorName: comment.user?.nickname || '未知用户',
        authorAvatar: comment.user?.avatar_thumb?.url_list?.[0] || comment.user?.avatar?.url_list?.[0] || '',
        content: comment.text || '',
        createdAt: comment.create_time ? new Date(comment.create_time * 1000).toISOString() : new Date().toISOString(),
        likes: comment.digg_count || 0,
      };
    });
  }

  // 其他平台：先尝试 hybrid 返回的 comment_list
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
