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
    totalComments: 1234, highIntent: 89, replies: 56, dms: 34, converted: 12, conversionRate: "1.0%",
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
    totalComments: 5678, highIntent: 345, replies: 234, dms: 156, converted: 56, conversionRate: "1.0%",
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
    totalComments: 18234, highIntent: 1234, replies: 890, dms: 567, converted: 234, conversionRate: "1.3%",
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
  const maxComments = Math.max(...data.trend.map((d) => d.comments));

  const stats = [
    { label: "总评论", value: data.totalComments, color: "text-gray-900", icon: "💬" },
    { label: "高意向", value: data.highIntent, color: "text-red-600", icon: "🔥" },
    { label: "已回复", value: data.replies, color: "text-blue-600", icon: "↩️" },
    { label: "已私信", value: data.dms, color: "text-purple-600", icon: "📩" },
    { label: "转化率", value: data.conversionRate, sub: `已获客 ${data.converted} 人`, color: "text-green-600", icon: "📈" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">数据报表</h1>
          <p className="mt-1 text-sm text-gray-500">分析获客效果，优化转化策略</p>
        </div>

        {/* Time Filter */}
        <div className="flex gap-2 mb-8">
          {timeRanges.map((range) => (
            <Button key={range.id} variant={timeRange === range.id ? "primary" : "ghost"} size="sm" onClick={() => setTimeRange(range.id)}>{range.name}</Button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-lg">{stat.icon}</span>
                <span className="text-sm text-gray-500">{stat.label}</span>
              </div>
              <div className={`mt-2 text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              {stat.sub && <div className="mt-1 text-xs text-gray-400">{stat.sub}</div>}
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Trend Chart */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader title="趋势分析" />
              <CardBody>
                <div className="space-y-5">
                  {data.trend.map((item) => (
                    <div key={item.date}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">{item.date}</span>
                        <div className="flex gap-3 text-xs text-gray-500">
                          <span>{item.comments} 评论</span>
                          <span className="text-red-500">{item.highIntent} 高意向</span>
                          <span className="text-green-500">{item.converted} 转化</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5">
                        <div className="bg-gradient-to-r from-blue-500 to-purple-500 h-2.5 rounded-full transition-all" style={{ width: `${(item.comments / maxComments) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Side Cards */}
          <div className="space-y-8">
            {/* Top Videos */}
            <Card>
              <CardHeader title="热门视频排行" />
              <CardBody>
                <div className="space-y-3">
                  {data.topVideos.map((video, idx) => (
                    <div key={video.title} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <span className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{video.title}</div>
                        <div className="text-xs text-gray-500">{video.comments} 评论 · {video.highIntent} 高意向 · {video.converted} 转化</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>

            {/* Top Keywords */}
            <Card>
              <CardHeader title="热门意向关键词" />
              <CardBody>
                <div className="space-y-3">
                  {data.topKeywords.map((kw, idx) => (
                    <div key={kw.word} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-full bg-gradient-to-br from-red-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold">{idx + 1}</span>
                        <span className="text-sm font-medium text-gray-900">{kw.word}</span>
                      </div>
                      <Badge variant={idx < 2 ? "danger" : idx < 4 ? "warning" : "info"}>{kw.count} 次</Badge>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
