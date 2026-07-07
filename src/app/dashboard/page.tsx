"use client";

import { useSession } from "next-auth/react";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import Link from "next/link";

const stats = [
  { label: "监控视频", value: "5", change: "+2", icon: "🎥" },
  { label: "抓取评论", value: "1,234", change: "+156", icon: "💬" },
  { label: "高意向用户", value: "89", change: "需处理", icon: "🔥" },
  { label: "今日获客", value: "12", change: "+3", icon: "✅" },
];

const recentVideos = [
  { id: "1", title: "花艺教程：玫瑰包装技巧", platform: "抖音", views: "1.2万", status: "MONITORING", comments: 234, highIntent: 12, replied: 8, dmSent: 3 },
  { id: "2", title: "新手开店：花店选址攻略", platform: "抖音", views: "8,500", status: "MONITORING", comments: 156, highIntent: 8, replied: 5, dmSent: 2 },
];

const highIntentUsers = [
  { id: "1", name: "用户A", comment: "多少钱？能便宜吗？", score: 5, time: "2分钟前", avatar: "A" },
  { id: "2", name: "用户B", comment: "怎么联系你？想学花艺", score: 4, time: "5分钟前", avatar: "B" },
  { id: "3", name: "用户C", comment: "在哪里可以买到？", score: 4, time: "10分钟前", avatar: "C" },
];

export default function DashboardPage() {
  const { data: session } = useSession();
  const { addToast } = useToast();

  return (
    <div className="min-h-screen bg-white font-sans">
      <Navbar />

      <main className="max-w-5xl mx-auto px-6 py-8 pt-24">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            欢迎回来，{session?.user?.name || "用户"}
          </h1>
          <p className="mt-2 text-lg text-gray-400">今日获客概览</p>
        </div>

        {/* Stats Grid - Apple Style */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="bg-gray-50 rounded-3xl p-6 hover:bg-gray-100 transition-colors"
            >
              <div className="text-2xl mb-3">{stat.icon}</div>
              <div className="text-3xl font-bold text-gray-900 tracking-tight">{stat.value}</div>
              <div className="text-sm text-gray-400 mt-1">{stat.label}</div>
              <div className="text-xs text-gray-400 mt-2 font-medium">{stat.change}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Videos & Users */}
          <div className="lg:col-span-2 space-y-8">
            {/* Recent Videos */}
            <div className="bg-gray-50 rounded-3xl p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">最近监控的视频</h2>
                <Link href="/dashboard/videos" className="text-sm text-gray-400 hover:text-gray-900 transition-colors">
                  查看全部
                </Link>
              </div>
              <div className="space-y-4">
                {recentVideos.map((video) => (
                  <div
                    key={video.id}
                    className="flex items-center justify-between p-4 bg-white rounded-2xl hover:shadow-sm transition-shadow"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">🎥</span>
                        <span className="font-medium text-gray-900 truncate">{video.title}</span>
                        <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">监控中</span>
                      </div>
                      <div className="mt-2 text-sm text-gray-400">
                        {video.platform} · {video.views}播放 · 评论 {video.comments} · 高意向 {video.highIntent}
                      </div>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      <Link href={`/dashboard/comments?videoId=${video.id}`}>
                        <Button size="sm">查看</Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* High Intent Users */}
            <div className="bg-gray-50 rounded-3xl p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">高意向用户</h2>
                <button
                  className="text-sm text-gray-400 hover:text-gray-900 transition-colors"
                  onClick={() => addToast("已标记所有用户为已处理", "success")}
                >
                  全部标记
                </button>
              </div>
              <div className="space-y-4">
                {highIntentUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-start justify-between p-4 bg-white rounded-2xl"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-white text-sm font-medium">
                          {user.avatar}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{user.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${user.score === 5 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {user.score === 5 ? "强意向" : "高意向"} {user.score}分
                            </span>
                          </div>
                          <div className="text-sm text-gray-500 mt-1">&ldquo;{user.comment}&rdquo;</div>
                          <div className="text-xs text-gray-400 mt-1">{user.time}</div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        size="sm"
                        onClick={() => addToast(`已回复 ${user.name}`, "success")}
                      >
                        回复
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => addToast(`已忽略 ${user.name}`, "info")}
                      >
                        忽略
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Funnel & Quick Actions */}
          <div className="space-y-8">
            {/* Conversion Funnel */}
            <div className="bg-gray-50 rounded-3xl p-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">转化漏斗</h2>
              <div className="space-y-5">
                {[
                  { label: "评论", value: 1234, percent: "100%", color: "bg-gray-900" },
                  { label: "高意向", value: 89, percent: "7.2%", color: "bg-gray-600" },
                  { label: "已回复", value: 56, percent: "4.5%", color: "bg-gray-500" },
                  { label: "已私信", value: 34, percent: "2.8%", color: "bg-gray-400" },
                  { label: "加微信", value: 12, percent: "1.0%", color: "bg-gray-300" },
                ].map((step, idx, arr) => (
                  <div key={step.label}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">{step.label}</span>
                      <span className="text-sm text-gray-400">{step.value}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`${step.color} h-2 rounded-full transition-all`}
                        style={{ width: `${(step.value / arr[0].value) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-gray-50 rounded-3xl p-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">快捷操作</h2>
              <div className="space-y-3">
                <Link href="/dashboard/videos" className="block">
                  <Button className="w-full justify-start bg-white hover:bg-gray-100" variant="secondary">
                    <span className="mr-3">🎥</span> 添加监控视频
                  </Button>
                </Link>
                <Link href="/dashboard/templates" className="block">
                  <Button className="w-full justify-start bg-white hover:bg-gray-100" variant="secondary">
                    <span className="mr-3">📝</span> 管理话术模板
                  </Button>
                </Link>
                <Link href="/dashboard/analytics" className="block">
                  <Button className="w-full justify-start bg-white hover:bg-gray-100" variant="secondary">
                    <span className="mr-3">📊</span> 查看数据报表
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
