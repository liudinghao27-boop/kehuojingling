"use client";

import { Navbar } from "@/components/layout/Navbar";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useState } from "react";

const timeRanges = [
  { id: "7d", name: "近7天" },
  { id: "30d", name: "近30天" },
  { id: "90d", name: "近90天" },
];

const mockData = {
  "7d": {
    totalComments: 1234,
    highIntent: 89,
    replies: 56,
    dms: 34,
    converted: 12,
    conversionRate: "1.0%",
    trend: [
      { date: "01-09", comments: 120, highIntent: 8, converted: 1 },
      { date: "01-10", comments: 156, highIntent: 12, converted: 2 },
      { date: "01-11", comments: 189, highIntent: 15, converted: 2 },
      { date: "01-12", comments: 234, highIntent: 18, converted: 3 },
      { date: "01-13", comments: 198, highIntent: 14, converted: 2 },
      { date: "01-14", comments: 167, highIntent: 11, converted: 1 },
      { date: "01-15", comments: 170, highIntent: 11, converted: 1 },
    ],
    topVideos: [
      { title: "花艺教程：玫瑰包装技巧", comments: 234, highIntent: 12, converted: 3 },
      { title: "新手开店：花店选址攻略", comments: 156, highIntent: 8, converted: 2 },
      { title: "情人节花束推荐", comments: 89, highIntent: 3, converted: 1 },
    ],
    topKeywords: [
      { word: "多少钱", count: 45 },
      { word: "怎么联系", count: 32 },
      { word: "哪里买", count: 28 },
      { word: "想学", count: 21 },
      { word: "批发", count: 18 },
    ],
  },
  "30d": {
    totalComments: 5678,
    highIntent: 345,
    replies: 234,
    dms: 156,
    converted: 56,
    conversionRate: "1.0%",
    trend: [
      { date: "第1周", comments: 890, highIntent: 52, converted: 8 },
      { date: "第2周", comments: 1120, highIntent: 68, converted: 12 },
      { date: "第3周", comments: 1340, highIntent: 89, converted: 15 },
      { date: "第4周", comments: 1234, highIntent: 89, converted: 12 },
    ],
    topVideos: [
      { title: "花艺教程：玫瑰包装技巧", comments: 890, highIntent: 45, converted: 12 },
      { title: "新手开店：花店选址攻略", comments: 567, highIntent: 32, converted: 8 },
      { title: "情人节花束推荐", comments: 456, highIntent: 21, converted: 5 },
    ],
    topKeywords: [
      { word: "多少钱", count: 180 },
      { word: "怎么联系", count: 145 },
      { word: "哪里买", count: 120 },
      { word: "想学", count: 98 },
      { word: "批发", count: 76 },
    ],
  },
  "90d": {
    totalComments: 18234,
    highIntent: 1234,
    replies: 890,
    dms: 567,
    converted: 234,
    conversionRate: "1.3%",
    trend: [
      { date: "第1月", comments: 4560, highIntent: 280, converted: 45 },
      { date: "第2月", comments: 5670, highIntent: 345, converted: 67 },
      { date: "第3月", comments: 6780, highIntent: 456, converted: 89 },
    ],
    topVideos: [
      { title: "花艺教程：玫瑰包装技巧", comments: 3456, highIntent: 180, converted: 45 },
      { title: "新手开店：花店选址攻略", comments: 2345, highIntent: 120, converted: 32 },
      { title: "情人节花束推荐", comments: 1890, highIntent: 98, converted: 21 },
    ],
    topKeywords: [
      { word: "多少钱", count: 567 },
      { word: "怎么联系", count: 456 },
      { word: "哪里买", count: 389 },
      { word: "想学", count: 312 },
      { word: "批发", count: 234 },
    ],
  },
};

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState("7d");
  const data = mockData[timeRange as keyof typeof mockData];

  // 简单的柱状图渲染
  const maxComments = Math.max(...data.trend.map((d) => d.comments));

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">数据报表</h1>
          <p className="mt-1 text-sm text-gray-500">
            分析获客效果，优化转化策略
          </p>
        </div>

        {/* 时间筛选 */}
        <div className="flex gap-2 mb-8">
          {timeRanges.map((range) => (
            <Button
              key={range.id}
              variant={timeRange === range.id ? "primary" : "ghost"}
              size="sm"
              onClick={() => setTimeRange(range.id)}
            >
              {range.name}
            </Button>
          ))}
        </div>

        {/* 核心指标 */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <Card>
            <div className="text-sm font-medium text-gray-600">总评论</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{data.totalComments}</div>
          </Card>
          <Card>
            <div className="text-sm font-medium text-gray-600">高意向</div>
            <div className="mt-2 text-3xl font-bold text-red-600">{data.highIntent}</div>
          </Card>
          <Card>
            <div className="text-sm font-medium text-gray-600">已回复</div>
            <div className="mt-2 text-3xl font-bold text-blue-600">{data.replies}</div>
          </Card>
          <Card>
            <div className="text-sm font-medium text-gray-600">已私信</div>
            <div className="mt-2 text-3xl font-bold text-purple-600">{data.dms}</div>
          </Card>
          <Card>
            <div className="text-sm font-medium text-gray-600">转化率</div>
            <div className="mt-2 text-3xl font-bold text-green-600">{data.conversionRate}</div>
            <div className="mt-1 text-xs text-gray-500">已获客 {data.converted} 人</div>
          </Card>
        </div>

        {/* 趋势图 */}
        <Card className="mb-8">
          <CardHeader title="趋势分析" />
          <CardBody>
            <div className="space-y-6">
              {data.trend.map((item) => (
                <div key={item.date}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">{item.date}</span>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>评论: {item.comments}</span>
                      <span className="text-red-500">高意向: {item.highIntent}</span>
                      <span className="text-green-500">转化: {item.converted}</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4">
                    <div
                      className="bg-blue-500 h-4 rounded-full transition-all"
                      style={{ width: `${(item.comments / maxComments) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 热门视频 */}
          <Card>
            <CardHeader title="热门视频排行" />
            <CardBody>
              <div className="space-y-4">
                {data.topVideos.map((video, idx) => (
                  <div
                    key={video.title}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-medium text-sm text-gray-900">{video.title}</div>
                        <div className="text-xs text-gray-500">
                          评论 {video.comments} · 高意向 {video.highIntent} · 转化 {video.converted}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* 热门关键词 */}
          <Card>
            <CardHeader title="热门意向关键词" />
            <CardBody>
              <div className="space-y-4">
                {data.topKeywords.map((kw, idx) => (
                  <div
                    key={kw.word}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-sm font-bold">
                        {idx + 1}
                      </span>
                      <span className="font-medium text-sm text-gray-900">{kw.word}</span>
                    </div>
                    <Badge variant={idx < 2 ? "danger" : idx < 4 ? "warning" : "info"}>
                      {kw.count} 次
                    </Badge>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </main>
    </div>
  );
}
