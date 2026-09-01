"use client";

import { useCallback, useEffect, useState } from "react";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { getErrorMessage } from "@/lib/errors";

type MonitorKeyword = {
  id: string;
  keyword: string;
  source: string | null;
  createdAt: string;
};

export function MonitorKeywordsSection() {
  const { addToast } = useToast();
  const [items, setItems] = useState<MonitorKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<MonitorKeyword | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 仅负责拉取数据，不写 state，方便 effect 与删除后刷新复用
  const fetchKeywords = useCallback(async (): Promise<MonitorKeyword[]> => {
    const res = await fetch("/api/keywords/monitor");
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "加载监控词库失败");
    }
    return Array.isArray(data.items) ? data.items : [];
  }, []);

  useEffect(() => {
    let ignore = false;

    fetchKeywords()
      .then((items) => {
        if (!ignore) setItems(items);
      })
      .catch((err) => {
        if (!ignore) console.error("Fetch monitor keywords error:", err);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [fetchKeywords]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/keywords/monitor", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: [deleteTarget.keyword] }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "删除失败");
      }

      addToast("关键词已删除", "success");
      setDeleteTarget(null);
      setItems(await fetchKeywords());
    } catch (error) {
      addToast(getErrorMessage(error) || "删除失败", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <CollapsibleCard title="监控词库" defaultOpen={false}>
      <p className="text-sm text-gray-500 mb-4">
        AI 获客助手研究中添加的监控关键词，系统会持续用它们搜索相关视频。
      </p>
      {loading ? (
        <p className="text-sm text-gray-400">加载中...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400">暂无监控关键词，可在 AI 获客助手的研究结果中添加</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between px-4 py-3 bg-white rounded-2xl text-sm"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-900">{item.keyword}</span>
                <span className="text-xs text-gray-400">
                  添加于 {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteTarget(item)}
                disabled={deleting}
                className="rounded-full px-3 py-1 h-auto text-xs text-red-500 hover:text-red-700"
              >
                删除
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* 删除确认对话框 */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除关键词「{deleteTarget?.keyword}」吗？删除后系统将不再用它搜索视频。
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
    </CollapsibleCard>
  );
}
