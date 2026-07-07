"use client";

import { Navbar } from "@/components/layout/Navbar";
import { useToast } from "@/components/ui/Toast";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const mockComments = [
  { id: "1", authorName: "用户A", authorAvatar: "", content: "多少钱？能便宜吗？", intentScore: 5, intentKeywords: ["多少钱", "便宜"], status: "NEW", videoTitle: "花艺教程：玫瑰包装技巧", createdAt: "2分钟前" },
  { id: "2", authorName: "用户B", authorAvatar: "", content: "怎么联系你？想学花艺", intentScore: 4, intentKeywords: ["联系", "学"], status: "ANALYZED", videoTitle: "花艺教程：玫瑰包装技巧", createdAt: "5分钟前" },
  { id: "3", authorName: "用户C", authorAvatar: "", content: "在哪里可以买到？", intentScore: 4, intentKeywords: ["哪里", "买"], status: "REPLIED", videoTitle: "新手开店：花店选址攻略", createdAt: "10分钟前" },
  { id: "4", authorName: "用户D", authorAvatar: "", content: "这个花好漂亮啊", intentScore: 2, intentKeywords: ["漂亮"], status: "NEW", videoTitle: "花艺教程：玫瑰包装技巧", createdAt: "15分钟前" },
  { id: "5", authorName: "用户E", authorAvatar: "", content: "可以批发吗？大量采购", intentScore: 5, intentKeywords: ["批发", "采购"], status: "DM_SENT", videoTitle: "新手开店：花店选址攻略", createdAt: "20分钟前" },
];

function CommentsContent() {
  const { addToast } = useToast();
  const searchParams = useSearchParams();
  const videoId = searchParams.get("videoId");
  const [comments, setComments] = useState(mockComments);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filteredComments = comments.filter((c) => {
    if (filter === "high" && c.intentScore < 4) return false;
    if (filter === "new" && c.status !== "NEW") return false;
    if (search && !c.content.includes(search) && !c.authorName.includes(search)) return false;
    return true;
  });

  const handleReply = (id: string) => { setComments(comments.map((c) => c.id === id ? { ...c, status: "REPLIED" } : c)); addToast("回复已发送", "success"); };
  const handleDM = (id: string) => { setComments(comments.map((c) => c.id === id ? { ...c, status: "DM_SENT" } : c)); addToast("私信已发送", "success"); };

  const getIntentStyle = (score: number) => {
    if (score >= 5) return "bg-red-50 text-red-700";
    if (score >= 4) return "bg-amber-50 text-amber-700";
    if (score >= 3) return "bg-blue-50 text-blue-700";
    return "bg-gray-50 text-gray-500";
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "NEW": return "bg-gray-50 text-gray-600";
      case "ANALYZED": return "bg-blue-50 text-blue-700";
      case "REPLIED": return "bg-green-50 text-green-700";
      case "DM_SENT": return "bg-green-50 text-green-700";
      case "CONVERTED": return "bg-green-50 text-green-700";
      default: return "bg-gray-50 text-gray-600";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "NEW": return "新评论";
      case "ANALYZED": return "已分析";
      case "REPLIED": return "已回复";
      case "DM_SENT": return "已私信";
      case "CONVERTED": return "已转化";
      default: return status;
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 lg:px-8 pt-24 pb-32">
        <div className="mb-16">
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">评论列表</h1>
          <p className="mt-2 text-base text-gray-400">{videoId ? "查看指定视频的评论区" : "所有监控视频的评论区"}</p>
        </div>

        {/* Filter Bar */}
        <div className="bg-gray-50 rounded-3xl p-6 mb-10">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <input
                type="text"
                placeholder="搜索评论内容或用户名"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="block w-full rounded-2xl bg-white border-0 px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-gray-200 transition-all"
              />
            </div>
            <div className="flex gap-2">
              {(["all", "high", "new"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-5 py-2.5 text-sm font-medium rounded-full transition-all active:scale-95 ${
                    filter === f
                      ? "bg-gray-900 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {f === "all" ? "全部" : f === "high" ? "高意向" : "新评论"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Comments List */}
        <div className="bg-gray-50 rounded-3xl p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-gray-900">评论</h2>
            <span className="text-sm text-gray-400">{filteredComments.length} 条</span>
          </div>
          <div className="space-y-3">
            {filteredComments.map((comment) => (
              <div key={comment.id} className="flex flex-col sm:flex-row sm:items-start justify-between p-5 bg-white rounded-2xl gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-sm font-medium">
                      {comment.authorName[0]}
                    </div>
                    <span className="font-medium text-gray-900">{comment.authorName}</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getIntentStyle(comment.intentScore)}`}>
                      {comment.intentScore >= 5 ? "强意向" : comment.intentScore >= 4 ? "高意向" : comment.intentScore >= 3 ? "中意向" : "低意向"} {comment.intentScore}分
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusStyle(comment.status)}`}>
                      {getStatusLabel(comment.status)}
                    </span>
                  </div>
                  <div className="mt-3 text-sm text-gray-700 bg-gray-50 p-4 rounded-2xl">&ldquo;{comment.content}&rdquo;</div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                    <span>{comment.videoTitle}</span>
                    <span>关键词: {comment.intentKeywords.join(", ")}</span>
                    <span>{comment.createdAt}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {comment.status === "NEW" || comment.status === "ANALYZED" ? (
                    <>
                      <button
                        onClick={() => handleReply(comment.id)}
                        className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-full hover:bg-gray-800 active:scale-95 transition-all"
                      >
                        回复
                      </button>
                      <button
                        onClick={() => handleDM(comment.id)}
                        className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 active:scale-95 transition-all"
                      >
                        私信
                      </button>
                    </>
                  ) : (
                    <span className="px-4 py-2 text-sm font-medium text-gray-400 bg-gray-100 rounded-full">已处理</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function CommentsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" />
      </div>
    }>
      <CommentsContent />
    </Suspense>
  );
}
