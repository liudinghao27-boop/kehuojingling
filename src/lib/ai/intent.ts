import OpenAI from 'openai';

/**
 * AI 意向识别服务
 * 基于 OpenAI GPT API 实现评论意向分析
 * 可识别用户购买意向、学习意向、合作意向等
 */

// 懒加载 OpenAI 实例，避免构建时缺少 API Key 报错
let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    });
  }
  return openai;
}

export interface IntentAnalysis {
  score: number; // 1-5 意向分数
  keywords: string[]; // 识别到的意向关键词
  category: 'purchase' | 'learn' | 'cooperate' | 'inquiry' | 'none'; // 意向类别
  reason: string; // AI 判断理由
}

const SYSTEM_PROMPT = `你是一个社交媒体评论意向分析专家。

你的任务是分析用户评论，判断其对商家的意向程度。

评分标准（1-5分）：
- 5分（强意向）：明确表达购买/合作/学习意愿，如"多少钱？""怎么联系？""想学习"
- 4分（高意向）：有明确需求但不够直接，如"哪里可以买？""求带"
- 3分（中意向）：表达兴趣但无明确行动意愿，如"看起来不错""收藏了"
- 2分（低意向）：泛泛的正面评价，如"666""学习了"
- 1分（无意向）：无关评论或负面评论

同时识别评论中的意向关键词，并判断意向类别：
- purchase: 购买意向
- learn: 学习意向
- cooperate: 合作意向
- inquiry: 咨询意向
- none: 无意向

请用 JSON 格式返回结果：
{
  "score": 数字,
  "keywords": ["关键词1", "关键词2"],
  "category": "类别",
  "reason": "判断理由"
}`;

// 使用 OpenAI API 分析评论意向
export async function analyzeIntentWithAI(comment: string): Promise<IntentAnalysis> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      // 没有 API Key 时回退到本地规则分析
      return analyzeIntentLocal(comment);
    }

    const response = await getOpenAI().chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `请分析以下评论的意向：\n\n"${comment}"` },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const result = JSON.parse(content);
    
    return {
      score: Math.max(1, Math.min(5, Math.round(result.score))),
      keywords: result.keywords || [],
      category: result.category || 'none',
      reason: result.reason || '',
    };
  } catch (error) {
    console.error('AI analysis error:', error);
    // API 调用失败时回退到本地规则
    return analyzeIntentLocal(comment);
  }
}

// 批量分析评论意向（更高效，使用单个请求）
export async function analyzeBatchWithAI(comments: string[]): Promise<IntentAnalysis[]> {
  try {
    if (!process.env.OPENAI_API_KEY || comments.length === 0) {
      return comments.map(c => analyzeIntentLocal(c));
    }

    const response = await getOpenAI().chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { 
          role: 'user', 
          content: `请批量分析以下 ${comments.length} 条评论的意向，返回 JSON 数组：\n\n${comments.map((c, i) => `${i + 1}. "${c}"`).join('\n')}\n\n返回格式：[{"score": 1, "keywords": [], "category": "none", "reason": ""}]` 
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const result = JSON.parse(content);
    const analyses = Array.isArray(result) ? result : result.analyses || [];
    
    return analyses.map((a: any) => ({
      score: Math.max(1, Math.min(5, Math.round(a.score))),
      keywords: a.keywords || [],
      category: a.category || 'none',
      reason: a.reason || '',
    }));
  } catch (error) {
    console.error('Batch AI analysis error:', error);
    return comments.map(c => analyzeIntentLocal(c));
  }
}

// 本地规则分析（无需 API Key，作为 fallback）
export function analyzeIntentLocal(comment: string): IntentAnalysis {
  const text = comment.toLowerCase();
  
  // 强意向关键词
  const strongKeywords = ['多少钱', '怎么联系', '怎么买', '哪里买', '求带', '想学', '怎么加入', '怎么购买', '有联系方式', '批发', '采购', '大量', '合作'];
  // 高意向关键词
  const highKeywords = ['想买', '感兴趣', '了解一下', '详细', '资料', '怎么弄', '教教我', '指导'];
  // 中意向关键词
  const mediumKeywords = ['不错', '挺好', '有用', '实用', '收藏', '关注', '学习了', '期待'];
  
  let score = 1;
  let keywords: string[] = [];
  let category: IntentAnalysis['category'] = 'none';
  
  // 检查强意向
  for (const kw of strongKeywords) {
    if (text.includes(kw)) {
      score = 5;
      keywords.push(kw);
      if (['批发', '采购', '大量', '合作'].includes(kw)) {
        category = 'cooperate';
      } else if (['想学', '求带', '教教我', '指导'].includes(kw)) {
        category = 'learn';
      } else {
        category = 'purchase';
      }
    }
  }
  
  // 检查购买意向（单独处理）
  if (score < 5) {
    const buyPatterns = ['哪里买', '在哪买', '怎么买', '如何购买', '想买', '购买', '买到'];
    for (const p of buyPatterns) {
      if (text.includes(p)) {
        score = Math.max(score, 4);
        keywords.push(p);
        category = 'purchase';
      }
    }
  }
  
  // 检查高意向
  if (score < 5) {
    for (const kw of highKeywords) {
      if (text.includes(kw)) {
        score = Math.max(score, 4);
        keywords.push(kw);
        category = 'inquiry';
      }
    }
  }
  
  // 检查中意向
  if (score < 4) {
    for (const kw of mediumKeywords) {
      if (text.includes(kw)) {
        score = Math.max(score, 3);
        keywords.push(kw);
        category = 'inquiry';
      }
    }
  }
  
  // 低意向判断
  if (score < 3) {
    const lowPatterns = ['666', '厉害', '赞', '好', '顶', '支持', '哈哈', '不错'];
    for (const p of lowPatterns) {
      if (text.includes(p)) {
        score = Math.max(score, 2);
      }
    }
  }
  
  // 去重关键词
  keywords = [...new Set(keywords)];
  
  const reasons: Record<number, string> = {
    5: '明确表达购买/合作/学习意向',
    4: '有明确需求，建议主动触达',
    3: '表达兴趣，可适度引导',
    2: '泛泛评价，价值较低',
    1: '无意向或意向不明确',
  };
  
  return {
    score,
    keywords,
    category,
    reason: reasons[score] || '',
  };
}

// 生成个性化回复建议
export async function generateReplySuggestion(
  comment: string,
  intent: IntentAnalysis,
  template?: string
): Promise<string> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      // 回退到模板回复
      return template || getDefaultReply(intent);
    }

    const response = await getOpenAI().chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: '你是一个社交媒体运营助手，需要根据用户评论和意向分析，生成自然、友好的回复。回复要引导用户查看主页或私信，不能直接留联系方式。控制在50字以内。',
        },
        {
          role: 'user',
          content: `用户评论："${comment}"\n\n意向分析：${intent.score}分（${intent.category}），关键词：${intent.keywords.join(', ')}\n\n请生成回复：`,
        },
      ],
      temperature: 0.7,
      max_tokens: 100,
    });

    return response.choices[0]?.message?.content || getDefaultReply(intent);
  } catch (error) {
    console.error('Generate reply error:', error);
    return getDefaultReply(intent);
  }
}

function getDefaultReply(intent: IntentAnalysis): string {
  const replies: Record<string, string[]> = {
    purchase: [
      '感谢您的关注！感兴趣的朋友可以看看我的主页介绍哦~',
      '私信您详细资料，请查收~',
    ],
    learn: [
      '想了解更多可以看看我的置顶视频',
      '有问题欢迎私信交流',
    ],
    cooperate: [
      '感谢您的关注！我们可以进一步交流，看看怎么帮到您',
      '我整理了一份资料，希望能帮到您',
    ],
    inquiry: [
      '感谢您的关注！感兴趣的朋友可以看看我的主页介绍哦~',
      '有问题欢迎私信交流',
    ],
    none: [
      '感谢您的支持！',
      '谢谢关注，会持续更新优质内容',
    ],
  };
  
  const categoryReplies = replies[intent.category] || replies.none;
  return categoryReplies[Math.floor(Math.random() * categoryReplies.length)];
}
