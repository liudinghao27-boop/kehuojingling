/**
 * 发出端话术语义查重（防平台风控）
 *
 * 平台风控会识别「同一账号发出语义雷同的评论/私信」并判为营销号。
 * 这里在内容发出前做近重复检测：归一化 → 中文二字元语法（bigram）→ Jaccard 相似度。
 * 纯本地计算，不依赖 embedding API，毫秒级。
 */

/** 归一化：去空白、标点、emoji、大小写，只保留文字与数字 */
export function normalizeContent(text: string): string {
  return text
    .toLowerCase()
    // 去掉 emoji 与符号，保留中日韩文字、字母、数字
    .replace(/[^\p{Script=Han}a-z0-9]/gu, '');
}

/** 生成二字元集合（中文短文本上 bigram 比 unigram 更能捕捉语序差异） */
export function bigrams(text: string): Set<string> {
  const s = normalizeContent(text);
  const set = new Set<string>();
  if (s.length === 0) return set;
  if (s.length === 1) {
    set.add(s);
    return set;
  }
  for (let i = 0; i < s.length - 1; i++) {
    set.add(s.slice(i, i + 2));
  }
  return set;
}

/** Jaccard 相似度，0~1 */
export function jaccardSimilarity(a: string, b: string): number {
  const sa = bigrams(a);
  const sb = bigrams(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const g of sa) {
    if (sb.has(g)) inter++;
  }
  return inter / (sa.size + sb.size - inter);
}

/** 默认判重阈值：> 0.55 视为语义雷同（实测同义改写一般 0.2~0.45，模板套用 0.6+） */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.55;

export interface SimilarityHit {
  similar: boolean;
  maxScore: number;
  matchedContent?: string;
}

/** 在一批历史内容中查找与 target 最相似的一条 */
export function findSimilarContent(
  target: string,
  history: string[],
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): SimilarityHit {
  let maxScore = 0;
  let matched: string | undefined;
  for (const h of history) {
    const score = jaccardSimilarity(target, h);
    if (score > maxScore) {
      maxScore = score;
      matched = h;
    }
  }
  return {
    similar: maxScore >= threshold,
    maxScore: Math.round(maxScore * 1000) / 1000,
    matchedContent: matched,
  };
}
