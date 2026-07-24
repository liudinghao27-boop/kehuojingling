/**
 * 内容合规与安全模块
 *
 * 职责：
 * - 随机延迟模拟人工操作
 * - 发送时间窗口控制
 * - 话术合规检查（敏感词、联系方式、诱导词）
 * - 自动生成合规变体
 */

// ---------------------------------------------------------------------------
// 随机延迟
// ---------------------------------------------------------------------------

/** 随机延迟，模拟人工操作 */
export function randomDelay(min: number = 30000, max: number = 120000): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/** 短随机延迟，用于操作间微调 */
export function shortDelay(min: number = 500, max: number = 2000): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// ---------------------------------------------------------------------------
// 发送时间窗口
// ---------------------------------------------------------------------------

/** 安全发送小时（避开平台风控高峰期） */
const SAFE_HOURS = [10, 11, 15, 16, 17, 19, 20];

/** 随机选择发送时间（9:00-22:00） */
export function getRandomSendTime(): Date {
  const now = new Date();
  const hour = Math.floor(Math.random() * 13) + 9; // 9-22
  const minute = Math.floor(Math.random() * 60);
  const sendTime = new Date(now);
  sendTime.setHours(hour, minute, 0, 0);

  if (sendTime < now) {
    sendTime.setDate(sendTime.getDate() + 1);
  }

  return sendTime;
}

/** 获取下一个安全发送时间 */
export function getNextSafeSendTime(): Date {
  const now = new Date();
  const hour = now.getHours();

  if (SAFE_HOURS.includes(hour)) {
    // 当前在安全窗口，延迟 5-30 分钟
    return new Date(now.getTime() + (5 + Math.random() * 25) * 60 * 1000);
  }

  // 推到下一个安全窗口
  const nextSafeHour = SAFE_HOURS.find(h => h > hour) ?? SAFE_HOURS[0] + 24;
  const target = new Date(now);
  target.setHours(nextSafeHour % 24, Math.floor(Math.random() * 60), 0, 0);
  if (nextSafeHour > 24) target.setDate(target.getDate() + 1);
  return target;
}

/** 检查当前是否在安全发送窗口 */
export function isSafeSendTime(): boolean {
  return SAFE_HOURS.includes(new Date().getHours());
}

// ---------------------------------------------------------------------------
// 敏感词库
// ---------------------------------------------------------------------------

/** 联系方式类敏感词 */
const CONTACT_PATTERNS = [
  /微信[号]?[：:]?\s*[a-zA-Z0-9_-]+/,
  /wx[：:]?\s*[a-zA-Z0-9_-]+/i,
  /wechat[：:]?\s*[a-zA-Z0-9_-]+/i,
  /加微[信]?/,
  /\+V/i,
  /薇[信]?/,
  /qq[号]?[：:]?\s*\d+/i,
  /企鹅[号]?[：:]?\s*\d+/i,
  /1[3-9]\d{9}/, // 手机号
];

/** 诱导性词汇 */
const INDUCE_WORDS = [
  '点击链接',
  '立即购买',
  '限时优惠',
  '免费赠送',
  '免费领取',
  '马上抢购',
  '速来',
  '最后一天',
];

/** 违规内容敏感词 */
const SENSITIVE_WORDS = [
  '兼职',
  '刷单',
  '返利',
  '赌博',
  '彩票',
  '贷款',
  '提现',
  '充值',
  '代练',
  '外挂',
  '破解',
  '盗版',
];

// ---------------------------------------------------------------------------
// 合规检查
// ---------------------------------------------------------------------------

export interface ComplianceResult {
  compliant: boolean;
  issues: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * 检查话术是否合规。
 * 返回详细问题列表和风险等级。
 */
export function checkCompliance(text: string): ComplianceResult {
  const issues: string[] = [];
  let riskLevel: 'low' | 'medium' | 'high' = 'low';

  // 检查联系方式（高风险）
  for (const pattern of CONTACT_PATTERNS) {
    if (pattern.test(text)) {
      issues.push('包含直接联系方式（微信/QQ/手机号），建议改为引导话术');
      riskLevel = 'high';
      break;
    }
  }

  // 检查诱导性词汇（中风险）
  const foundInduce = INDUCE_WORDS.filter(word => text.includes(word));
  if (foundInduce.length > 0) {
    issues.push(`包含诱导性词汇：${foundInduce.join('、')}`);
    if (riskLevel === 'low') riskLevel = 'medium';
  }

  // 检查违规敏感词（高风险）
  const foundSensitive = SENSITIVE_WORDS.filter(word => text.includes(word));
  if (foundSensitive.length > 0) {
    issues.push(`包含违规敏感词：${foundSensitive.join('、')}`);
    riskLevel = 'high';
  }

  return {
    compliant: issues.length === 0,
    issues,
    riskLevel,
  };
}

/**
 * 快速检查是否包含联系方式。
 */
export function containsContactInfo(text: string): boolean {
  return CONTACT_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * 快速检查是否包含敏感词。
 */
export function containsSensitiveWord(text: string): string[] {
  return SENSITIVE_WORDS.filter(word => text.includes(word));
}

// ---------------------------------------------------------------------------
// 合规变体生成
// ---------------------------------------------------------------------------

/**
 * 将不合规内容改写为安全变体。
 */
export function generateCompliantVariant(original: string): string {
  let result = original;

  // 微信相关 → 引导话术
  result = result.replace(/微信[号]?[：:]?\s*\S+/g, '看我主页简介');
  result = result.replace(/wx[：:]?\s*\S+/gi, '私信交流');
  result = result.replace(/wechat[：:]?\s*\S+/gi, '私信交流');
  result = result.replace(/加微[信]?/g, '私信我');
  result = result.replace(/\+V/gi, '私信我');
  result = result.replace(/薇[信]?/g, '私信');

  // 手机号 → 删除
  result = result.replace(/1[3-9]\d{9}/g, '');

  // QQ → 删除
  result = result.replace(/qq[号]?[：:]?\s*\d+/gi, '');
  result = result.replace(/企鹅[号]?[：:]?\s*\d+/gi, '');

  // 诱导词 → 中性表达
  result = result.replace(/点击链接/g, '查看主页');
  result = result.replace(/立即购买/g, '了解更多');
  result = result.replace(/限时优惠/g, '欢迎关注');
  result = result.replace(/免费赠送/g, '资料分享');
  result = result.replace(/免费领取/g, '资料分享');
  result = result.replace(/马上抢购/g, '欢迎关注');
  result = result.replace(/速来/g, '欢迎');
  result = result.replace(/最后一天/g, '近期');

  // 清理多余空格
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

// ---------------------------------------------------------------------------
// 合规话术模板
// ---------------------------------------------------------------------------

export const compliantTemplates = {
  reply: [
    '感谢您的关注！感兴趣的朋友可以看看我的主页介绍哦~',
    '私信您详细资料，请查收~',
    '想了解更多可以看看我的置顶视频',
    '有问题欢迎私信交流',
  ],
  dm: [
    '您好！看到您对我们的内容感兴趣，这里有一些详细资料供您参考',
    '感谢您的关注！我整理了一份资料，希望能帮到您',
    '您好！我们可以进一步交流，看看怎么帮到您',
  ],
};

/** 获取随机合规话术 */
export function getRandomCompliantTemplate(type: 'reply' | 'dm'): string {
  const templates = compliantTemplates[type];
  return templates[Math.floor(Math.random() * templates.length)];
}
