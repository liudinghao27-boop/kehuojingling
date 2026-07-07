"use client";

import { useSession } from "next-auth/react";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import Link from "next/link";

// 模拟数据
const stats = {
  totalVideos: 5,
  totalComments: 1234,
  highIntent: 89,
  converted: 12,
};

const recentVideos = [
  {
    id: "1",
    title: "花艺教程：玫瑰包装技巧",
    platform: "抖音",
    views: "1.2万",
    status: "MONITORING",
    comments: 234,
    highIntent: 12,
    replied: 8,
    dmSent: 3,
  },
  {
    id: "2",
    title: "新手开店：花店选址攻略",
    platform: "抖音",
    views: "8,500",
    status: "MONITORING",
    comments: 156,
    highIntent: 8,
    replied: 5,
    dmSent: 2,
  },
];

const highIntentUsers = [
  { id: "1", name: "用户A", comment: "多少钱？能便宜吗？", score: 5, time: "2分钟前" },
  { id: "2", name: "用户B", comment: "怎么联系你？想学花艺", score: 4, time: "5分钟前" },
  { id: "3", name: "用户C", comment: "在哪里可以买到？", score: 4, time: "10分钟前" },
];

export default function DashboardPage() {
  const { data: session } = useSession();
  const { addToast } = useToast();

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 欢迎语 */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            欢迎回来，{session?.user?.name || "用户"}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            今日获客概览
          </p>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <div className="text-sm font-medium text-gray-600">监控视频</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{stats.totalVideos}</div>
            <div className="mt-1 text-xs text-green-600">↑ 2 个新增</div>
          </Card>
          <Card>
            <div className="text-sm font-medium text-gray-600">抓取评论</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{stats.totalComments}</div>
            <div className="mt-1 text-xs text-green-600">↑ 156 条新增</div>
          </Card>
          <Card>
            <div className="text-sm font-medium text-gray-600">高意向用户</div>
            <div className="mt-2 text-3xl font-bold text-red-600">{stats.highIntent}</div>
            <div className="mt-1 text-xs text-red-600">🔥 需立即处理</div>
          </Card>
          <Card>
            <div className="text-sm font-medium text-gray-600">今日获客</div>
            <div className="mt-2 text-3xl font-bold text-green-600">{stats.converted}</div>
            <div className="mt-1 text-xs text-green-600">↑ 3 个新增</div>
          </Card>
        </div>

        {/* 最近监控的视频 */}
        <Card className="mb-8">
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
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📹</span>
                      <span className="font-medium text-gray-900">{video.title}</span>
                      <Badge variant="success">监控中</Badge>
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                      {video.platform} · {video.views}播放 · 评论: {video.comments} | 高意向: {video.highIntent} | 已回复: {video.replied} | 已私信: {video.dmSent}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/dashboard/comments?videoId=${video.id}`}>
                      <Button size="sm">查看评论</Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* 高意向用户 */}
        <Card className="mb-8">
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
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">👤</span>
                      <span className="font-medium text-gray-900">{user.name}</span>
                      <Badge variant={`intent-${user.score}` as any}>
                        {user.score === 5 ? "强意向" : "高意向"} ({user.score}分)
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      "{user.comment}"
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      {user.time}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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

        {/* 转化漏斗 */}
        <Card>
          <CardHeader title="转化漏斗" />
          <CardBody>
            <div className="flex items-center justify-between py-4">
              {[
                { label: "评论", value: 1234, percent: "100%" },
                { label: "高意向", value: 89, percent: "7.2%" },
                { label: "已回复", value: 56, percent: "4.5%" },
                { label: "已私信", value: 34, percent: "2.8%" },
                { label: "加微信", value: 12, percent: "1.0%" },
              ].map((step, idx, arr) => (
                <div key={step.label} className="flex items-center">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                      {step.value}
                    </div>
                    <div className="mt-2 text-sm font-medium text-gray-700">{step.label}</div>
                    <div className="text-xs text-gray-500">{step.percent}</div>
                  </div>
                  {idx < arr.length - 1 && (
                    <div className="mx-4 text-gray-300">→</div>
                  )}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </main>
    </div>
  );
}
