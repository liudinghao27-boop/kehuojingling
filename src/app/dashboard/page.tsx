"use client";

import { useSession } from "next-auth/react";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import Link from "next/link";

const stats = [
  { label: "监控视频", value: "5", change: "+2", changeType: "positive", icon: "🎥", color: "blue" },
  { label: "抓取评论", value: "1,234", change: "+156", changeType: "positive", icon: "💬", color: "green" },
  { label: "高意向用户", value: "89", change: "需处理", changeType: "warning", icon: "🔥", color: "red" },
  { label: "今日获客", value: "12", change: "+3", changeType: "positive", icon: "✅", color: "purple" },
];

const colorClasses: Record<string, string> = {
  blue: "bg-blue-100",
  green: "bg-green-100",
  red: "bg-red-100",
  purple: "bg-purple-100",
};

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
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            欢迎回来，{session?.user?.name || "用户"}
          </h1>
          <p className="mt-1 text-sm text-gray-500">今日获客概览</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className={`w-12 h-12 rounded-lg ${colorClasses[stat.color]} flex items-center justify-center text-2xl`}>
                  {stat.icon}
                </div>
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    stat.changeType === "positive"
                      ? "bg-green-100 text-green-700"
                      : stat.changeType === "warning"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {stat.change}
                </span>
              </div>
              <div className="mt-4">
                <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Videos & Users */}
          <div className="lg:col-span-2 space-y-8">
            {/* Recent Videos */}
            <Card>
              <CardHeader
                title="最近监控的视频"
                action={
                  <Link href="/dashboard/videos">
                    <Button variant="ghost" size="sm">查看全部</Button>
                  </Link>
                }
              />
              <CardBody>
                <div className="space-y-4">
                  {recentVideos.map((video) => (
                    <div
                      key={video.id}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🎥</span>
                          <span className="font-medium text-gray-900 truncate">{video.title}</span>
                          <Badge variant="success">监控中</Badge>
                        </div>
                        <div className="mt-1 text-sm text-gray-500">
                          {video.platform} · {video.views}播放 · 评论 {video.comments} · 高意向 {video.highIntent} · 已回复 {video.replied} · 已私信 {video.dmSent}
                        </div>
                      </div>
                      <div className="ml-4 flex-shrink-0">
                        <Link href={`/dashboard/comments?videoId=${video.id}`}>
                          <Button size="sm">查看评论</Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>

            {/* High Intent Users */}
            <Card>
              <CardHeader
                title="高意向用户（需立即处理）"
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addToast("已标记所有用户为已处理", "success")}
                  >
                    全部标记
                  </Button>
                }
              />
              <CardBody>
                <div className="space-y-4">
                  {highIntentUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-start justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium">
                            {user.avatar}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">{user.name}</span>
                              <Badge variant={user.score === 5 ? "danger" : "warning"}>
                                {user.score === 5 ? "强意向" : "高意向"} {user.score}分
                              </Badge>
                            </div>
                            <div className="text-sm text-gray-600 mt-1">"{user.comment}"</div>
                            <div className="text-xs text-gray-400 mt-1">{user.time}</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          size="sm"
                          onClick={() => addToast(`已回复 ${user.name}`, "success")}
                        >
                          快速回复
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
              </CardBody>
            </Card>
          </div>

          {/* Right Column - Funnel & Quick Actions */}
          <div className="space-y-8">
            {/* Conversion Funnel */}
            <Card>
              <CardHeader title="转化漏斗" />
              <CardBody>
                <div className="space-y-4">
                  {[
                    { label: "评论", value: 1234, percent: "100%", color: "bg-blue-500" },
                    { label: "高意向", value: 89, percent: "7.2%", color: "bg-yellow-500" },
                    { label: "已回复", value: 56, percent: "4.5%", color: "bg-purple-500" },
                    { label: "已私信", value: 34, percent: "2.8%", color: "bg-pink-500" },
                    { label: "加微信", value: 12, percent: "1.0%", color: "bg-green-500" },
                  ].map((step, idx, arr) => (
                    <div key={step.label}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">{step.label}</span>
                        <span className="text-sm text-gray-500">{step.value} ({step.percent})</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                          className={`${step.color} h-2.5 rounded-full transition-all`}
                          style={{ width: `${(step.value / arr[0].value) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader title="快捷操作" />
              <CardBody>
                <div className="space-y-3">
                  <Link href="/dashboard/videos" className="block w-full">
                    <Button className="w-full justify-start" variant="secondary">
                      <span className="mr-2">🎥</span> 添加监控视频
                    </Button>
                  </Link>
                  <Link href="/dashboard/templates" className="block w-full">
                    <Button className="w-full justify-start" variant="secondary">
                      <span className="mr-2">📝</span> 管理话术模板
                    </Button>
                  </Link>
                  <Link href="/dashboard/analytics" className="block w-full">
                    <Button className="w-full justify-start" variant="secondary">
                      <span className="mr-2">📊</span> 查看数据报表
                    </Button>
                  </Link>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
