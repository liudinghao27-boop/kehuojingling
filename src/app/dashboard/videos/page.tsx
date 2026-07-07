"use client";

import { Navbar } from "@/components/layout/Navbar";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useState } from "react";
import Link from "next/link";

const platforms = [
  { id: "DOUYIN", name: "抖音", icon: "🎵" },
  { id: "KUAISHOU", name: "快手", icon: "📱" },
  { id: "SHIPINHAO", name: "视频号", icon: "💬" },
];

const mockVideos = [
  {
    id: "1",
    title: "花艺教程：玫瑰包装技巧",
    platform: "DOUYIN",
    url: "https://v.douyin.com/xxxxx",
    author: "花艺师小王",
    status: "MONITORING",
    comments: 234,
    highIntent: 12,
    createdAt: "2024-01-15",
  },
  {
    id: "2",
    title: "新手开店：花店选址攻略",
    platform: "DOUYIN",
    url: "https://v.douyin.com/yyyyy",
    author: "创业导师李",
    status: "MONITORING",
    comments: 156,
    highIntent: 8,
    createdAt: "2024-01-14",
  },
  {
    id: "3",
    title: "情人节花束推荐",
    platform: "KUAISHOU",
    url: "https://v.kuaishou.com/zzzzz",
    author: "浪漫花艺",
    status: "PAUSED",
    comments: 89,
    highIntent: 3,
    createdAt: "2024-01-10",
  },
];

export default function VideosPage() {
  const { addToast } = useToast();
  const [videos, setVideos] = useState(mockVideos);
  const [newUrl, setNewUrl] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState("DOUYIN");

  const handleAddVideo = () => {
    if (!newUrl.trim()) {
      addToast("请输入视频链接", "error");
      return;
    }
    const platform = platforms.find((p) => p.id === selectedPlatform);
    const newVideo = {
      id: String(videos.length + 1),
      title: "新添加的视频",
      platform: selectedPlatform,
      url: newUrl,
      author: "未知作者",
      status: "MONITORING" as const,
      comments: 0,
      highIntent: 0,
      createdAt: new Date().toISOString().split("T")[0],
    };
    setVideos([newVideo, ...videos]);
    setNewUrl("");
    addToast("视频添加成功，开始监控", "success");
  };

  const toggleStatus = (id: string) => {
    setVideos(
      videos.map((v) =>
        v.id === id
          ? { ...v, status: v.status === "MONITORING" ? "PAUSED" : "MONITORING" }
          : v
      )
    );
    addToast("状态已更新", "success");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "MONITORING":
        return <Badge variant="success">监控中</Badge>;
      case "PAUSED":
        return <Badge variant="warning">已暂停</Badge>;
      case "ERROR":
        return <Badge variant="danger">异常</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">视频监控</h1>
          <p className="mt-1 text-sm text-gray-500">
            添加社交媒体视频链接，自动监控评论区
          </p>
        </div>

        {/* 添加视频 */}
        <Card className="mb-8">
          <CardHeader title="添加新视频" />
          <CardBody>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  视频链接
                </label>
                <Input
                  placeholder="粘贴抖音/快手/视频号链接"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  平台
                </label>
                <select
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  value={selectedPlatform}
                  onChange={(e) => setSelectedPlatform(e.target.value)}
                >
                  {platforms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.icon} {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={handleAddVideo}>添加监控</Button>
            </div>
          </CardBody>
        </Card>

        {/* 视频列表 */}
        <Card>
          <CardHeader
            title={`监控中的视频 (${videos.length})`}
            action={
              <Button variant="ghost" size="sm" onClick={() => addToast("刷新成功", "success")}>
                刷新
              </Button>
            }
          />
          <CardBody>
            <div className="space-y-4">
              {videos.map((video) => {
                const platform = platforms.find((p) => p.id === video.platform);
                return (
                  <div
                    key={video.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{platform?.icon}</span>
                        <span className="font-medium text-gray-900">
                          {video.title}
                        </span>
                        {getStatusBadge(video.status)}
                      </div>
                      <div className="mt-1 text-sm text-gray-500">
                        作者: {video.author} · 评论: {video.comments} · 高意向: {video.highIntent}
                      </div>
                      <div className="mt-1 text-xs text-gray-400">
                        {video.url}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/dashboard/comments?videoId=${video.id}`}>
                        <Button size="sm">查看评论</Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleStatus(video.id)}
                      >
                        {video.status === "MONITORING" ? "暂停" : "恢复"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      </main>
    </div>
  );
}
