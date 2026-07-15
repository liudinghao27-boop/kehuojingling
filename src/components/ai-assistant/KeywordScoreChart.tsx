"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface ScoredKeyword {
  keyword: string;
  searchVolume: number;
  competition: number;
  businessIntent: number;
  score: number;
  source?: string;
  confidence?: number;
}

interface KeywordScoreChartProps {
  keywords: ScoredKeyword[];
  maxItems?: number;
  source?: string;
}

const sourceLabels: Record<string, string> = {
  ai: "AI 估算",
  baidu: "百度指数",
  douyin: "抖音热点宝",
  mock: "模拟数据",
  mixed: "混合数据",
};

export function KeywordScoreChart({ keywords, maxItems = 10, source }: KeywordScoreChartProps) {
  const data = keywords
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map((item) => ({
      name: item.keyword.length > 8 ? `${item.keyword.slice(0, 8)}...` : item.keyword,
      fullName: item.keyword,
      score: item.score,
    }));

  if (data.length === 0) return null;

  const detectedSource = source ?? keywords.find((k) => k.source)?.source ?? "ai";
  const sourceLabel = sourceLabels[detectedSource] ?? detectedSource;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>数据来源：{sourceLabel}</span>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={0} height={40} />
            <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              formatter={(value, _name, props) => {
                const payload = props?.payload as { fullName?: string } | undefined;
                return [value, payload?.fullName ?? ""];
              }}
              contentStyle={{ borderRadius: 12, fontSize: 12 }}
            />
            <Bar dataKey="score" radius={[4, 4, 0, 0]}>
              {data.map((_, idx) => (
                <Cell key={`cell-${idx}`} fill={idx < 3 ? "#111827" : "#9CA3AF"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
