/**
 * 种草回复生成（观点性评论，2026 合规截流方向）
 *
 * 与「私信推销」不同，种草回复是一条看起来来自真实从业者的**观点分享**：
 * 不留联系方式、不硬广，靠专业感和人设吸引对方主动点头像进主页。
 * 生成时会避开近期已发内容（语义查重），防止被平台判为模板群发。
 */

import { createAIClient, getAIModel, hasAIKeyConfigured } from './client';

export interface SeedReplyInput {
  commentContent: string;
  authorName?: string;
  videoTitle?: string;
  industryContext?: string | null;
  intentScore?: number;
  /** 近期已发出的话术（用于要求 AI 避开雷同表达） */
  avoidContents?: string[];
  /** 第几次重试（>1 时要求更大差异化） */
  attempt?: number;
  apiKey?: string;
}

const SEED_SYSTEM_PROMPT = `你是一位深耕行业的从业者，正在目标客户的视频评论区做「观点种草」——
用真实经验型评论建立专业人设，吸引对方主动点你头像看主页。

铁律（违反任何一条都算失败）：
1. 只输出评论正文本身，不超过 80 字，口语化，像真人随手写的。
2. 禁止出现任何联系方式（微信/VX/QQ/电话/二维码/加我），禁止硬广词（优惠/下单/购买/链接）。
3. 不要讨好、不要"感谢关注"式客套，要输出**具体观点或经验**（踩坑、数据、做法、反常识结论均可）。
4. 可以适当留悬念或反问，引导对方来问，但不许主动推销。
5. 不与视频作者抢话、不贬低作者。`;

function buildUserPrompt(input: SeedReplyInput): string {
  const lines = [
    `目标评论内容：${input.commentContent}`,
    input.authorName ? `评论者昵称：${input.authorName}` : '',
    input.videoTitle ? `视频主题：${input.videoTitle}` : '',
    input.industryContext ? `我的业务领域：${input.industryContext}` : '',
    input.intentScore ? `对方意向评分（1-5）：${input.intentScore}` : '',
  ].filter(Boolean);

  let prompt = lines.join('\n');

  if (input.avoidContents && input.avoidContents.length > 0) {
    const samples = input.avoidContents.slice(0, 5).map((c, i) => `${i + 1}. ${c}`).join('\n');
    prompt += `\n\n以下是我近期已经发过的评论，新评论在措辞和切入角度上必须明显不同：\n${samples}`;
  }

  if ((input.attempt ?? 1) > 1) {
    prompt += `\n\n（重要：上一次生成的版本与我已发内容太像了，请换一个完全不同的切入角度和句式结构。）`;
  }

  prompt += '\n\n请直接输出评论正文，不要任何解释。';
  return prompt;
}

/** 无 AI key 时的本地兜底：从观点型句式库中按评论内容挑一条并做轻量改写 */
const FALLBACK_SEED_REPLIES = [
  '这个方向我实操过半年，最大的坑其实不在流量在转化，选题对了事半功倍',
  '说句实话，这个做法去年还行，今年风控收紧了，得换思路做内容承接',
  '同意一半。新手最容易忽略的是评论区本身就是流量入口，光靠视频不够',
  '我们测试过十几种打法，最后跑出来的反而是最不花哨的那套，坚持发比啥都强',
  '这个挺有共鸣的，我这边客户也是卡在同一个环节，后来调整了承接路径才好起来',
];

export function getFallbackSeedReply(input: SeedReplyInput, exclude: string[] = []): string {
  const pool = FALLBACK_SEED_REPLIES.filter((t) => !exclude.includes(t));
  const candidates = pool.length > 0 ? pool : FALLBACK_SEED_REPLIES;
  // 用评论内容长度做确定性选择，同一条评论多次生成结果稳定
  const idx = (input.commentContent.length + (input.attempt ?? 1)) % candidates.length;
  return candidates[idx];
}

export async function generateSeedReply(input: SeedReplyInput): Promise<string> {
  if (!hasAIKeyConfigured(input.apiKey)) {
    return getFallbackSeedReply(input, input.avoidContents);
  }

  const response = await createAIClient(input.apiKey).chat.completions.create({
    model: getAIModel(),
    messages: [
      { role: 'system', content: SEED_SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(input) },
    ],
    temperature: 0.9, // 高温保证多样性
    max_tokens: 200,
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('Empty seed reply from AI');
  }

  // 剥掉模型可能带的引号/前缀
  return content.replace(/^[「"'\s]+|[」"'\s]+$/g, '').slice(0, 200);
}

/** 供 API 层复用的 prompt 构造（测试用） */
export const __internal = { buildUserPrompt, SEED_SYSTEM_PROMPT };
