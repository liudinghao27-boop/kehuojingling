"use client";

import { Navbar } from "@/components/layout/Navbar";
import { useToast } from "@/components/ui/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const timeRanges = [
  { id: "7d", name: "近7天" },
  { id: "30d", name: "近30天" },
  { id: "90d", name: "近90天" },
];

interface TrendItem {
  date: string;
  comments: number;
  highIntent: number;
  converted: number;
}

interface TopVideo {
  title: string;
  comments: number;
  highIntent: number;
  converted: number;
}

interface TopKeyword {
  word: string;
  count: number;
}

interface AnalyticsData {
  totalComments: number;
  highIntent: number;
  replies: number;
  dms: number;
  converted: number;
  conversionRate: string;
  trend: TrendItem[];
  topVideos: TopVideo[];
  topKeywords: TopKeyword[];
}

const keywordRankVariants: ("destructive" | "default" | "secondary" | "outline")[] = [
  "destructive",
  "destructive",
  "default",
  "secondary",
  "outline",
];

export default function AnalyticsPage() {
  const { addToast } = useToast();
  const [timeRange, setTimeRange] = useState("7d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    const skeletonTimer = setTimeout(() => {
      if (!ignore) setShowSkeleton(true);
    }, 250);

    fetch(`/api/analytics?range=${timeRange}`)
      .then(async (res) => {
        const result = await res.json();
        if (!res.ok) {
          throw new Error(result.error || "获取分析数据失败");
        }
        if (!ignore) setData(result);
      })
      .catch((error) => {
        console.error("Fetch analytics error:", error);
        if (!ignore) {
          setError(getErrorMessage(error) || "获取分析数据失败");
          addToast(getErrorMessage(error) || "获取分析数据失败", "error");
        }
      })
      .finally(() => {
        if (!ignore) {
          clearTimeout(skeletonTimer);
          setLoading(false);
          setShowSkeleton(false);
        }
      });

    return () => {
      ignore = true;
      clearTimeout(skeletonTimer);
    };
  }, [timeRange, addToast]);

  const stats = data
    ? [
        { label: "总评论", value: data.totalComments },
        { label: "高意向", value: data.highIntent },
        { label: "已回复", value: data.replies },
        { label: "已私信", value: data.dms },
        { label: "转化率", value: data.conversionRate, sub: `已获客 ${data.converted} 人` },
      ]
    : [];

  const maxComments = data ? Math.max(...data.trend.map((d) => d.comments), 1) : 1;

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 lg:px-8 pt-24 pb-32">
        <div className="mb-16">
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">数据报表</h1>
          <p className="mt-2 text-base text-gray-400">分析获客效果，优化转化策略</p>
        </div>

        {/* Time Filter */}
        <div className="flex gap-2 mb-10">
          {timeRanges.map((range) => (
            <Button
              key={range.id}
              onClick={() => {
                if (timeRange === range.id) return;
                setTimeRange(range.id);
                setLoading(true);
                setShowSkeleton(false);
                setError(null);
              }}
              variant={timeRange === range.id ? "default" : "secondary"}
              disabled={loading}
              className="rounded-full px-5 py-2.5 h-auto text-sm"
            >
              {range.name}
            </Button>
          ))}
        </div>

        {error && (
          <div className="mb-10 rounded-2xl bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
          {showSkeleton ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-3xl" />
            ))
          ) : (
            stats.map((stat) => (
              <Card key={stat.label} className="rounded-3xl border-0 shadow-none bg-gray-50">
                <CardContent className="p-6">
                  <div className="text-sm text-gray-400">{stat.label}</div>
                  <div className="mt-2 text-2xl font-semibold text-gray-900">{stat.value}</div>
                  {stat.sub && <div className="mt-1 text-xs text-gray-400">{stat.sub}</div>}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Trend Chart */}
          <div className="lg:col-span-2">
            <Card className="rounded-3xl border-0 shadow-none bg-gray-50">
              <CardHeader className="px-8 pt-8 pb-0">
                <CardTitle className="text-lg font-medium text-gray-900">趋势分析</CardTitle>
              </CardHeader>
              <CardContent className="p-8">
                {showSkeleton ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-12 w-full rounded-xl" />
                    ))}
                  </div>
                ) : data && data.trend.length > 0 ? (
                  <div className="space-y-6">
                    {data.trend.map((item) => (
                      <div key={item.date}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">{item.date}</span>
                          <div className="flex gap-4 text-xs text-gray-400">
                            <span>{item.comments} 评论</span>
                            <span className="text-amber-600">{item.highIntent} 高意向</span>
                            <span className="text-green-600">{item.converted} 转化</span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-gray-900 h-2 rounded-full"
                            style={{ width: `${(item.comments / maxComments) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-sm text-gray-400">暂无趋势数据</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Side Cards */}
          <div className="space-y-8">
            {/* Top Videos */}
            <Card className="rounded-3xl border-0 shadow-none bg-gray-50">
              <CardHeader className="px-8 pt-8 pb-0">
                <CardTitle className="text-lg font-medium text-gray-900">热门视频排行</CardTitle>
              </CardHeader>
              <CardContent className="p-8">
                {showSkeleton ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-2xl" />
                    ))}
                  </div>
                ) : data && data.topVideos.length > 0 ? (
                  <div className="space-y-3">
                    {data.topVideos.map((video, idx) => (
                      <Card key={`${video.title}-${idx}`} className="rounded-2xl border-0 shadow-sm">
                        <CardContent className="p-4 flex items-center gap-3">
                          <span className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs font-bold">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{video.title}</div>
                            <div className="text-xs text-gray-400">{video.comments} 评论 · {video.highIntent} 高意向 · {video.converted} 转化</div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-sm text-gray-400">暂无视频数据</div>
                )}
              </CardContent>
            </Card>

            {/* Top Keywords */}
            <Card className="rounded-3xl border-0 shadow-none bg-gray-50">
              <CardHeader className="px-8 pt-8 pb-0">
                <CardTitle className="text-lg font-medium text-gray-900">热门意向关键词</CardTitle>
              </CardHeader>
              <CardContent className="p-8">
                {showSkeleton ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-12 w-full rounded-2xl" />
                    ))}
                  </div>
                ) : data && data.topKeywords.length > 0 ? (
                  <div className="space-y-3">
                    {data.topKeywords.map((kw, idx) => (
                      <Card key={kw.word} className="rounded-2xl border-0 shadow-sm">
                        <CardContent className="p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs font-bold">
                              {idx + 1}
                            </span>
                            <span className="text-sm font-medium text-gray-900">{kw.word}</span>
                          </div>
                          <Badge variant={keywordRankVariants[idx] || "outline"} className="rounded-full">
                            {kw.count} 次
                          </Badge>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-sm text-gray-400">暂无关键词数据</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
