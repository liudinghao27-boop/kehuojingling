import { NextRequest, NextResponse } from 'next/server';

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

// 解析视频链接，提取平台信息和视频ID
export function parseVideoUrl(url: string): ParsedVideo | null {
  try {
    const urlObj = new URL(url);
    
    // 抖音链接解析
    if (url.includes('douyin.com') || url.includes('iesdouyin.com')) {
      // 支持格式:
      // https://v.douyin.com/xxxxx (短链)
      // https://www.douyin.com/video/xxxxx
      // https://www.douyin.com/user/xxx?modal_id=xxxxx
      
      let videoId = '';
      
      if (urlObj.pathname.includes('/video/')) {
        videoId = urlObj.pathname.split('/video/')[1]?.split('/')[0] || '';
      } else if (urlObj.searchParams.has('modal_id')) {
        videoId = urlObj.searchParams.get('modal_id') || '';
      } else if (urlObj.pathname.length > 1) {
        // 短链处理，取路径最后一段
        videoId = urlObj.pathname.split('/').pop() || '';
      }
      
      return {
        platform: 'DOUYIN',
        videoId: videoId || `douyin_${Date.now()}`,
        originalUrl: url,
      };
    }
    
    // 快手链接解析
    if (url.includes('kuaishou.com') || url.includes('kuaishou.cn')) {
      let videoId = '';
      
      if (urlObj.pathname.includes('/short-video/')) {
        videoId = urlObj.pathname.split('/short-video/')[1]?.split('/')[0] || '';
      } else {
        videoId = urlObj.pathname.split('/').pop() || '';
      }
      
      return {
        platform: 'KUAISHOU',
        videoId: videoId || `kuaishou_${Date.now()}`,
        originalUrl: url,
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

// 生产环境真实API调用示例（需要部署对应的爬虫服务）
export async function scrapeCommentsReal(
  parsedVideo: ParsedVideo,
  apiEndpoint: string = process.env.SCRAPER_API_URL || 'http://localhost:8000'
): Promise<ScrapedComment[]> {
  try {
    const response = await fetch(`${apiEndpoint}/api/hybrid/video_data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: parsedVideo.originalUrl,
        platform: parsedVideo.platform.toLowerCase(),
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Scraper API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // 转换 Evil0ctal API 返回格式到我们的格式
    return (data.comments || []).map((c: any, idx: number) => ({
      id: `${parsedVideo.videoId}_c${idx}`,
      authorName: c.user?.nickname || '未知用户',
      authorAvatar: c.user?.avatar || '',
      content: c.text || '',
      createdAt: c.create_time || new Date().toISOString(),
      likes: c.digg_count || 0,
    }));
  } catch (error) {
    console.error('Real scraper failed, falling back to mock:', error);
    return scrapeComments(parsedVideo);
  }
}
