import { createAIClient, getAIModel, hasAIKeyConfigured } from './client';

export interface GeneratedTemplate {
  name: string;
  content: string;
}

const REPLY_SYSTEM_PROMPT = `你是一位社交媒体运营专家。请根据用户提供的业务场景，生成一组**评论回复话术**。

要求：
1. 话术要自然、口语化，像真人回复，不要营销感太重。
2. 不要直接留微信、电话等联系方式，可以引导用户查看主页或私信。
3. 生成 4-6 条话术，覆盖不同意向强度的客户：
   - 高意向（明确咨询/想办理）
   - 中意向（感兴趣但未表态）
   - 低意向/泛泛评论（点赞、支持等）
   - 专业/信任建立型（展示经验、消除顾虑）
4. 每条话术控制在 50 字以内。

返回严格 JSON 格式：
{
  "templates": [
    { "name": "话术名称", "content": "话术内容" }
  ]
}`;

const DM_SYSTEM_PROMPT = `你是一位社交媒体运营专家。请根据用户提供的业务场景，生成一组**私信话术**。

要求：
1. 话术要自然、友好，像真人一对一沟通。
2. 不要直接留微信、电话等联系方式，可以引导用户查看主页、回复需求或预约沟通。
3. 生成 3-5 条话术，覆盖不同场景：
   - 初次触达/自我介绍
   - 跟进高意向客户
   - 邀约提供资料/方案
   - 消除顾虑/建立信任
4. 每条话术控制在 80 字以内。

返回严格 JSON 格式：
{
  "templates": [
    { "name": "话术名称", "content": "话术内容" }
  ]
}`;

const DEFAULT_REPLY_TEMPLATES: GeneratedTemplate[] = [
  { name: '高意向引导', content: '感谢您的信任！方便的话可以私信我一下，我把详细方案发给您~' },
  { name: '中意向跟进', content: '感兴趣的朋友可以先看看主页介绍，有问题随时交流~' },
  { name: '泛泛评论回复', content: '谢谢支持！会持续更新实用内容~' },
  { name: '专业信任型', content: '这个问题我们帮很多客户处理过，有具体需求可以私信沟通，给您一些实在建议。' },
];

const DEFAULT_DM_TEMPLATES: GeneratedTemplate[] = [
  { name: '初次触达', content: '您好，看到您关注这块，想了解一下您目前具体是什么情况？我可以帮您看看。' },
  { name: '跟进高意向', content: '上次聊的方案您考虑得怎么样了？还有哪块不太清楚的，我帮您再梳理一下。' },
  { name: '邀约提供方案', content: '您的情况我大概了解了，方便的话给我个大致需求，我帮您做一份初步方案。' },
];

export async function generateTemplates(
  type: 'reply' | 'dm',
  industryContext: string,
  apiKey?: string
): Promise<GeneratedTemplate[]> {
  const systemPrompt = type === 'reply' ? REPLY_SYSTEM_PROMPT : DM_SYSTEM_PROMPT;
  const userPrompt = `业务场景：${industryContext || '通用获客场景'}\n\n请生成${type === 'reply' ? '评论回复' : '私信'}话术。`;

  if (!hasAIKeyConfigured(apiKey)) {
    return type === 'reply' ? DEFAULT_REPLY_TEMPLATES : DEFAULT_DM_TEMPLATES;
  }

  try {
    const response = await createAIClient(apiKey).chat.completions.create({
      model: getAIModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from AI');
    }

    const result = JSON.parse(content);
    const templates: GeneratedTemplate[] = Array.isArray(result)
      ? result
      : result.templates || [];

    return templates
      .filter((t: unknown) => {
        const item = t as Record<string, unknown>;
        return item.name && item.content;
      })
      .map((t: unknown) => {
        const item = t as Record<string, unknown>;
        return {
          name: String(item.name).trim(),
          content: String(item.content).trim(),
        };
      })
      .slice(0, type === 'reply' ? 6 : 5);
  } catch (error) {
    console.error('[AI Templates] Generation failed:', error);
    return type === 'reply' ? DEFAULT_REPLY_TEMPLATES : DEFAULT_DM_TEMPLATES;
  }
}
