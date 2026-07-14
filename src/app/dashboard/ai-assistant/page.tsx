"use client";

import { useState, useEffect, useCallback, useLayoutEffect, useRef } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { useToast } from "@/components/ui/use-toast";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";
import { Trash2, History, RotateCcw, Star, Plus, X, Check } from "lucide-react";
import { KeywordScoreChart } from "@/components/ai-assistant/KeywordScoreChart";

interface ScoredKeyword {
  keyword: string;
  searchVolume: number;
  competition: number;
  businessIntent: number;
  score: number;
}

interface KeywordResult {
  combinedSearchQueries: string[];
  coreKeywords: string[];
  longTailKeywords: string[];
  painPoints: string[];
  competitorAccounts: string[];
  searchCommands: {
    douyin: string[];
    xiaohongshu: string[];
    zhihu: string[];
    baidu: string[];
  };
  scoredKeywords: ScoredKeyword[];
}

interface ResearchResult {
  hotTopics: string[];
  painPoints: string[];
  competitorAccounts: string[];
  keywords: string[];
  summary: string;
}

interface HistoryItem {
  id: string;
  title: string | null;
  industry: string | null;
  url: string | null;
  tags: string[];
  isFavorite: boolean;
  createdAt: string;
}

type SortField = "score" | "searchVolume" | "competition" | "businessIntent";
type SortDirection = "asc" | "desc";

const platformLabels: Record<string, string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
  zhihu: "知乎",
  baidu: "百度",
};

export default function AiAssistantPage() {
  const { addToast } = useToast();
  const { data: session } = useSession();
  const [industry, setIndustry] = useState("");
  const industryInitialized = useRef(false);

  useLayoutEffect(() => {
    if (session?.user?.industryContext && !industryInitialized.current) {
      industryInitialized.current = true;
      setIndustry(session.user.industryContext);
    }
  }, [session?.user?.industryContext]);

  const [url, setUrl] = useState("");
  const [loadingKeywords, setLoadingKeywords] = useState(false);
  const [loadingResearch, setLoadingResearch] = useState(false);
  const [keywordResult, setKeywordResult] = useState<KeywordResult | null>(null);
  const [researchResult, setResearchResult] = useState<ResearchResult | null>(null);
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());
  const [monitorKeywords, setMonitorKeywords] = useState<Set<string>>(new Set());
  const [loadingMonitors, setLoadingMonitors] = useState(false);
  const [sortField, setSortField] = useState<SortField>("score");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [saving, setSaving] = useState(false);
  const [historyTags, setHistoryTags] = useState<Record<string, string>>({});
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const fetchHistoryData = useCallback(async (): Promise<HistoryItem[]> => {
    const res = await fetch("/api/ai/history");
    if (!res.ok) throw new Error("加载历史记录失败");
    const data = await res.json();
    return data.items || [];
  }, []);

  const fetchMonitorKeywords = useCallback(async (): Promise<string[]> => {
    const res = await fetch("/api/keywords/monitor");
    if (!res.ok) throw new Error("加载监控词库失败");
    const data = await res.json();
    return (data.items || []).map((item: { keyword: string }) => item.keyword);
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const items = await fetchHistoryData();
      setHistory(items);
    } catch (error) {
      console.error("Fetch history error:", error);
    } finally {
      setLoadingHistory(false);
    }
  }, [fetchHistoryData]);

  useEffect(() => {
    let ignore = false;
    fetchHistoryData()
      .then((items) => {
        if (!ignore) setHistory(items);
      })
      .catch((error) => {
        if (!ignore) console.error("Fetch history error:", error);
      })
      .finally(() => {
        if (!ignore) setLoadingHistory(false);
      });
    return () => {
      ignore = true;
    };
  }, [fetchHistoryData]);

  useEffect(() => {
    let ignore = false;
    fetchMonitorKeywords()
      .then((keywords) => {
        if (!ignore) setMonitorKeywords(new Set(keywords));
      })
      .catch((error) => {
        if (!ignore) console.error("Fetch monitor keywords error:", error);
      });
    return () => {
      ignore = true;
    };
  }, [fetchMonitorKeywords]);

  const handleExtractKeywords = async () => {
    if (!industry.trim()) {
      addToast("请输入行业或产品描述", "error");
      return;
    }

    setLoadingKeywords(true);
    try {
      const res = await fetch("/api/ai/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry: industry.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "提取失败");
      }
      setKeywordResult(data.data);
      setSelectedKeywords(new Set());
      addToast("关键词提取完成", "success");
    } catch (error) {
      addToast(getErrorMessage(error) || "关键词提取失败", "error");
    } finally {
      setLoadingKeywords(false);
    }
  };

  const handleResearch = async () => {
    if (!url.trim()) {
      addToast("请输入网页链接", "error");
      return;
    }

    setLoadingResearch(true);
    try {
      const res = await fetch("/api/ai/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "研究失败");
      }
      setResearchResult(data.data);
      addToast("网页研究完成", "success");
    } catch (error) {
      addToast(getErrorMessage(error) || "网页研究失败", "error");
    } finally {
      setLoadingResearch(false);
    }
  };

  const handleSaveHistory = async () => {
    if (!keywordResult && !researchResult) {
      addToast("没有可保存的研究结果", "error");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/ai/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: industry.trim() || url.trim() || undefined,
          industry: industry.trim() || undefined,
          url: url.trim() || undefined,
          combinedSearchQueries: keywordResult?.combinedSearchQueries || [],
          coreKeywords: keywordResult?.coreKeywords || [],
          longTailKeywords: keywordResult?.longTailKeywords || [],
          painPoints: keywordResult?.painPoints || [],
          competitorAccounts: keywordResult?.competitorAccounts || [],
          searchCommands: keywordResult?.searchCommands || {},
          scoredKeywords: keywordResult?.scoredKeywords || [],
          researchSummary: researchResult?.summary || undefined,
          researchHotTopics: researchResult?.hotTopics || [],
          researchPainPoints: researchResult?.painPoints || [],
          researchCompetitors: researchResult?.competitorAccounts || [],
          researchKeywords: researchResult?.keywords || [],
          tags: [],
          isFavorite: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "保存失败");
      }
      addToast("已保存到历史记录", "success");
      fetchHistory();
    } catch (error) {
      addToast(getErrorMessage(error) || "保存历史记录失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleLoadHistory = async (item: HistoryItem) => {
    try {
      const res = await fetch(`/api/ai/history/${item.id}`);
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json();
      const record = data.item;

      if (record.industry) setIndustry(record.industry);
      if (record.url) setUrl(record.url);

      if (record.coreKeywords?.length > 0 || record.combinedSearchQueries?.length > 0) {
        setKeywordResult({
          combinedSearchQueries: record.combinedSearchQueries || [],
          coreKeywords: record.coreKeywords || [],
          longTailKeywords: record.longTailKeywords || [],
          painPoints: record.painPoints || [],
          competitorAccounts: record.competitorAccounts || [],
          searchCommands: (record.searchCommands as KeywordResult["searchCommands"]) || {
            douyin: [],
            xiaohongshu: [],
            zhihu: [],
            baidu: [],
          },
          scoredKeywords: (record.scoredKeywords as ScoredKeyword[]) || [],
        });
      } else {
        setKeywordResult(null);
      }

      if (record.researchSummary || record.researchKeywords?.length > 0) {
        setResearchResult({
          summary: record.researchSummary || "",
          hotTopics: record.researchHotTopics || [],
          painPoints: record.researchPainPoints || [],
          competitorAccounts: record.researchCompetitors || [],
          keywords: record.researchKeywords || [],
        });
      } else {
        setResearchResult(null);
      }

      addToast("已加载历史研究", "success");
    } catch (error) {
      addToast(getErrorMessage(error) || "加载失败", "error");
    }
  };

  const handleDeleteHistory = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/history/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      setHistory(history.filter((h) => h.id !== id));
      addToast("历史记录已删除", "success");
    } catch (error) {
      addToast(getErrorMessage(error) || "删除失败", "error");
    }
  };

  const toggleKeywordSelection = (keyword: string) => {
    setSelectedKeywords((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });
  };

  const handleSaveToMonitor = async () => {
    if (selectedKeywords.size === 0) {
      addToast("请先勾选关键词", "error");
      return;
    }
    setLoadingMonitors(true);
    try {
      const res = await fetch("/api/keywords/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: Array.from(selectedKeywords) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setMonitorKeywords((prev) => {
        const next = new Set(prev);
        selectedKeywords.forEach((k) => next.add(k));
        return next;
      });
      addToast(`已保存 ${data.count} 个关键词到监控词库`, "success");
    } catch (error) {
      addToast(getErrorMessage(error) || "保存监控词库失败", "error");
    } finally {
      setLoadingMonitors(false);
    }
  };

  const handleToggleFavorite = async (item: HistoryItem) => {
    try {
      const res = await fetch(`/api/ai/history/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !item.isFavorite }),
      });
      if (!res.ok) throw new Error("更新失败");
      setHistory(history.map((h) => (h.id === item.id ? { ...h, isFavorite: !h.isFavorite } : h)));
    } catch (error) {
      addToast(getErrorMessage(error) || "更新失败", "error");
    }
  };

  const startEditTitle = (item: HistoryItem) => {
    setEditingHistoryId(item.id);
    setEditingTitle(item.title || "");
  };

  const saveTitle = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/history/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editingTitle.trim() || "未命名研究" }),
      });
      if (!res.ok) throw new Error("更新失败");
      setHistory(history.map((h) => (h.id === id ? { ...h, title: editingTitle.trim() || "未命名研究" } : h)));
      setEditingHistoryId(null);
    } catch (error) {
      addToast(getErrorMessage(error) || "更新失败", "error");
    }
  };

  const handleTagInputChange = (id: string, value: string) => {
    setHistoryTags((prev) => ({ ...prev, [id]: value }));
  };

  const handleAddTag = async (id: string) => {
    const raw = historyTags[id]?.trim();
    if (!raw) return;
    const item = history.find((h) => h.id === id);
    if (!item) return;
    const newTags = Array.from(new Set([...item.tags, raw])).slice(0, 10);
    try {
      const res = await fetch(`/api/ai/history/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: newTags }),
      });
      if (!res.ok) throw new Error("添加标签失败");
      setHistory(history.map((h) => (h.id === id ? { ...h, tags: newTags } : h)));
      setHistoryTags((prev) => ({ ...prev, [id]: "" }));
    } catch (error) {
      addToast(getErrorMessage(error) || "添加标签失败", "error");
    }
  };

  const handleRemoveTag = async (id: string, tag: string) => {
    const item = history.find((h) => h.id === id);
    if (!item) return;
    const newTags = item.tags.filter((t) => t !== tag);
    try {
      const res = await fetch(`/api/ai/history/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: newTags }),
      });
      if (!res.ok) throw new Error("删除标签失败");
      setHistory(history.map((h) => (h.id === id ? { ...h, tags: newTags } : h)));
    } catch (error) {
      addToast(getErrorMessage(error) || "删除标签失败", "error");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addToast("已复制到剪贴板", "success");
  };

  const exportToCSV = () => {
    const rows: string[][] = [];
    rows.push(["类型", "内容"]);

    keywordResult?.combinedSearchQueries.forEach((q) => rows.push(["综合搜索词组", q]));
    keywordResult?.coreKeywords.forEach((k) => rows.push(["核心关键词", k]));
    keywordResult?.longTailKeywords.forEach((k) => rows.push(["长尾关键词", k]));
    keywordResult?.painPoints.forEach((p) => rows.push(["用户痛点", p]));
    keywordResult?.competitorAccounts.forEach((a) => rows.push(["潜在竞品方向", a]));
    researchResult?.keywords.forEach((k) => rows.push(["网页热词", k]));
    researchResult?.painPoints.forEach((p) => rows.push(["网页痛点", p]));
    researchResult?.competitorAccounts.forEach((a) => rows.push(["网页竞品方向", a]));
    researchResult?.hotTopics.forEach((t) => rows.push(["热门话题", t]));
    Object.entries(keywordResult?.searchCommands || {}).forEach(([platform, commands]) => {
      commands.forEach((cmd) => rows.push([`${platformLabels[platform] || platform}搜索指令`, cmd]));
    });

    const csvContent = "\uFEFF" + rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `获客关键词_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast("关键词已导出", "success");
  };

  const allKeywords = Array.from(
    new Set([
      ...(keywordResult?.coreKeywords || []),
      ...(keywordResult?.longTailKeywords || []),
      ...(researchResult?.keywords || []),
    ])
  );

  const allPainPoints = Array.from(
    new Set([
      ...(keywordResult?.painPoints || []),
      ...(researchResult?.painPoints || []),
    ])
  );

  const allCompetitors = Array.from(
    new Set([
      ...(keywordResult?.competitorAccounts || []),
      ...(researchResult?.competitorAccounts || []),
    ])
  );

  const formatHistoryTime = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  };

  const sortedScoredKeywords = keywordResult?.scoredKeywords
    ? keywordResult.scoredKeywords.slice().sort((a, b) => {
        const diff = a[sortField] - b[sortField];
        return sortDirection === "desc" ? -diff : diff;
      })
    : [];

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const renderStars = (value: number) => "★".repeat(value) + "☆".repeat(5 - value);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 lg:px-8 pt-24 pb-32">
        <div className="mb-16">
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">AI 获客助手</h1>
          <p className="mt-2 text-base text-gray-400">输入行业或产品，AI 帮你提取关键词、痛点和获客搜索指令</p>
        </div>

        {/* Input Section */}
        <Card className="rounded-3xl border-0 shadow-none bg-gray-50 mb-10">
          <CardContent className="p-8 space-y-8">
            {/* Industry Input */}
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-2">行业 / 产品描述</label>
              <Textarea
                rows={4}
                placeholder="例如：上海成人英语口语培训，面向 25-40 岁职场人群，主打外教一对一线上课"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="rounded-2xl bg-white border-0 px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-gray-200 resize-none"
              />
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={handleExtractKeywords}
                  disabled={loadingKeywords}
                  className="rounded-full px-6 py-3 h-auto text-sm"
                >
                  {loadingKeywords ? "AI 分析中..." : "AI 提取关键词"}
                </Button>
              </div>
            </div>

            {/* Web Research Input */}
            <div className="pt-6 border-t border-gray-200">
              <label className="block text-sm font-medium text-gray-500 mb-2">补充研究网页（可选）</label>
              <p className="text-xs text-gray-400 mb-3">粘贴知乎、小红书、行业文章等公开网页链接，Firecrawl 会抓取并补充热词和痛点</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  type="text"
                  placeholder="https://..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1 rounded-2xl bg-white border-0 px-4 py-3 h-auto text-gray-900 text-sm focus:ring-2 focus:ring-gray-200"
                />
                <Button
                  variant="secondary"
                  onClick={handleResearch}
                  disabled={loadingResearch}
                  className="rounded-full px-6 py-3 h-auto text-sm"
                >
                  {loadingResearch ? "抓取中..." : "抓取网页补充"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* History */}
        {(history.length > 0 || loadingHistory) && (
          <Card className="rounded-3xl border-0 shadow-none bg-gray-50 mb-10">
            <CardHeader className="px-8 pt-8 pb-0 flex flex-row items-center gap-2">
              <History className="w-4 h-4 text-gray-400" />
              <CardTitle className="text-lg font-medium text-gray-900">最近研究</CardTitle>
            </CardHeader>
            <CardContent className="p-8">
              {loadingHistory ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-2xl" />
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-2 pl-4 pr-2 py-2 bg-white rounded-2xl text-sm text-gray-700 group w-full sm:w-auto"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleFavorite(item)}
                          className={`rounded-full px-1 py-1 h-auto ${item.isFavorite ? "text-amber-500" : "text-gray-300 hover:text-amber-500"}`}
                        >
                          <Star className="w-3 h-3" fill={item.isFavorite ? "currentColor" : "none"} />
                        </Button>

                        {editingHistoryId === item.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              className="h-7 text-xs rounded-full px-2 py-1 w-40"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveTitle(item.id);
                                if (e.key === "Escape") setEditingHistoryId(null);
                              }}
                            />
                            <Button variant="ghost" size="sm" onClick={() => saveTitle(item.id)} className="h-7 w-7 p-0 rounded-full">
                              <Check className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditingHistoryId(null)} className="h-7 w-7 p-0 rounded-full">
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEditTitle(item)}
                            className="truncate max-w-[200px] hover:text-gray-900 text-left"
                            title={item.title || ""}
                          >
                            {item.title}
                          </button>
                        )}

                        <span className="text-xs text-gray-400 whitespace-nowrap">{formatHistoryTime(item.createdAt)}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleLoadHistory(item)}
                          className="rounded-full px-2 py-1 h-auto text-xs text-gray-500 hover:text-gray-900"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteHistory(item.id)}
                          className="rounded-full px-2 py-1 h-auto text-xs text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>

                      {item.tags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                          {item.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs rounded-full px-2 py-0.5">
                              {tag}
                              <button
                                onClick={() => handleRemoveTag(item.id, tag)}
                                className="ml-1 text-gray-400 hover:text-red-500"
                              >
                                <X className="w-3 h-3 inline" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-1">
                        <Input
                          value={historyTags[item.id] || ""}
                          onChange={(e) => handleTagInputChange(item.id, e.target.value)}
                          placeholder="添加标签"
                          className="h-7 text-xs rounded-full px-2 py-1 w-28"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddTag(item.id);
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAddTag(item.id)}
                          className="h-7 w-7 p-0 rounded-full text-gray-400 hover:text-gray-900"
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {(loadingKeywords || loadingResearch) && (
          <div className="space-y-4 mb-10">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        )}

        {/* Results */}
        {(keywordResult || researchResult) && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">研究结果</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={handleSaveHistory}
                  disabled={saving}
                  className="rounded-full px-5 py-2 h-auto text-sm"
                >
                  {saving ? "保存中..." : "保存到历史"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={exportToCSV}
                  className="rounded-full px-5 py-2 h-auto text-sm"
                >
                  导出 CSV
                </Button>
              </div>
            </div>

            {/* Combined Search Queries */}
            {keywordResult?.combinedSearchQueries && keywordResult.combinedSearchQueries.length > 0 && (
              <Card className="rounded-3xl border-0 shadow-none bg-gray-50">
                <CardHeader className="px-8 pt-8 pb-0">
                  <CardTitle className="text-lg font-medium text-gray-900">综合搜索词组</CardTitle>
                </CardHeader>
                <CardContent className="p-8">
                  <div className="flex flex-wrap gap-2">
                    {keywordResult.combinedSearchQueries.map((query) => (
                      <Button
                        key={query}
                        variant="secondary"
                        size="sm"
                        onClick={() => copyToClipboard(query)}
                        className="rounded-full px-4 py-2 h-auto text-xs bg-white hover:bg-gray-100"
                      >
                        {query}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Combined Keywords */}
            {allKeywords.length > 0 && (
              <Card className="rounded-3xl border-0 shadow-none bg-gray-50">
                <CardHeader className="px-8 pt-8 pb-0">
                  <CardTitle className="text-lg font-medium text-gray-900">关键词库</CardTitle>
                </CardHeader>
                <CardContent className="p-8">
                  <div className="flex flex-wrap gap-2">
                    {allKeywords.map((keyword) => (
                      <Badge
                        key={keyword}
                        variant="secondary"
                        className="rounded-full px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-200"
                        onClick={() => copyToClipboard(keyword)}
                      >
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Scored Keywords */}
            {keywordResult?.scoredKeywords && keywordResult.scoredKeywords.length > 0 && (
              <Card className="rounded-3xl border-0 shadow-none bg-gray-50">
                <CardHeader className="px-8 pt-8 pb-0 flex flex-row items-center justify-between">
                  <CardTitle className="text-lg font-medium text-gray-900">热词评分</CardTitle>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSaveToMonitor}
                    disabled={selectedKeywords.size === 0 || loadingMonitors}
                    className="rounded-full px-4 py-2 h-auto text-xs"
                  >
                    {loadingMonitors ? "保存中..." : `保存到监控词库 (${selectedKeywords.size})`}
                  </Button>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  <KeywordScoreChart keywords={keywordResult.scoredKeywords} />
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500">
                          <th className="text-left py-2 px-2 font-medium">选择</th>
                          <th className="text-left py-2 px-2 font-medium">关键词</th>
                          {(["score", "searchVolume", "competition", "businessIntent"] as SortField[]).map((field) => (
                            <th
                              key={field}
                              className="text-left py-2 px-2 font-medium cursor-pointer hover:text-gray-900"
                              onClick={() => handleSort(field)}
                            >
                              {field === "score" && "综合热度"}
                              {field === "searchVolume" && "搜索量"}
                              {field === "competition" && "竞争度"}
                              {field === "businessIntent" && "商业意向"}
                              {sortField === field && (sortDirection === "desc" ? " ↓" : " ↑")}
                            </th>
                          ))}
                          <th className="text-left py-2 px-2 font-medium">状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedScoredKeywords.map((item) => (
                          <tr key={item.keyword} className="border-b border-gray-100 last:border-0 hover:bg-gray-100/50">
                            <td className="py-2 px-2">
                              <input
                                type="checkbox"
                                checked={selectedKeywords.has(item.keyword)}
                                onChange={() => toggleKeywordSelection(item.keyword)}
                                className="rounded border-gray-300"
                              />
                            </td>
                            <td className="py-2 px-2 font-medium text-gray-900">{item.keyword}</td>
                            <td className="py-2 px-2 text-amber-600">{renderStars(item.score)}</td>
                            <td className="py-2 px-2 text-gray-600">{renderStars(item.searchVolume)}</td>
                            <td className="py-2 px-2 text-gray-600">{renderStars(item.competition)}</td>
                            <td className="py-2 px-2 text-gray-600">{renderStars(item.businessIntent)}</td>
                            <td className="py-2 px-2">
                              {monitorKeywords.has(item.keyword) ? (
                                <span className="text-xs text-green-600 font-medium">已监控</span>
                              ) : (
                                <span className="text-xs text-gray-400">未监控</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Pain Points */}
            {allPainPoints.length > 0 && (
              <Card className="rounded-3xl border-0 shadow-none bg-gray-50">
                <CardHeader className="px-8 pt-8 pb-0">
                  <CardTitle className="text-lg font-medium text-gray-900">用户痛点</CardTitle>
                </CardHeader>
                <CardContent className="p-8">
                  <ul className="space-y-2">
                    {allPainPoints.map((point, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm text-gray-700">
                        <span className="w-5 h-5 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs flex-shrink-0">{idx + 1}</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Competitors */}
            {allCompetitors.length > 0 && (
              <Card className="rounded-3xl border-0 shadow-none bg-gray-50">
                <CardHeader className="px-8 pt-8 pb-0">
                  <CardTitle className="text-lg font-medium text-gray-900">潜在竞品 / 话题方向</CardTitle>
                  <p className="text-sm text-gray-500 mt-1">以下方向由 AI 根据输入推测，非平台真实搜索结果</p>
                </CardHeader>
                <CardContent className="p-8">
                  <div className="flex flex-wrap gap-2">
                    {allCompetitors.map((account) => (
                      <Badge
                        key={account}
                        variant="outline"
                        className="rounded-full px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-100"
                        onClick={() => copyToClipboard(account)}
                      >
                        {account}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Web Research Summary */}
            {researchResult?.summary && (
              <Card className="rounded-3xl border-0 shadow-none bg-gray-50">
                <CardHeader className="px-8 pt-8 pb-0">
                  <CardTitle className="text-lg font-medium text-gray-900">网页研究总结</CardTitle>
                </CardHeader>
                <CardContent className="p-8">
                  <p className="text-sm text-gray-700 leading-relaxed">{researchResult.summary}</p>
                  {researchResult.hotTopics.length > 0 && (
                    <div className="mt-4">
                      <span className="text-xs font-medium text-gray-400">热门话题：</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {researchResult.hotTopics.map((topic) => (
                          <Badge key={topic} variant="secondary" className="rounded-full text-xs">{topic}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Search Commands */}
            {keywordResult && (
              <Card className="rounded-3xl border-0 shadow-none bg-gray-50">
                <CardHeader className="px-8 pt-8 pb-0">
                  <CardTitle className="text-lg font-medium text-gray-900">平台搜索指令</CardTitle>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  {Object.entries(keywordResult.searchCommands).map(([platform, commands]) => (
                    <div key={platform}>
                      <h4 className="text-sm font-medium text-gray-900 mb-3">{platformLabels[platform] || platform}</h4>
                      <div className="flex flex-wrap gap-2">
                        {commands.map((cmd) => (
                          <Button
                            key={cmd}
                            variant="secondary"
                            size="sm"
                            onClick={() => copyToClipboard(cmd)}
                            className="rounded-full px-4 py-2 h-auto text-xs bg-white hover:bg-gray-100"
                          >
                            {cmd}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
