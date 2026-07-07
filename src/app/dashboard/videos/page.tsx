"use client";

import { Navbar } from "@/components/layout/Navbar";
import { useToast } from "@/components/ui/Toast";
import { useState } from "react";
import Link from "next/link";

const platforms = [
  { id: "DOUYIN", name: "抖音", abbr: "抖" },
  { id: "KUAISHOU", name: "快手", abbr: "快" },
  { id: "SHIPINHAO", name: "视频号", abbr: "视" },
];

const mockVideos = [
  { id: "1", title: "花艺教程：玫瑰包装技巧", platform: "DOUYIN", url: "https://v.douyin.com/xxxxx", author: "花艺师小王", status: "MONITORING", comments: 234, highIntent: 12, createdAt: "2024-01-15" },
  { id: "2", title: "新手开店：花店选址攻略", platform: "DOUYIN", url: "https://v.douyin.com/yyyyy", author: "创业导师李", status: "MONITORING", comments: 156, highIntent: 8, createdAt: "2024-01-14" },
  { id: "3", title: "情人节花束推荐", platform: "KUAISHOU", url: "https://v.kuaishou.com/zzzzz", author: "浪漫花艺", status: "PAUSED", comments: 89, highIntent: 3, createdAt: "2024-01-10" },
];

export default function VideosPage() {
  const { addToast } = useToast();
  const [videos, setVideos] = useState(mockVideos);
  const [newUrl, setNewUrl] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState("DOUYIN");

  const handleAddVideo = () => {
    if (!newUrl.trim()) { addToast("请输入视频链接", "error"); return; }
    const newVideo = { id: String(videos.length + 1), title: "新添加的视频", platform: selectedPlatform, url: newUrl, author: "未知作者", status: "MONITORING" as const, comments: 0, highIntent: 0, createdAt: new Date().toISOString().split("T")[0] };
    setVideos([newVideo, ...videos]);
    setNewUrl("");
    addToast("视频添加成功，开始监控", "success");
  };

  const toggleStatus = (id: string) => {
    setVideos(videos.map((v) => v.id === id ? { ...v, status: v.status === "MONITORING" ? "PAUSED" : "MONITORING" } : v));
    addToast("状态已更新", "success");
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "MONITORING": return "bg-green-50 text-green-700";
      case "PAUSED": return "bg-amber-50 text-amber-700";
      case "ERROR": return "bg-red-50 text-red-700";
      default: return "bg-gray-50 text-gray-600";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "MONITORING": return "监控中";
      case "PAUSED": return "已暂停";
      case "ERROR": return "异常";
      default: return status;
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 lg:px-8 pt-24 pb-32">
        <div className="mb-16">
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">视频监控</h1>
          <p className="mt-2 text-base text-gray-400">添加社交媒体视频链接，自动监控评论区</p>
        </div>

        {/* Add Video */}
        <div className="bg-gray-50 rounded-3xl p-8 mb-10">
          <h2 className="text-lg font-medium text-gray-900 mb-6">添加新视频</h2>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-gray-500 mb-2">视频链接</label>
              <input
                type="text"
                placeholder="粘贴抖音 / 快手 / 视频号链接"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="block w-full rounded-2xl bg-white border-0 px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-gray-200 transition-all"
              />
            </div>
            <div className="w-full sm:w-44">
              <label className="block text-sm font-medium text-gray-500 mb-2">平台</label>
              <select
                className="block w-full rounded-2xl bg-white border-0 px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-gray-200 transition-all"
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value)}
              >
                {platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <button
              onClick={handleAddVideo}
              className="w-full sm:w-auto px-7 py-3 text-sm font-medium text-white bg-gray-900 rounded-full hover:bg-gray-800 active:scale-95 transition-all"
            >
              添加监控
            </button>
          </div>
        </div>

        {/* Video List */}
        <div className="bg-gray-50 rounded-3xl p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-gray-900">监控中的视频</h2>
            <span className="text-sm text-gray-400">{videos.length} 个</span>
          </div>
          <div className="space-y-3">
            {videos.map((video) => {
              const platform = platforms.find((p) => p.id === video.platform);
              return (
                <div
                  key={video.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-white rounded-2xl hover:shadow-[0_4px_24px_rgba(0,0,0,0.06)] transition-all gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs font-medium">
                        {platform?.abbr}
                      </span>
                      <span className="font-medium text-gray-900 truncate">{video.title}</span>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusStyle(video.status)}`}>
                        {getStatusLabel(video.status)}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-gray-400">
                      {video.author} · {video.comments} 条评论 · {video.highIntent} 高意向
                    </div>
                    <div className="mt-1 text-xs text-gray-300 truncate">{video.url}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link href={`/dashboard/comments?videoId=${video.id}`}>
                      <button className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-full hover:bg-gray-800 active:scale-95 transition-all">
                        查看评论
                      </button>
                    </Link>
                    <button
                      onClick={() => toggleStatus(video.id)}
                      className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 active:scale-95 transition-all"
                    >
                      {video.status === "MONITORING" ? "暂停" : "恢复"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
