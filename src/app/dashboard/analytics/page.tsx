"use client";

import { Navbar } from "@/components/layout/Navbar";
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
    { label: "总评论", value: data.totalComments },
    { label: "高意向", value: data.highIntent },
    { label: "已回复", value: data.replies },
    { label: "已私信", value: data.dms },
    { label: "转化率", value: data.conversionRate, sub: `已获客 ${data.converted} 人` },
  ];

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
            <button
              key={range.id}
              onClick={() => setTimeRange(range.id)}
              className={`px-5 py-2.5 text-sm font-medium rounded-full transition-all active:scale-95 ${
                timeRange === range.id
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {range.name}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-gray-50 rounded-3xl p-6">
              <div className="text-sm text-gray-400">{stat.label}</div>
              <div className="mt-2 text-2xl font-semibold text-gray-900">{stat.value}</div>
              {stat.sub && <div className="mt-1 text-xs text-gray-400">{stat.sub}</div>}
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Trend Chart */}
          <div className="lg:col-span-2">
            <div className="bg-gray-50 rounded-3xl p-8">
              <h2 className="text-lg font-medium text-gray-900 mb-6">趋势分析</h2>
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
                        className="bg-gray-900 h-2 rounded-full transition-all"
                        style={{ width: `${(item.comments / maxComments) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Side Cards */}
          <div className="space-y-8">
            {/* Top Videos */}
            <div className="bg-gray-50 rounded-3xl p-8">
              <h2 className="text-lg font-medium text-gray-900 mb-6">热门视频排行</h2>
              <div className="space-y-3">
                {data.topVideos.map((video, idx) => (
                  <div key={video.title} className="flex items-center gap-3 p-4 bg-white rounded-2xl">
                    <span className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs font-bold">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{video.title}</div>
                      <div className="text-xs text-gray-400">{video.comments} 评论 · {video.highIntent} 高意向 · {video.converted} 转化</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Keywords */}
            <div className="bg-gray-50 rounded-3xl p-8">
              <h2 className="text-lg font-medium text-gray-900 mb-6">热门意向关键词</h2>
              <div className="space-y-3">
                {data.topKeywords.map((kw, idx) => (
                  <div key={kw.word} className="flex items-center justify-between p-4 bg-white rounded-2xl">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs font-bold">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{kw.word}</span>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      idx < 2 ? "bg-red-50 text-red-700" : idx < 4 ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
                    }`}>
                      {kw.count} 次
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
