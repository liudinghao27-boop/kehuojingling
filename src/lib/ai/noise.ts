import { createAIClient, getAIModel, hasAIKeyConfigured } from './client';
import { IntentAnalysis, analyzeIntentLocal } from './intent';

/**
 * 白噪音（无效评论）识别框架
 * 不绑定任何单一行业，基于用户提供的业务场景动态判断哪些评论属于噪音。
 */

export type NoiseType =
  | 'peer'      // 同行、从业者、中介、服务商
  | 'vendor'    // 广告、推销、招商加盟、卖课
  | 'scam'      // 诈骗、钓鱼、违规引流
  | 'offtopic'  // 与业务无关的闲聊、@人、纯符号
  | 'emotional' // 纯情绪、表情、无信息量的赞美/吐槽
  | 'none';     // 不是噪音，潜在客户

export interface NoiseAnalysis {
  isNoise: boolean;
  noiseType: NoiseType;
  noiseReason: string;
}

export type CommentAnalysis = IntentAnalysis & NoiseAnalysis;

const NOISE_SYSTEM_PROMPT = `你是一个社交媒体评论区「白噪音过滤」专家。
你的任务是先判断评论是否属于「无效/低价值噪音」，再对非噪音评论进行意向评分。

# 噪音类型定义（适用于任何行业）
- peer：同行、从业者、中介、服务商等 B 端身份的表态或引流。例如「有没有小白，我帮你包装」「同行交流一下」「我们也能做」「找我代办」。
- vendor：广告、推销、招商加盟、卖课、卖资料、卖工具。例如「加微信领资料」「招代理」「课程999」。
- scam：诈骗、钓鱼、违规引流、黑灰产。例如「包装贷款包过」「黑户可贷」「刷流水提额」。
- offtopic：与当前业务完全无关的闲聊、@朋友、网络段子、纯符号。
- emotional：纯情绪表达，无实质信息。例如「666」「赞」「比心」「哈哈哈」「支持」。
- none：不是噪音，可能是真实潜在客户。

# 判断原则
1. 先结合业务场景看评论：这句话是不是终端客户在表达需求或提问？
2. 如果是同行交流、服务商揽客、广告推销、诈骗、无关闲聊或纯情绪，就标记为噪音。
3. 行业术语本身不是噪音，关键看说话者身份：是「想办理业务的客户」还是「想赚客户钱的人」。
4. 只要评论包含与业务相关的具体问题、办理条件、个人情况咨询，即使带表情，也**不能**标记为 emotional/offtopic，应视为潜在客户。
5. 返回的 analyses 数组长度必须严格等于输入评论数量，顺序一致，不得遗漏任何一条。

# 意向评分标准（仅对 isNoise=false 的评论）
- 5分：明确表达咨询、购买、办理意愿，或提出与业务直接相关的具体问题。
- 4分：有明确需求但不够直接，如「哪里可以办」「我这信用怎么样」。
- 3分：表达兴趣但无明确行动意愿。
- 2分：泛泛正面评价。
- 1分：无意向或意向不明确。

# 示例（以下仅为格式示例，不限定行业）
1. 输入："好详细[赞][赞]" → isNoise=true, noiseType=emotional, noiseReason="纯赞美表情，无业务信息"
2. 输入："有没有小白，我帮你包装" → isNoise=true, noiseType=peer, noiseReason="服务方/中介揽客"
3. 输入："全款买的房子，办理房产证可以全额提取公积金吗" → isNoise=false, score=5, category=inquiry, keywords=["全款","房产证","提取公积金"]

# 返回格式
返回 JSON 对象，包含 analyses 数组：
{
  "analyses": [
    {
      "isNoise": false,
      "noiseType": "none",
      "noiseReason": "判断理由",
      "score": 4,
      "keywords": ["关键词1"],
      "category": "inquiry",
      "reason": "意向判断理由"
    }
  ]
}

如果 isNoise=true，则 score 固定为 1，category 固定为 "none"，keywords 为空数组。
 analyses 数组长度必须严格等于输入评论数量。`;

function buildUserPrompt(comments: string[], industryContext?: string): string {
  const contextLine = industryContext
    ? `\n当前业务场景：${industryContext}\n请结合该业务场景判断每条评论是否是真实客户，还是同行/广告/噪音。`
    : '';

  return `请批量分析以下 ${comments.length} 条评论：${contextLine}\n\n${comments
    .map((c, i) => `${i + 1}. "${c}"`)
    .join('\n')}\n\n请严格按 JSON 格式返回 { "analyses": [...] }，不要输出其他内容。`;
}

// 本地兜底：通用噪音规则（不绑定具体行业，但覆盖常见中文社交媒体噪音）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function classifyNoiseLocal(comment: string, _industryContext?: string): NoiseAnalysis {
  const text = comment.toLowerCase();

  // 同行/服务商
  const peerPatterns = [
    '包装', '求带', '教我做', '同行', '中介', '代办', '找我', '加我', '私信我', '私我',
    '合作', '货源', '渠道', '培训', '课程', '资料', '招代理', '加盟', '我们也能做',
    '帮你做', '我可以做', '需要的联系', '联系我', '免费咨询',
  ];
  for (const p of peerPatterns) {
    if (text.includes(p)) {
      return { isNoise: true, noiseType: 'peer', noiseReason: `包含同行/服务商关键词「${p}」` };
    }
  }

  // 广告/推销
  const vendorPatterns = ['加微信', '加v', '加q', '招商', '加盟', '代理', '批发', '采购', '售卖', '出售', '卖货'];
  for (const p of vendorPatterns) {
    if (text.includes(p)) {
      return { isNoise: true, noiseType: 'vendor', noiseReason: `包含广告/推销关键词「${p}」` };
    }
  }

  // 诈骗/黑灰产
  const scamPatterns = ['黑户', '洗白', '套现', '刷流水', '包过', '必下', '无视征信', '裸贷'];
  for (const p of scamPatterns) {
    if (text.includes(p)) {
      return { isNoise: true, noiseType: 'scam', noiseReason: `包含诈骗/黑灰产关键词「${p}」` };
    }
  }

  // 纯表情或纯情绪
  const onlyEmojis = /^\s*[^\u4e00-\u9fa5a-zA-Z0-9\s]*(?:[赞比心了支持厉害哈哈666牛逼棒好]|\[.*\])*\s*$/;
  if (onlyEmojis.test(text) || text.length === 0) {
    return { isNoise: true, noiseType: 'emotional', noiseReason: '纯表情或纯情绪表达' };
  }

  // 明显无关：只有 @ 人和无意义符号
  if (/^\s*@.*$/.test(text) && text.length < 15) {
    return { isNoise: true, noiseType: 'offtopic', noiseReason: '仅 @ 人，无业务相关内容' };
  }

  return { isNoise: false, noiseType: 'none', noiseReason: '' };
}

function analyzeCommentLocal(comment: string, industryContext?: string): CommentAnalysis {
  const noise = classifyNoiseLocal(comment, industryContext);
  if (noise.isNoise) {
    return {
      ...noise,
      score: 1,
      keywords: [],
      category: 'none',
      reason: noise.noiseReason,
    };
  }
  const intent = analyzeIntentLocal(comment, industryContext);
  return { ...noise, ...intent };
}

export async function analyzeComments(
  comments: string[],
  industryContext?: string,
  apiKey?: string
): Promise<CommentAnalysis[]> {
  if (!hasAIKeyConfigured(apiKey) || comments.length === 0) {
    return comments.map(c => analyzeCommentLocal(c, industryContext));
  }

  try {
    const response = await createAIClient(apiKey).chat.completions.create({
      model: getAIModel(),
      messages: [
        { role: 'system', content: NOISE_SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(comments, industryContext) },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from AI');
    }

    interface RawNoiseAnalysis {
      isNoise?: unknown;
      noiseType?: unknown;
      noiseReason?: unknown;
      score?: unknown;
      keywords?: unknown;
      category?: unknown;
      reason?: unknown;
    }

    const result = JSON.parse(content) as { analyses?: RawNoiseAnalysis[] } | RawNoiseAnalysis[];
    const analyses: RawNoiseAnalysis[] = Array.isArray(result) ? result : result.analyses || [];

    const mapped: CommentAnalysis[] = [];
    for (let i = 0; i < comments.length; i++) {
      const a = analyses[i];
      if (!a) {
        // AI 返回缺失时回退到本地规则，保证输出长度一致
        mapped.push(analyzeCommentLocal(comments[i], industryContext));
        continue;
      }
      const isNoise = !!a.isNoise;
      const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
      const asStringArray = (value: unknown): string[] => (Array.isArray(value) ? value as string[] : []);
      const asNumber = (value: unknown): number => (typeof value === 'number' ? value : Number(value));
      mapped.push({
        isNoise,
        noiseType: (a.noiseType as NoiseType) || 'none',
        noiseReason: asString(a.noiseReason),
        score: isNoise ? 1 : Math.max(1, Math.min(5, Math.round(asNumber(a.score)))),
        keywords: isNoise ? [] : asStringArray(a.keywords),
        category: isNoise ? 'none' : (a.category as IntentAnalysis['category']) || 'none',
        reason: isNoise ? asString(a.noiseReason) : asString(a.reason),
      });
    }
    return mapped;
  } catch (error) {
    console.error('[Noise] Batch analysis error:', error);
    return comments.map(c => analyzeCommentLocal(c, industryContext));
  }
}
