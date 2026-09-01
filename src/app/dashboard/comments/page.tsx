"use client";

import { Navbar } from "@/components/layout/Navbar";
import { useToast } from "@/components/ui/use-toast";
import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { downloadCSV } from "@/lib/csv";
import { getErrorMessage } from "@/lib/errors";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Message {
  id: string;
  content: string;
  sentAt: string;
  status: string;
}

interface Comment {
  id: string;
  content: string;
  authorName: string;
  authorAvatar?: string | null;
  intentScore: number;
  intentKeywords: string[];
  matchedKeywords: string[];
  isNoise: boolean;
  noiseType: string | null;
  noiseReason: string | null;
  status: string;
  videoId: string;
  videoTitle: string;
  replyCount: number;
  dmCount: number;
  replies: Message[];
  dms: Message[];
  createdAt: string;
}

interface Template {
  id: string;
  name: string;
  content: string;
  isDefault: boolean;
}

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

const intentMap: Record<string, { text: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  strong: { text: "强意向", variant: "destructive" },
  high: { text: "高意向", variant: "default" },
  medium: { text: "中意向", variant: "secondary" },
  low: { text: "低意向", variant: "outline" },
};

function getIntentBadge(score: number) {
  if (score >= 5) return intentMap.strong;
  if (score >= 4) return intentMap.high;
  if (score >= 3) return intentMap.medium;
  return intentMap.low;
}

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  NEW: { label: "新评论", variant: "secondary" },
  ANALYZED: { label: "已分析", variant: "secondary" },
  REPLIED: { label: "已回复", variant: "default" },
  DM_SENT: { label: "已私信", variant: "default" },
  CONVERTED: { label: "已转化", variant: "default" },
};

function getStatusBadge(status: string) {
  return statusMap[status] || { label: status, variant: "outline" };
}

const noiseMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  peer: { label: "同行", variant: "outline" },
  vendor: { label: "广告", variant: "outline" },
  scam: { label: "诈骗", variant: "destructive" },
  offtopic: { label: "无关", variant: "outline" },
  emotional: { label: "纯情绪", variant: "secondary" },
  none: { label: "正常", variant: "default" },
};

function getNoiseBadge(type: string | null) {
  return noiseMap[type || "none"] || { label: type || "未知", variant: "outline" };
}

function CommentsContent() {
  const { addToast } = useToast();
  const searchParams = useSearchParams();
  const videoId = searchParams.get("videoId");
  const intentParam = searchParams.get("intent");
  const highlightId = searchParams.get("highlight");

  const [comments, setComments] = useState<Comment[]>([]);
  const [replyTemplates, setReplyTemplates] = useState<Template[]>([]);
  const [dmTemplates, setDmTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "high" | "new" | "sent">(intentParam === "high" ? "high" : "all");
  const [noiseFilter, setNoiseFilter] = useState<"all" | "false" | "true">("false");
  const [search, setSearch] = useState("");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [keywordMonitors, setKeywordMonitors] = useState<{ id: string; keyword: string }[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"reply" | "dm">("reply");
  const [activeComment, setActiveComment] = useState<Comment | null>(null);
  const [messageContent, setMessageContent] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  // 种草模式：AI 生成观点性回复（每条差异化，防风控）
  const [seedMode, setSeedMode] = useState(false);
  // 语义查重拦截信息（409 时展示，可强制发送）
  const [dedupWarning, setDedupWarning] = useState<{ error: string; suggestion?: string } | null>(null);

  interface FetchCommentsResult {
    comments: Comment[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
    replyTemplates: Template[];
    dmTemplates: Template[];
    keywordMonitors: { id: string; keyword: string }[];
  }

  const fetchKeywordMonitors = useCallback(async () => {
    const res = await fetch("/api/keywords/monitor");
    if (!res.ok) throw new Error("加载监控词库失败");
    const data = await res.json();
    return data.items || [];
  }, []);

  const fetchCommentsData = useCallback(async (): Promise<FetchCommentsResult> => {
    const params = new URLSearchParams();
    if (videoId) params.set("videoId", videoId);
    if (filter === "high") params.set("intent", "high");
    if (filter === "new") params.set("status", "NEW");
    if (filter === "sent") params.set("status", "SENT");
    params.set("noise", noiseFilter);
    if (search.trim()) params.set("q", search.trim());
    if (keywordFilter) params.set("keyword", keywordFilter);
    params.set("page", page.toString());
    params.set("pageSize", pageSize.toString());
    const url = `/api/comments?${params.toString()}`;
    const [commentsRes, replyRes, dmRes, monitorsRes] = await Promise.all([
      fetch(url),
      fetch("/api/templates?type=reply"),
      fetch("/api/templates?type=dm"),
      fetchKeywordMonitors(),
    ]);

    if (!commentsRes.ok || !replyRes.ok || !dmRes.ok) {
      throw new Error("加载数据失败");
    }

    const [commentsData, replyData, dmData] = await Promise.all([
      commentsRes.json(),
      replyRes.json(),
      dmRes.json(),
    ]);

    return {
      comments: commentsData.comments || [],
      pagination: commentsData.pagination || { page: 1, pageSize, total: 0, totalPages: 0 },
      replyTemplates: replyData.templates || [],
      dmTemplates: dmData.templates || [],
      keywordMonitors: monitorsRes,
    };
  }, [videoId, filter, noiseFilter, search, keywordFilter, page, pageSize, fetchKeywordMonitors]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCommentsData();
      setComments(result.comments);
      setPagination(result.pagination);
      setReplyTemplates(result.replyTemplates);
      setDmTemplates(result.dmTemplates);
      setKeywordMonitors(result.keywordMonitors);
    } catch (error) {
      console.error("Fetch comments error:", error);
      setError("加载评论数据失败");
      addToast("加载评论数据失败", "error");
    } finally {
      setLoading(false);
    }
  }, [fetchCommentsData, addToast]);

  const exportToCSV = () => {
    if (comments.length === 0) {
      addToast("暂无评论可导出", "error");
      return;
    }
    const rows: string[][] = [
      ["评论内容", "作者", "意向评分", "关键词", "噪音类型", "噪音原因", "状态", "视频", "时间"],
    ];
    comments.forEach((comment) => {
      const intent = getIntentBadge(comment.intentScore);
      const status = getStatusBadge(comment.status);
      const noise = getNoiseBadge(comment.noiseType);
      rows.push([
        comment.content,
        comment.authorName,
        `${intent.text} ${comment.intentScore}分`,
        comment.intentKeywords.join(", "),
        comment.isNoise ? noise.label : "否",
        comment.noiseReason || "",
        status.label,
        comment.videoTitle,
        new Date(comment.createdAt).toLocaleString("zh-CN"),
      ]);
    });
    downloadCSV(rows, `评论列表_${new Date().toISOString().slice(0, 10)}.csv`);
    addToast("评论列表已导出", "success");
  };

  useEffect(() => {
    let ignore = false;
    fetchCommentsData()
      .then((result) => {
        if (!ignore) {
          setComments(result.comments);
          setPagination(result.pagination);
          setReplyTemplates(result.replyTemplates);
          setDmTemplates(result.dmTemplates);
          setKeywordMonitors(result.keywordMonitors);
          setError(null);
        }
      })
      .catch((error) => {
        if (!ignore) {
          console.error("Fetch comments error:", error);
          setError("加载评论数据失败");
          addToast("加载评论数据失败", "error");
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [fetchCommentsData, addToast]);

  useEffect(() => {
    if (highlightId && comments.length > 0) {
      const element = document.getElementById(`comment-${highlightId}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add("ring-2", "ring-gray-900", "rounded-2xl");
        setTimeout(() => element.classList.remove("ring-2", "ring-gray-900", "rounded-2xl"), 2000);
      }
    }
  }, [highlightId, comments]);

  const currentTemplates = dialogType === "reply" ? replyTemplates : dmTemplates;

  const openDialog = (comment: Comment, type: "reply" | "dm") => {
    setActiveComment(comment);
    setDialogType(type);
    setSeedMode(false);
    setDedupWarning(null);
    const defaultTemplate = (type === "reply" ? replyTemplates : dmTemplates).find(
      (t) => t.isDefault
    );
    setSelectedTemplateId(defaultTemplate?.id || "");
    setMessageContent(defaultTemplate?.content || "");
    setDialogOpen(true);
  };

  /** 种草回复：AI 生成观点性评论，一键差异化发送 */
  const openSeedDialog = (comment: Comment) => {
    setActiveComment(comment);
    setDialogType("reply");
    setBatchMode(false);
    setSeedMode(true);
    setDedupWarning(null);
    setSelectedTemplateId("");
    setMessageContent("");
    setDialogOpen(true);
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = currentTemplates.find((t) => t.id === templateId);
    if (template) {
      setMessageContent(template.content);
    }
  };

  const isSelectable = (comment: Comment) =>
    !comment.isNoise && (comment.status === "NEW" || comment.status === "ANALYZED");

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openBatchDialog = (type: "reply" | "dm") => {
    setBatchMode(true);
    setDialogType(type);
    setActiveComment(null);
    setSeedMode(false);
    setDedupWarning(null);
    const defaultTemplate = (type === "reply" ? replyTemplates : dmTemplates).find(
      (t) => t.isDefault
    );
    setSelectedTemplateId(defaultTemplate?.id || "");
    setMessageContent(defaultTemplate?.content || "");
    setDialogOpen(true);
  };

  /** 批量种草：每条评论独立生成差异化观点回复 */
  const openBatchSeedDialog = () => {
    setBatchMode(true);
    setDialogType("reply");
    setActiveComment(null);
    setSeedMode(true);
    setDedupWarning(null);
    setSelectedTemplateId("");
    setMessageContent("");
    setDialogOpen(true);
  };

  const handleSubmit = async (force = false) => {
    if (!seedMode && !messageContent.trim()) {
      addToast("请输入内容", "error");
      return;
    }

    if (batchMode && selectedIds.size === 0) {
      addToast("请先选择评论", "error");
      return;
    }

    if (!batchMode && !activeComment) {
      addToast("未指定评论", "error");
      return;
    }

    setSubmitting(true);
    setDedupWarning(null);
    try {
      const url = batchMode
        ? `/api/comments/batch/${dialogType}`
        : `/api/comments/${activeComment!.id}/${dialogType}`;
      const body = batchMode
        ? JSON.stringify({
            commentIds: Array.from(selectedIds),
            ...(seedMode
              ? { generate: true }
              : { content: messageContent, templateId: selectedTemplateId || undefined }),
            ...(force ? { force: true } : {}),
          })
        : JSON.stringify({
            ...(seedMode
              ? { generate: true }
              : { content: messageContent, templateId: selectedTemplateId || undefined }),
            ...(force ? { force: true } : {}),
          });

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      const data = await res.json();
      if (!res.ok) {
        // 语义查重/同质化拦截：展示警告，允许用户强制发送
        if (res.status === 409 && data.code) {
          setDedupWarning({ error: data.error, suggestion: data.suggestion });
          return;
        }
        throw new Error(data.error || "操作失败");
      }

      if (batchMode) {
        const queuedCount = data.count || 0;
        const failedCount = data.failed || 0;
        addToast(
          `已将 ${queuedCount} 条${dialogType === "reply" ? (seedMode ? "种草回复" : "回复") : "私信"}加入发送队列${failedCount > 0 ? `，${failedCount} 条未入队` : ""}`,
          failedCount > 0 ? "error" : "success"
        );
        setSelectedIds(new Set());
      } else {
        // 202 入队语义：发送结果由 worker 异步完成，稍后见展开记录
        addToast(
          seedMode
            ? "种草回复已加入发送队列（内容见展开记录）"
            : (dialogType === "reply" ? "回复已加入发送队列" : "私信已加入发送队列"),
          "success"
        );
      }

      await fetchData();
      setDialogOpen(false);
      setSeedMode(false);
    } catch (error) {
      addToast(getErrorMessage(error) || "操作失败", "error");
    } finally {
      setSubmitting(false);
    }
  };



  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 lg:px-8 pt-24 pb-32">
        <div className="mb-16">
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">评论列表</h1>
          <p className="mt-2 text-base text-gray-400">
            {videoId ? "查看指定视频的评论区" : "所有监控视频的评论区"}
          </p>
        </div>

        {/* Filter Bar */}
        <Card className="rounded-3xl border-0 shadow-none bg-gray-50 mb-10">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 w-full">
                <Input
                  type="text"
                  placeholder="搜索评论内容或用户名"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="rounded-2xl bg-white border-0 px-4 py-3 h-auto text-gray-900 text-sm focus:ring-2 focus:ring-gray-200"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {(["all", "high", "new", "sent"] as const).map((f) => (
                  <Button
                    key={f}
                    onClick={() => { setFilter(f); setPage(1); }}
                    variant={filter === f ? "default" : "secondary"}
                    className="rounded-full px-5 py-2.5 h-auto text-sm"
                  >
                    {f === "all" ? "全部" : f === "high" ? "高意向" : f === "new" ? "新评论" : "已发送"}
                  </Button>
                ))}
                {(["false", "true", "all"] as const).map((n) => (
                  <Button
                    key={`noise-${n}`}
                    onClick={() => { setNoiseFilter(n); setPage(1); }}
                    variant={noiseFilter === n ? "default" : "secondary"}
                    className="rounded-full px-4 py-2 h-auto text-xs"
                  >
                    {n === "false" ? "隐藏噪音" : n === "true" ? "仅噪音" : "含噪音"}
                  </Button>
                ))}
              </div>
              <div className="w-full sm:w-44">
                <select
                  value={keywordFilter}
                  onChange={(e) => { setKeywordFilter(e.target.value); setPage(1); }}
                  className="w-full rounded-2xl bg-white border-0 px-4 py-3 h-auto text-gray-900 text-sm focus:ring-2 focus:ring-gray-200"
                >
                  <option value="">全部关键词</option>
                  {keywordMonitors.map((m) => (
                    <option key={m.id} value={m.keyword}>{m.keyword}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Comments List */}
        <Card className="rounded-3xl border-0 shadow-none bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between px-8 pt-8 pb-0">
            <CardTitle className="text-lg font-medium text-gray-900">评论</CardTitle>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={exportToCSV}
                disabled={comments.length === 0}
                className="rounded-full px-4 py-2 h-auto text-xs text-gray-500"
              >
                导出 CSV
              </Button>
              <span className="text-sm text-gray-400">共 {pagination.total} 条</span>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            {selectedIds.size > 0 && (
              <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-100 rounded-2xl px-5 py-3">
                <span className="text-sm text-gray-700">已选择 {selectedIds.size} 条评论</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const selectableIds = comments.filter((c) => isSelectable(c)).map((c) => c.id);
                      setSelectedIds(new Set(selectableIds));
                    }}
                    className="rounded-full px-4 py-2 h-auto text-xs text-gray-500"
                  >
                    全选本页
                  </Button>
                  <Button
                    size="sm"
                    onClick={openBatchSeedDialog}
                    className="rounded-full px-4 py-2 h-auto text-xs bg-green-600 hover:bg-green-700"
                  >
                    批量种草
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => openBatchDialog("reply")}
                    className="rounded-full px-4 py-2 h-auto text-xs"
                  >
                    批量回复
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openBatchDialog("dm")}
                    className="rounded-full px-4 py-2 h-auto text-xs"
                  >
                    批量私信
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedIds(new Set())}
                    className="rounded-full px-4 py-2 h-auto text-xs text-gray-500"
                  >
                    取消
                  </Button>
                </div>
              </div>
            )}
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-40 w-full rounded-2xl" />
                ))}
              </div>
            ) : error ? (
              <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-600 flex items-center justify-between gap-4">
                <span>{error}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={fetchData}
                  className="rounded-full px-5 py-2 h-auto text-sm flex-shrink-0"
                >
                  重试
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {comments.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 text-sm">
                    暂无评论数据
                  </div>
                ) : (
                  comments.map((comment) => {
                    const intent = getIntentBadge(comment.intentScore);
                    const status = getStatusBadge(comment.status);
                    const hasHistory = comment.replies.length > 0 || comment.dms.length > 0;

                    return (
                      <Card
                        key={comment.id}
                        id={`comment-${comment.id}`}
                        className="rounded-2xl border-0 shadow-sm"
                      >
                        <CardContent className="p-5 sm:p-6">
                          {/* Header */}
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 flex-wrap">
                                {isSelectable(comment) && (
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(comment.id)}
                                    onChange={() => toggleSelect(comment.id)}
                                    className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-200"
                                  />
                                )}
                                <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 text-sm font-medium">
                                  {comment.authorName[0]}
                                </div>
                                <span className="font-medium text-gray-900">{comment.authorName}</span>
                                {comment.isNoise ? (
                                  <Badge variant={getNoiseBadge(comment.noiseType).variant} className="rounded-full">
                                    {getNoiseBadge(comment.noiseType).label}
                                  </Badge>
                                ) : (
                                  <Badge variant={intent.variant} className="rounded-full">
                                    {intent.text} {comment.intentScore}分
                                  </Badge>
                                )}
                                <Badge variant={status.variant} className="rounded-full">
                                  {status.label}
                                </Badge>
                              </div>
                              <div
                                className={`mt-3 text-sm p-4 rounded-2xl leading-relaxed ${
                                  comment.isNoise ? "text-gray-400 bg-gray-100 line-through decoration-gray-300" : "text-gray-800 bg-gray-50"
                                }`}
                              >
                                &ldquo;{comment.content}&rdquo;
                              </div>
                              {comment.isNoise && comment.noiseReason && (
                                <div className="mt-2 text-xs text-gray-400">
                                  过滤原因：{comment.noiseReason}
                                </div>
                              )}
                              {comment.matchedKeywords.length > 0 && (
                                <div className="mt-3 flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-gray-400">命中监控词：</span>
                                  {comment.matchedKeywords.map((k) => (
                                    <Badge key={k} variant="outline" className="rounded-full text-xs">{k}</Badge>
                                  ))}
                                </div>
                              )}
                              <div className="mt-3 flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                                <span>{comment.videoTitle}</span>
                                {!comment.isNoise && (
                                  <span>关键词: {comment.intentKeywords.join(", ") || "—"}</span>
                                )}
                                <span>{formatRelativeTime(comment.createdAt)}</span>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {comment.isNoise ? (
                                <Button
                                  variant="ghost"
                                  disabled
                                  className="rounded-full px-4 py-2 h-auto text-sm text-gray-400"
                                >
                                  已过滤
                                </Button>
                              ) : comment.status === "NEW" || comment.status === "ANALYZED" ? (
                                <>
                                  <Button
                                    onClick={() => openSeedDialog(comment)}
                                    variant="secondary"
                                    className="rounded-full px-4 py-2 h-auto text-sm text-green-700 bg-green-50 hover:bg-green-100"
                                  >
                                    种草
                                  </Button>
                                  <Button
                                    onClick={() => openDialog(comment, "reply")}
                                    className="rounded-full px-4 py-2 h-auto text-sm"
                                  >
                                    回复
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    onClick={() => openDialog(comment, "dm")}
                                    className="rounded-full px-4 py-2 h-auto text-sm"
                                  >
                                    私信
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  variant="ghost"
                                  disabled
                                  className="rounded-full px-4 py-2 h-auto text-sm text-gray-400"
                                >
                                  已处理
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* History summary / expand */}
                          {hasHistory && (
                            <div className="mt-4">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const next = new Set(expandedIds);
                                  if (next.has(comment.id)) next.delete(comment.id);
                                  else next.add(comment.id);
                                  setExpandedIds(next);
                                }}
                                className="rounded-full px-3 py-1.5 h-auto text-xs text-gray-500 hover:text-gray-900"
                              >
                                {expandedIds.has(comment.id) ? "收起记录" : "展开记录"}
                                {comment.replyCount > 0 && ` · 已回复 ${comment.replyCount} 条`}
                                {comment.dmCount > 0 && ` · 已私信 ${comment.dmCount} 条`}
                              </Button>
                            </div>
                          )}

                          {/* History */}
                          {hasHistory && expandedIds.has(comment.id) && (
                            <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                              {comment.replies.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-medium text-gray-400 mb-2">回复记录</h4>
                                  <div className="space-y-2">
                                    {comment.replies.map((reply) => (
                                      <div key={reply.id} className="flex items-start gap-3 text-sm">
                                        <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-xs flex-shrink-0 mt-0.5">我</div>
                                        <div className="flex-1 bg-green-50 rounded-2xl rounded-tl-none px-4 py-3 text-gray-700">
                                          {reply.content}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {comment.dms.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-medium text-gray-400 mb-2">私信记录</h4>
                                  <div className="space-y-2">
                                    {comment.dms.map((dm) => (
                                      <div key={dm.id} className="flex items-start gap-3 text-sm">
                                        <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-xs flex-shrink-0 mt-0.5">我</div>
                                        <div className="flex-1 bg-purple-50 rounded-2xl rounded-tl-none px-4 py-3 text-gray-700">
                                          {dm.content}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
                )}

                {pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4">
                    <span className="text-sm text-gray-400">
                      第 {pagination.page} / {pagination.totalPages} 页
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1 || loading}
                        className="rounded-full px-4 py-2 h-auto text-sm"
                      >
                        上一页
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                        disabled={page >= pagination.totalPages || loading}
                        className="rounded-full px-4 py-2 h-auto text-sm"
                      >
                        下一页
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Reply / DM Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle>
              {seedMode
                ? batchMode
                  ? `批量种草回复（${selectedIds.size} 条）`
                  : "种草回复"
                : batchMode
                  ? `批量${dialogType === "reply" ? "回复" : "私信"}（${selectedIds.size} 条）`
                  : dialogType === "reply"
                    ? "回复评论"
                    : "发送私信"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-4">
            {seedMode ? (
              <div className="rounded-2xl bg-green-50 px-4 py-4 text-sm text-green-800 space-y-2">
                <p className="font-medium">观点种草模式（防风控）</p>
                <p className="text-green-700">
                  AI 将针对{batchMode ? "每条评论" : "这条评论"}生成<strong>互不相同的观点性回复</strong>：
                  不留联系方式、不硬广，用专业人设吸引对方主动看你主页。
                  {batchMode && " 生成需要一些时间，请耐心等待。"}
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-2">选择话术模板</label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                    className="w-full rounded-2xl bg-gray-50 border-0 px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-gray-200"
                  >
                    <option value="">自定义内容</option>
                    {currentTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} {template.isDefault ? "（默认）" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-2">
                    {dialogType === "reply" ? "回复内容" : "私信内容"}
                  </label>
                  <Textarea
                    rows={4}
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    placeholder={dialogType === "reply" ? "输入回复内容..." : "输入私信内容..."}
                    className="rounded-2xl bg-gray-50 border-0 px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-gray-200 resize-none"
                  />
                </div>
              </>
            )}

            {dedupWarning && (
              <div className="rounded-2xl bg-amber-50 px-4 py-4 text-sm space-y-1">
                <p className="font-medium text-amber-800">风控提醒</p>
                <p className="text-amber-700">{dedupWarning.error}</p>
                {dedupWarning.suggestion && (
                  <p className="text-amber-600 text-xs">{dedupWarning.suggestion}</p>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <Button
                variant="secondary"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
                className="rounded-full px-6 py-2.5 h-auto text-sm"
              >
                取消
              </Button>
              {dedupWarning && !seedMode && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDedupWarning(null);
                    handleSubmit(true);
                  }}
                  disabled={submitting}
                  className="rounded-full px-6 py-2.5 h-auto text-sm text-amber-700"
                >
                  仍要发送
                </Button>
              )}
              <Button
                onClick={() => handleSubmit(false)}
                disabled={submitting || (!seedMode && !messageContent.trim())}
                className={seedMode ? "rounded-full px-6 py-2.5 h-auto text-sm bg-green-600 hover:bg-green-700" : "rounded-full px-6 py-2.5 h-auto text-sm"}
              >
                {submitting
                  ? (seedMode ? "生成并发送中..." : "发送中...")
                  : (seedMode ? "生成并发送" : "发送")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
