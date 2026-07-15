import { createAIClient, getAIModel, hasAIKeyConfigured } from './client';
import { getErrorMessage } from '../errors';
import {
  createDefaultIndexProvider,
  IndexProvider,
  IndexDataPoint,
  mockIndexProvider,
} from './index-api';

export interface ScoredKeyword {
  keyword: string;
  searchVolume: number; // 1-5
  competition: number; // 1-5
  businessIntent: number; // 1-5
  score: number; // 综合热度分 1-5，由 LLM 给出或本地计算
  source?: 'ai' | 'baidu' | 'douyin' | 'mock' | 'mixed';
  confidence?: number; // 0-1
}

export interface KeywordResearchResult {
  combinedSearchQueries: string[];
  coreKeywords: string[];
  longTailKeywords: string[];
  painPoints: string[];
  competitorAccounts: string[];
  searchCommands: {
    douyin: string[];
    xiaohongshu: string[];
    zhihu: string[];
    baidu: string[];
  };
  scoredKeywords: ScoredKeyword[];
  indexData?: IndexDataPoint[];
}

const SYSTEM_PROMPT = `你是一位通用的中文搜索意图与关键词优化专家。你的任务是根据用户输入的任意行业/产品/服务/人群描述，输出一份结构化、可直接用于社交媒体获客的关键词研究报告。

你不应假设任何特定行业。请把用户输入当作一个通用商业描述，先提取其中的关键实体，再按以下维度重组：

# 输入实体拆解（内部思考，不输出）
1. 地域：城市/区域/线上线下
2. 品类/服务：主营业务是什么
3. 产品/服务要素：具体项目、规格、价格、额度、周期
4. 目标人群：年龄、职业、身份、需求场景
5. 卖点/属性：优势、特色、差异化
6. 决策障碍：用户可能担心什么

# 搜索意图分层（用于生成长尾词和搜索指令）
- 信息型：是什么、怎么做、流程、条件、要求
- 对比型：哪家好、哪家靠谱、费用多少、利率/价格对比
- 交易型：推荐、申请、代办、联系电话、找中介
- 避坑型：注意事项、避坑、被骗、套路、风险

# 输出格式
请严格按以下 JSON 返回，不要输出其他内容：
{
  "combinedSearchQueries": ["综合搜索词组1", "综合搜索词组2"],
  "coreKeywords": ["核心词1", "核心词2"],
  "longTailKeywords": ["长尾词1", "长尾词2"],
  "painPoints": ["痛点1", "痛点2"],
  "competitorAccounts": ["潜在竞品方向1", "潜在话题方向2"],
  "searchCommands": {
    "douyin": ["抖音搜索指令1", "抖音搜索指令2"],
    "xiaohongshu": ["小红书搜索指令1", "小红书搜索指令2"],
    "zhihu": ["知乎搜索指令1", "知乎搜索指令2"],
    "baidu": ["百度搜索指令1", "百度搜索指令2"]
  },
  "scoredKeywords": [
    {
      "keyword": "关键词",
      "searchVolume": 3,
      "competition": 2,
      "businessIntent": 5,
      "score": 4
    }
  ]
}

# 输出要求
1. combinedSearchQueries（2-4 条）：融合「地域+核心业务+人群/场景+决策意图」，可直接复制到任意平台搜索框。不要复制用户原句，要重组。
2. coreKeywords（5-8 个）：短词，覆盖地域词、行业词、服务词、人群词。每个词控制在 2-6 个字，不要整句。
3. longTailKeywords（8-12 个）：完整搜索句，覆盖信息型/对比型/交易型/避坑型意图。每句控制在 8-16 字。
4. painPoints（5-8 个）：具体决策障碍，不要泛泛而谈。基于输入描述中的服务特点和人群特点推导。
5. competitorAccounts（5-8 个）：基于行业惯例和地域组合，给出「潜在可参考的账号命名方向 / 话题标签方向」，不是真实搜索结果，不要写具体平台账号ID。
6. searchCommands 每个平台 4-6 个：
   - 抖音：短、口语化，多用空格，适合话题搜索
   - 小红书：经验/避坑/攻略/测评/怎么选
   - 知乎：怎么样/靠谱吗/是什么/经验/推荐
   - 百度：哪家好/费用/流程/排名/哪个好
7. scoredKeywords（10-15 条）：从 coreKeywords 和 longTailKeywords 中挑选最具代表性的关键词，给出热度评分。评分标准（1-5 整数）：
   - searchVolume：搜索量/关注度。5 表示非常高，1 表示很低。
   - competition：竞争程度/内容饱和度。5 表示竞争极其激烈，1 表示蓝海。
   - businessIntent：商业转化意向。5 表示用户即将购买/咨询，1 表示纯信息浏览。
   - score：综合热度分，建议 = round((searchVolume + businessIntent - competition * 0.5) / 2)，结果限制在 1-5。
   优先选择 score >= 3 的关键词，确保涵盖高搜索量、高商业意向、中等竞争的长尾词。

# 禁止事项
- 不要机械重复用户原句
- 不要输出空泛词汇如"服务好"、"专业"
- 不要把所有长尾词都写成"XXX哪家好"一种类型
- competitorAccounts 不要编造真实存在的账号名，只输出方向性命名`;

export async function extractKeywordsWithAI(
  industry: string,
  apiKey?: string,
  indexProvider: IndexProvider | null = createDefaultIndexProvider()
): Promise<KeywordResearchResult> {
  if (!hasAIKeyConfigured(apiKey)) {
    throw new Error('未配置 AI API Key，请在「设置 > AI 模型配置」中填写 DeepSeek API Key');
  }

  const model = getAIModel();
  console.log(`[DeepSeek] Calling model=${model}, keyLength=${apiKey ? apiKey.length : 'env'}, industry="${industry.slice(0, 30)}..."`);

  try {
    const response = await createAIClient(apiKey).chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `请为以下行业/产品提取关键词和搜索指令：\n\n${industry}` },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    console.log(`[DeepSeek] Response received, model=${response.model}, usage=${JSON.stringify(response.usage)}`);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('AI 返回内容为空');
    }

    const result = JSON.parse(content);
    const normalized = normalizeResult(result);

    if (indexProvider) {
      return mergeWithIndexData(normalized, indexProvider);
    }
    return normalized;
  } catch (error) {
    console.error('[DeepSeek] API call failed:', getErrorMessage(error));
    throw error;
  }
}

function normalizeScore(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.max(1, Math.min(5, Math.round(num)));
}

function calculateScore(searchVolume: number, businessIntent: number, competition: number): number {
  return Math.max(1, Math.min(5, Math.round((searchVolume + businessIntent - competition * 0.5) / 2)));
}

async function mergeWithIndexData(
  result: KeywordResearchResult,
  indexProvider: IndexProvider
): Promise<KeywordResearchResult> {
  if (result.scoredKeywords.length === 0) {
    return result;
  }

  const keywords = result.scoredKeywords.map((item) => item.keyword);
  let indexData: IndexDataPoint[] = [];
  try {
    indexData = await indexProvider.fetch(keywords);
  } catch (error) {
    console.warn('[index] Failed to fetch index data:', getErrorMessage(error));
  }

  const byKeyword = new Map(indexData.map((item) => [item.keyword, item]));
  const hasRealData = indexData.some((item) => item.source === 'baidu' || item.source === 'douyin');

  const scoredKeywords = result.scoredKeywords.map((item) => {
    const real = byKeyword.get(item.keyword);
    if (!real) {
      return { ...item, source: 'ai' as const };
    }

    const searchVolume = real.searchVolume ?? item.searchVolume;
    const competition = real.competition ?? item.competition;
    const businessIntent = item.businessIntent;
    const score = calculateScore(searchVolume, businessIntent, competition);

    const source: ScoredKeyword['source'] =
      hasRealData && (real.source === 'baidu' || real.source === 'douyin')
        ? 'mixed'
        : real.source === 'mock'
          ? 'mock'
          : 'ai';

    return {
      ...item,
      searchVolume,
      competition,
      businessIntent,
      score,
      source,
      confidence: real.confidence,
    };
  });

  return {
    ...result,
    scoredKeywords,
    indexData,
  };
}

export function normalizeResult(result: Record<string, unknown>): KeywordResearchResult {
  const searchCommands =
    typeof result.searchCommands === 'object' && result.searchCommands !== null
      ? (result.searchCommands as Record<string, unknown>)
      : {};

  const getStringArray = (key: string): string[] =>
    Array.isArray(result[key]) ? (result[key] as unknown[]) as string[] : [];

  const getCommandArray = (key: string): string[] =>
    Array.isArray(searchCommands[key]) ? (searchCommands[key] as unknown[]) as string[] : [];

  const rawScored = Array.isArray(result.scoredKeywords) ? result.scoredKeywords : [];
  const scoredKeywords: ScoredKeyword[] = rawScored
    .map((item: unknown) => {
      const entry = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
      const searchVolume = normalizeScore(entry.searchVolume);
      const competition = normalizeScore(entry.competition);
      const businessIntent = normalizeScore(entry.businessIntent);
      const score = entry.score !== undefined ? normalizeScore(entry.score) : calculateScore(searchVolume, businessIntent, competition);
      return {
        keyword: typeof entry.keyword === 'string' ? entry.keyword : '',
        searchVolume,
        competition,
        businessIntent,
        score,
      };
    })
    .filter((item) => item.keyword.length > 0);

  return {
    combinedSearchQueries: getStringArray('combinedSearchQueries'),
    coreKeywords: getStringArray('coreKeywords'),
    longTailKeywords: getStringArray('longTailKeywords'),
    painPoints: getStringArray('painPoints'),
    competitorAccounts: getStringArray('competitorAccounts'),
    searchCommands: {
      douyin: getCommandArray('douyin'),
      xiaohongshu: getCommandArray('xiaohongshu'),
      zhihu: getCommandArray('zhihu'),
      baidu: getCommandArray('baidu'),
    },
    scoredKeywords,
  };
}

export { createDefaultIndexProvider, mockIndexProvider };
export type { IndexProvider, IndexDataPoint };
