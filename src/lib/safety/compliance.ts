// 随机延迟，模拟人工操作
export function randomDelay(min: number = 30000, max: number = 120000): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// 随机选择发送时间（9:00-22:00）
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

// 检查话术是否合规（不直接留微信/手机号）
export function checkCompliance(text: string): { compliant: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // 检查直接留微信
  const wechatPatterns = [
    /微信[号]?[：:]?\s*[a-zA-Z0-9_-]+/,
    /wx[：:]?\s*[a-zA-Z0-9_-]+/,
    /wechat[：:]?\s*[a-zA-Z0-9_-]+/i,
    /加微[信]?/,
    /\+V/i,
    /薇[信]?/,
  ];
  
  for (const pattern of wechatPatterns) {
    if (pattern.test(text)) {
      issues.push('包含直接留微信的内容，建议改为引导话术');
      break;
    }
  }
  
  // 检查直接留手机号
  if (/1[3-9]\d{9}/.test(text)) {
    issues.push('包含直接留手机号的内容');
  }
  
  // 检查诱导性词汇
  const induceWords = ['点击链接', '立即购买', '限时优惠', '免费赠送'];
  for (const word of induceWords) {
    if (text.includes(word)) {
      issues.push(`包含诱导性词汇：${word}`);
    }
  }
  
  return {
    compliant: issues.length === 0,
    issues,
  };
}

// 合规引导话术模板
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
