"use client";

import { Navbar } from "@/components/layout/Navbar";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const mockComments = [
  {
    id: "1",
    authorName: "用户A",
    authorAvatar: "",
    content: "多少钱？能便宜吗？",
    intentScore: 5,
    intentKeywords: ["多少钱", "便宜"],
    status: "NEW",
    videoTitle: "花艺教程：玫瑰包装技巧",
    createdAt: "2分钟前",
  },
  {
    id: "2",
    authorName: "用户B",
    authorAvatar: "",
    content: "怎么联系你？想学花艺",
    intentScore: 4,
    intentKeywords: ["联系", "学"],
    status: "ANALYZED",
    videoTitle: "花艺教程：玫瑰包装技巧",
    createdAt: "5分钟前",
  },
  {
    id: "3",
    authorName: "用户C",
    authorAvatar: "",
    content: "在哪里可以买到？",
    intentScore: 4,
    intentKeywords: ["哪里", "买"],
    status: "REPLIED",
    videoTitle: "新手开店：花店选址攻略",
    createdAt: "10分钟前",
  },
  {
    id: "4",
    authorName: "用户D",
    authorAvatar: "",
    content: "这个花好漂亮啊",
    intentScore: 2,
    intentKeywords: ["漂亮"],
    status: "NEW",
    videoTitle: "花艺教程：玫瑰包装技巧",
    createdAt: "15分钟前",
  },
  {
    id: "5",
    authorName: "用户E",
    authorAvatar: "",
    content: "可以批发吗？大量采购",
    intentScore: 5,
    intentKeywords: ["批发", "采购"],
    status: "DM_SENT",
    videoTitle: "新手开店：花店选址攻略",
    createdAt: "20分钟前",
  },
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
    if (search && !c.content.includes(search) && !c.authorName.includes(search))
      return false;
    return true;
  });

  const handleReply = (id: string) => {
    setComments(
      comments.map((c) => (c.id === id ? { ...c, status: "REPLIED" } : c))
    );
    addToast("回复已发送", "success");
  };

  const handleDM = (id: string) => {
    setComments(
      comments.map((c) => (c.id === id ? { ...c, status: "DM_SENT" } : c))
    );
    addToast("私信已发送", "success");
  };

  const getIntentBadge = (score: number) => {
    if (score >= 5) return <Badge variant="danger">强意向 ({score})</Badge>;
    if (score >= 4) return <Badge variant="warning">高意向 ({score})</Badge>;
    if (score >= 3) return <Badge variant="info">中意向 ({score})</Badge>;
    return <Badge>低意向 ({score})</Badge>;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "NEW":
        return <Badge>新评论</Badge>;
      case "ANALYZED":
        return <Badge variant="info">已分析</Badge>;
      case "REPLIED":
        return <Badge variant="success">已回复</Badge>;
      case "DM_SENT":
        return <Badge variant="success">已私信</Badge>;
      case "CONVERTED":
        return <Badge variant="success">已转化</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">评论列表</h1>
          <p className="mt-1 text-sm text-gray-500">
            {videoId ? "查看指定视频的评论区" : "所有监控视频的评论区"}
          </p>
        </div>

        {/* 筛选栏 */}
        <Card className="mb-8">
          <CardBody>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <Input
                  placeholder="搜索评论内容或用户名"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={filter === "all" ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => setFilter("all")}
                >
                  全部
                </Button>
                <Button
                  variant={filter === "high" ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => setFilter("high")}
                >
                  高意向
                </Button>
                <Button
                  variant={filter === "new" ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => setFilter("new")}
                >
                  新评论
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* 评论列表 */}
        <Card>
          <CardHeader
            title={`评论 (${filteredComments.length})`}
            action={
              <Button variant="ghost" size="sm" onClick={() => addToast("已抓取最新评论", "success")}>
                抓取最新
              </Button>
            }
          />
          <CardBody>
            <div className="space-y-4">
              {filteredComments.map((comment) => (
                <div
                  key={comment.id}
                  className="flex items-start justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">👤</span>
                      <span className="font-medium text-gray-900">
                        {comment.authorName}
                      </span>
                      {getIntentBadge(comment.intentScore)}
                      {getStatusBadge(comment.status)}
                    </div>
                    <div className="mt-2 text-sm text-gray-700 bg-white p-3 rounded border">
                      "{comment.content}"
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                      <span>视频: {comment.videoTitle}</span>
                      <span>关键词: {comment.intentKeywords.join(", ")}</span>
                      <span>{comment.createdAt}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {comment.status === "NEW" || comment.status === "ANALYZED" ? (
                      <>
                        <Button size="sm" onClick={() => handleReply(comment.id)}>
                          回复
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDM(comment.id)}
                        >
                          私信
                        </Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="sm" disabled>
                        已处理
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </main>
    </div>
  );
}

export default function CommentsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center">加载中...</div>}>
      <CommentsContent />
    </Suspense>
  );
}
