import { Firecrawl } from '@mendable/firecrawl-js';
import { createAIClient, getAIModel, hasAIKeyConfigured } from './client';

export interface WebResearchResult {
  hotTopics: string[];
  painPoints: string[];
  competitorAccounts: string[];
  keywords: string[];
  summary: string;
}

let firecrawl: Firecrawl | null = null;

function getFirecrawl(): Firecrawl {
  if (!firecrawl) {
    firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY || '' });
  }
  return firecrawl;
}

const SYSTEM_PROMPT = `你是一位市场研究分析师，擅长从网页内容中提取对获客有价值的信息。

请根据用户提供的网页 Markdown 内容，输出一份结构化的研究报告，用于帮助用户在社交媒体平台找到对标内容和潜在客户。

请严格按以下 JSON 格式返回，不要输出其他内容：
{
  "hotTopics": ["热门话题1", "热门话题2"],
  "painPoints": ["用户痛点1", "用户痛点2"],
  "competitorAccounts": ["竞品账号/品牌1", "竞品账号/品牌2"],
  "keywords": ["关键词1", "关键词2"],
  "summary": "对网页内容的简短总结"
}

要求：
- hotTopics 3-8 个
- painPoints 3-6 个
- competitorAccounts 3-6 个
- keywords 5-10 个
- summary 100 字以内`;

export async function researchWebPage(url: string, apiKey?: string): Promise<WebResearchResult> {
  if (!process.env.FIRECRAWL_API_KEY) {
    throw new Error('未配置 FIRECRAWL_API_KEY');
  }

  if (!hasAIKeyConfigured(apiKey)) {
    throw new Error('未配置 AI API Key，请在「设置 > AI 模型配置」中填写 DeepSeek API Key');
  }

  const scrapeResult = await getFirecrawl().scrape(url, {
    formats: ['markdown'],
  });

  const markdown =
    (scrapeResult as { data?: { markdown?: string }; markdown?: string })?.data?.markdown ||
    (scrapeResult as { data?: { markdown?: string }; markdown?: string })?.markdown ||
    '';
  if (!markdown) {
    throw new Error('未能从网页提取到内容');
  }

  const truncated = markdown.slice(0, 12000);
  const model = getAIModel();
  console.log(`[DeepSeek] Research call, model=${model}, keyLength=${apiKey ? apiKey.length : 'env'}, url=${url}`);

  const response = await createAIClient(apiKey).chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `网页 URL：${url}\n\n网页内容：\n${truncated}` },
    ],
    temperature: 0.5,
    response_format: { type: 'json_object' },
  });

  console.log(`[DeepSeek] Research response received, model=${response.model}, usage=${JSON.stringify(response.usage)}`);

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('AI 返回内容为空');
  }

  const result = JSON.parse(content);
  return normalizeResult(result);
}

function normalizeResult(result: Record<string, unknown>): WebResearchResult {
  const getStringArray = (key: string): string[] =>
    Array.isArray(result[key]) ? (result[key] as unknown[]) as string[] : [];

  return {
    hotTopics: getStringArray('hotTopics'),
    painPoints: getStringArray('painPoints'),
    competitorAccounts: getStringArray('competitorAccounts'),
    keywords: getStringArray('keywords'),
    summary: typeof result.summary === 'string' ? result.summary : '',
  };
}
