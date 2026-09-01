"use client";

import { Navbar } from "@/components/layout/Navbar";
import { useToast } from "@/components/ui/use-toast";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { downloadCSV } from "@/lib/csv";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const platforms = [
  { id: "DOUYIN", name: "抖音", abbr: "抖" },
  { id: "KUAISHOU", name: "快手", abbr: "快" },
  { id: "SHIPINHAO", name: "视频号", abbr: "视" },
];

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  MONITORING: { label: "监控中", variant: "default" },
  PAUSED: { label: "已暂停", variant: "secondary" },
  ERROR: { label: "异常", variant: "destructive" },
};

interface KeywordMonitor {
  id: string;
  keyword: string;
}

interface Video {
  id: string;
  url: string;
  platform: string;
  title: string;
  author: string;
  status: string;
  comments: number;
  highIntent: number;
  keywordMonitor: KeywordMonitor | null;
  lastScrapedAt: string | null;
  createdAt: string;
}

function formatLastScraped(dateString: string | null) {
  if (!dateString) return '尚未抓取';
  const date = new Date(dateString);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return '刚刚抓取';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前抓取`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前抓取`;
  return `${Math.floor(diff / 86400)} 天前抓取`;
}

export default function VideosPage() {
  const { addToast } = useToast();
  const [videos, setVideos] = useState<Video[]>([]);
  const [keywordMonitors, setKeywordMonitors] = useState<KeywordMonitor[]>([]);
  const [selectedKeywordMonitorId, setSelectedKeywordMonitorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 重试计数：点击重试时 +1，驱动下方 effect 重新拉取
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState("DOUYIN");
  const [deleteTarget, setDeleteTarget] = useState<Video | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [scrapingIds, setScrapingIds] = useState<Set<string>>(new Set());

  const fetchVideosData = useCallback(async (): Promise<Video[]> => {
    const res = await fetch('/api/videos');
    if (!res.ok) throw new Error('获取视频列表失败');
    const data = await res.json();
    return data.videos || [];
  }, []);

  const fetchKeywordMonitors = useCallback(async (): Promise<KeywordMonitor[]> => {
    const res = await fetch('/api/keywords/monitor');
    if (!res.ok) throw new Error('获取监控词库失败');
    const data = await res.json();
    return data.items || [];
  }, []);

  const exportToCSV = () => {
    if (videos.length === 0) {
      addToast('暂无视频可导出', 'error');
      return;
    }
    const rows: string[][] = [
      ['平台', '标题', '作者', '状态', '评论数', '高意向', '最近抓取', '链接'],
    ];
    videos.forEach((video) => {
      const platform = platforms.find((p) => p.id === video.platform)?.name || video.platform;
      const status = statusMap[video.status]?.label || video.status;
      rows.push([
        platform,
        video.title,
        video.author,
        status,
        String(video.comments),
        String(video.highIntent),
        formatLastScraped(video.lastScrapedAt),
        video.url,
      ]);
    });
    downloadCSV(rows, `监控视频_${new Date().toISOString().slice(0, 10)}.csv`);
    addToast('视频列表已导出', 'success');
  };

  useEffect(() => {
    let ignore = false;
    Promise.all([fetchVideosData(), fetchKeywordMonitors()])
      .then(([items, monitors]) => {
        if (!ignore) {
          setVideos(items);
          setKeywordMonitors(monitors);
          setError(null);
        }
      })
      .catch((error) => {
        if (!ignore) {
          console.error('Fetch videos error:', error);
          setError('获取视频列表失败');
          addToast('获取视频列表失败', 'error');
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [fetchVideosData, fetchKeywordMonitors, addToast, reloadKey]);

  // 重试：重置状态后触发重新拉取
  const handleRetry = () => {
    setError(null);
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  const handleAddVideo = async () => {
    if (!newUrl.trim()) { addToast("请输入视频链接", "error"); return; }

    setSubmitting(true);
    try {
      const endpoint = selectedKeywordMonitorId ? '/api/videos/from-keyword' : '/api/videos';
      const body: Record<string, string> = { url: newUrl, platform: selectedPlatform };
      if (selectedKeywordMonitorId) {
        body.keywordMonitorId = selectedKeywordMonitorId;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || '添加失败', 'error');
        return;
      }

      setVideos([data.video, ...videos]);
      setNewUrl("");
      setSelectedKeywordMonitorId("");
      const msg = data.video.comments > 0
        ? `视频添加成功，已抓取 ${data.video.comments} 条评论`
        : '视频添加成功，开始监控';
      addToast(msg, "success");
    } catch (error) {
      console.error('Add video error:', error);
      addToast('添加视频失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "MONITORING" ? "PAUSED" : "MONITORING";
    try {
      const res = await fetch(`/api/videos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || '更新失败', 'error');
        return;
      }

      setVideos(videos.map((v) => v.id === id ? { ...v, status: newStatus } : v));
      addToast("状态已更新", "success");
    } catch (error) {
      console.error('Update video error:', error);
      addToast('更新状态失败', 'error');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/videos/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || '删除失败', 'error');
        return;
      }

      setVideos(videos.filter((v) => v.id !== deleteTarget.id));
      addToast('视频已删除', 'success');
      setDeleteTarget(null);
    } catch (error) {
      console.error('Delete video error:', error);
      addToast('删除视频失败', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleScrapeNow = async (id: string) => {
    setScrapingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/videos/${id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || '触发抓取失败', 'error');
        return;
      }
      addToast('已加入抓取队列，稍后刷新查看', 'success');
    } catch (error) {
      console.error('Scrape now error:', error);
      addToast('触发抓取失败', 'error');
    } finally {
      setScrapingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
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
        <Card className="rounded-3xl border-0 shadow-none bg-gray-50 mb-10">
          <CardContent className="p-8">
            <h2 className="text-lg font-medium text-gray-900 mb-6">添加新视频</h2>
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 w-full">
                <label className="block text-sm font-medium text-gray-500 mb-2">视频链接</label>
                <Input
                  type="text"
                  placeholder="粘贴抖音 / 快手 / 视频号链接"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="rounded-2xl bg-white border-0 px-4 py-3 h-auto text-gray-900 text-sm focus:ring-2 focus:ring-gray-200"
                />
              </div>
              <div className="w-full sm:w-44">
                <label className="block text-sm font-medium text-gray-500 mb-2">平台</label>
                <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                  <SelectTrigger className="rounded-2xl bg-white border-0 px-4 py-3 h-auto text-gray-900 text-sm focus:ring-2 focus:ring-gray-200">
                    <SelectValue placeholder="选择平台" />
                  </SelectTrigger>
                  <SelectContent>
                    {platforms.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-48">
                <label className="block text-sm font-medium text-gray-500 mb-2">关联监控词（可选）</label>
                <Select value={selectedKeywordMonitorId} onValueChange={setSelectedKeywordMonitorId}>
                  <SelectTrigger className="rounded-2xl bg-white border-0 px-4 py-3 h-auto text-gray-900 text-sm focus:ring-2 focus:ring-gray-200">
                    <SelectValue placeholder="选择监控词" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">无</SelectItem>
                    {keywordMonitors.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.keyword}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleAddVideo}
                disabled={submitting}
                className="w-full sm:w-auto px-7 py-3 h-auto rounded-full text-sm font-medium"
              >
                {submitting ? "添加中..." : "添加监控"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Video List */}
        <Card className="rounded-3xl border-0 shadow-none bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between px-8 pt-8 pb-0">
            <CardTitle className="text-lg font-medium text-gray-900">监控中的视频</CardTitle>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={exportToCSV}
                disabled={videos.length === 0}
                className="rounded-full px-4 py-2 h-auto text-xs text-gray-500"
              >
                导出 CSV
              </Button>
              <span className="text-sm text-gray-400">{videos.length} 个</span>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-2xl" />
                ))}
              </div>
            ) : error ? (
              <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-600 flex items-center justify-between gap-4">
                <span>{error}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRetry}
                  className="rounded-full px-5 py-2 h-auto text-sm flex-shrink-0"
                >
                  重试
                </Button>
              </div>
            ) : videos.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">📹</span>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">还没有监控视频</h3>
                <p className="text-sm text-gray-400">添加第一个视频链接，开始自动监控评论区</p>
              </div>
            ) : (
              <div className="space-y-3">
                {videos.map((video) => {
                  const platform = platforms.find((p) => p.id === video.platform);
                  const status = statusMap[video.status] || { label: video.status, variant: "outline" };
                  return (
                    <Card
                      key={video.id}
                      className="rounded-2xl border-0 shadow-sm hover:shadow-[0_4px_24px_rgba(0,0,0,0.06)] transition-all"
                    >
                      <CardContent className="p-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs font-medium">
                                {platform?.abbr}
                              </span>
                              <span className="font-medium text-gray-900 truncate">{video.title}</span>
                              <Badge variant={status.variant} className="rounded-full">{status.label}</Badge>
                              {video.keywordMonitor && (
                                <Badge variant="outline" className="rounded-full">关键词：{video.keywordMonitor.keyword}</Badge>
                              )}
                            </div>
                            <div className="mt-2 text-sm text-gray-400">
                              {video.author} · {video.comments} 条评论 · {video.highIntent} 高意向 · {formatLastScraped(video.lastScrapedAt)}
                            </div>
                            <div className="mt-1 text-xs text-gray-300 truncate">{video.url}</div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button asChild className="rounded-full px-4 py-2 h-auto text-sm">
                              <Link href={`/dashboard/comments?videoId=${video.id}`}>查看评论</Link>
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => handleScrapeNow(video.id)}
                              disabled={scrapingIds.has(video.id)}
                              className="rounded-full px-4 py-2 h-auto text-sm"
                            >
                              {scrapingIds.has(video.id) ? "抓取中..." : "立即抓取"}
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => toggleStatus(video.id, video.status)}
                              className="rounded-full px-4 py-2 h-auto text-sm"
                            >
                              {video.status === "MONITORING" ? "暂停" : "恢复"}
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => setDeleteTarget(video)}
                              className="rounded-full px-4 py-2 h-auto text-sm"
                            >
                              删除
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除视频「{deleteTarget?.title}」吗？相关评论、回复和私信记录也会一并删除，此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-3 sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="rounded-full px-6 py-2.5 h-auto text-sm"
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
              className="rounded-full px-6 py-2.5 h-auto text-sm"
            >
              {deleting ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
