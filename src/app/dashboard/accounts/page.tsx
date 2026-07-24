"use client";

import { Navbar } from "@/components/layout/Navbar";
import { useToast } from "@/components/ui/use-toast";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getErrorMessage } from "@/lib/errors";

type Platform = "DOUYIN" | "KUAISHOU" | "SHIPINHAO";
type AccountStatus = "ACTIVE" | "COOLING" | "DISABLED" | "EXPIRED";

interface SenderAccount {
  id: string;
  platform: Platform;
  label: string;
  proxyUrl: string | null;
  status: AccountStatus;
  healthScore: number;
  failCount: number;
  dailySent: number;
  dailyLimit: number;
  lastFailAt: string | null;
  lastSuccessAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const PLATFORM_LABELS: Record<Platform, string> = {
  DOUYIN: "抖音",
  KUAISHOU: "快手",
  SHIPINHAO: "视频号",
};

const STATUS_CONFIG: Record<AccountStatus, { label: string; className: string }> = {
  ACTIVE: { label: "正常", className: "bg-green-100 text-green-700" },
  COOLING: { label: "冷却中", className: "bg-yellow-100 text-yellow-700" },
  DISABLED: { label: "已禁用", className: "bg-gray-100 text-gray-500" },
  EXPIRED: { label: "已过期", className: "bg-red-100 text-red-700" },
};

const FILTER_OPTIONS = [
  { value: "ALL", label: "全部" },
  { value: "DOUYIN", label: "抖音" },
  { value: "KUAISHOU", label: "快手" },
  { value: "SHIPINHAO", label: "视频号" },
] as const;

type PlatformFilter = (typeof FILTER_OPTIONS)[number]["value"];

function healthScoreClass(score: number): string {
  if (score >= 70) return "text-green-600";
  if (score >= 30) return "text-yellow-600";
  return "text-red-600";
}

function formatTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const EMPTY_FORM = { id: "", label: "", cookies: "", proxyUrl: "", dailyLimit: "50" };

export default function AccountsPage() {
  const { addToast } = useToast();
  const [accounts, setAccounts] = useState<SenderAccount[]>([]);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("ALL");
  const [loading, setLoading] = useState(true);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM, platform: "DOUYIN" as Platform });
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SenderAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAccounts = useCallback(async (platform: PlatformFilter) => {
    const url =
      platform === "ALL"
        ? "/api/user/sender-accounts"
        : `/api/user/sender-accounts?platform=${platform}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "获取账号列表失败");
    }
    return (data.accounts || []) as SenderAccount[];
  }, []);

  useEffect(() => {
    let ignore = false;
    fetchAccounts(platformFilter)
      .then((list) => {
        if (!ignore) setAccounts(list);
      })
      .catch((error) => {
        if (!ignore) {
          console.error("Fetch sender accounts error:", error);
          addToast(getErrorMessage(error) || "加载账号列表失败", "error");
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [fetchAccounts, platformFilter, addToast]);

  const openEdit = (account?: SenderAccount) => {
    if (account) {
      setEditForm({
        id: account.id,
        platform: account.platform,
        label: account.label,
        cookies: "",
        proxyUrl: account.proxyUrl || "",
        dailyLimit: String(account.dailyLimit),
      });
    } else {
      setEditForm({ ...EMPTY_FORM, platform: "DOUYIN" });
    }
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!editForm.label.trim()) {
      addToast("请填写备注", "error");
      return;
    }
    if (!editForm.id && !editForm.cookies.trim()) {
      addToast("请填写 Cookies", "error");
      return;
    }
    const dailyLimit = parseInt(editForm.dailyLimit, 10);
    if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 500) {
      addToast("日限额需为 1-500 的整数", "error");
      return;
    }

    setSaving(true);
    try {
      let res: Response;
      if (editForm.id) {
        const body: Record<string, unknown> = {
          label: editForm.label.trim(),
          proxyUrl: editForm.proxyUrl.trim() || null,
          dailyLimit,
        };
        if (editForm.cookies.trim()) {
          body.cookies = editForm.cookies.trim();
        }
        res = await fetch(`/api/user/sender-accounts/${editForm.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch("/api/user/sender-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: editForm.platform,
            label: editForm.label.trim(),
            cookies: editForm.cookies.trim(),
            proxyUrl: editForm.proxyUrl.trim() || undefined,
            dailyLimit,
          }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "保存失败");
      }

      if (editForm.id) {
        setAccounts(accounts.map((a) => (a.id === editForm.id ? data.account : a)));
        addToast("账号已更新", "success");
      } else {
        setAccounts([data.account, ...accounts]);
        addToast("账号已添加", "success");
      }

      setIsEditing(false);
      setEditForm({ ...EMPTY_FORM, platform: "DOUYIN" });
    } catch (error) {
      addToast(getErrorMessage(error) || "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/user/sender-accounts/${deleteTarget.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "删除失败");
      }

      setAccounts(accounts.filter((a) => a.id !== deleteTarget.id));
      addToast("账号已删除", "success");
      setDeleteTarget(null);
    } catch (error) {
      addToast(getErrorMessage(error) || "删除失败", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (account: SenderAccount, status: AccountStatus, successMsg: string) => {
    try {
      const res = await fetch(`/api/user/sender-accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "操作失败");
      }

      setAccounts(accounts.map((a) => (a.id === account.id ? data.account : a)));
      addToast(successMsg, "success");
    } catch (error) {
      addToast(getErrorMessage(error) || "操作失败", "error");
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 lg:px-8 pt-24 pb-32">
        <div className="mb-16">
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">账号管理</h1>
          <p className="mt-2 text-base text-gray-400">
            账号池用于自动回复/私信的多账号轮换，健康度过低的账号会自动冷却
          </p>
        </div>

        {/* Platform Filter Tabs */}
        <div className="flex gap-2 mb-10">
          {FILTER_OPTIONS.map((option) => (
            <Button
              key={option.value}
              onClick={() => {
                if (platformFilter !== option.value) {
                  setLoading(true);
                  setPlatformFilter(option.value);
                }
              }}
              variant={platformFilter === option.value ? "default" : "secondary"}
              className="rounded-full px-6 py-3 h-auto text-sm"
            >
              {option.label}
            </Button>
          ))}
        </div>

        {/* Account List */}
        <Card className="rounded-3xl border-0 shadow-none bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between px-8 pt-8 pb-0">
            <CardTitle className="text-lg font-medium text-gray-900">账号池</CardTitle>
            <Button
              onClick={() => openEdit()}
              className="rounded-full px-5 py-2.5 h-auto text-sm"
            >
              新增账号
            </Button>
          </CardHeader>
          <CardContent className="p-8">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-2xl" />
                ))}
              </div>
            ) : accounts.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                暂无账号，点击右上角新增
              </div>
            ) : (
              <div className="bg-white rounded-2xl px-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>备注</TableHead>
                      <TableHead>平台</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>健康度</TableHead>
                      <TableHead>今日已发</TableHead>
                      <TableHead>连续失败</TableHead>
                      <TableHead>最近成功</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((account) => {
                      const status = STATUS_CONFIG[account.status];
                      return (
                        <TableRow key={account.id}>
                          <TableCell className="font-medium text-gray-900 max-w-[160px] truncate">
                            {account.label}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="rounded-full">
                              {PLATFORM_LABELS[account.platform]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={`rounded-full ${status.className}`}>
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className={`font-medium ${healthScoreClass(account.healthScore)}`}>
                              {account.healthScore}
                            </span>
                          </TableCell>
                          <TableCell className="text-gray-600">
                            {account.dailySent}/{account.dailyLimit}
                          </TableCell>
                          <TableCell className="text-gray-600">{account.failCount}</TableCell>
                          <TableCell className="text-gray-600">
                            {formatTime(account.lastSuccessAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {account.status === "COOLING" && (
                                <Button
                                  variant="secondary"
                                  onClick={() => handleStatusChange(account, "ACTIVE", "账号已恢复")}
                                  className="rounded-full px-4 py-2 h-auto text-sm"
                                >
                                  恢复
                                </Button>
                              )}
                              {account.status === "ACTIVE" && (
                                <Button
                                  variant="secondary"
                                  onClick={() => handleStatusChange(account, "DISABLED", "账号已禁用")}
                                  className="rounded-full px-4 py-2 h-auto text-sm"
                                >
                                  禁用
                                </Button>
                              )}
                              {account.status === "DISABLED" && (
                                <Button
                                  variant="secondary"
                                  onClick={() => handleStatusChange(account, "ACTIVE", "账号已启用")}
                                  className="rounded-full px-4 py-2 h-auto text-sm"
                                >
                                  启用
                                </Button>
                              )}
                              <Button
                                variant="secondary"
                                onClick={() => openEdit(account)}
                                className="rounded-full px-4 py-2 h-auto text-sm"
                              >
                                编辑
                              </Button>
                              <Button
                                variant="destructive"
                                onClick={() => setDeleteTarget(account)}
                                className="rounded-full px-4 py-2 h-auto text-sm"
                              >
                                删除
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Create / Edit Dialog */}
      <Dialog open={isEditing} onOpenChange={(open) => !open && setIsEditing(false)}>
        <DialogContent className="sm:max-w-lg rounded-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editForm.id ? "编辑账号" : "新增账号"}</DialogTitle>
            <DialogDescription>
              {editForm.id
                ? "修改账号信息，Cookies 留空表示不修改。"
                : "添加一个用于自动回复/私信的平台账号。"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {!editForm.id && (
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-2">平台</label>
                <Select
                  value={editForm.platform}
                  onValueChange={(value) => setEditForm({ ...editForm, platform: value as Platform })}
                >
                  <SelectTrigger className="w-full rounded-2xl bg-gray-50 border-0 px-4 py-3 h-auto text-gray-900 text-sm">
                    <SelectValue placeholder="选择平台" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PLATFORM_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-2">备注</label>
              <Input
                type="text"
                placeholder="例如：抖音大号"
                value={editForm.label}
                onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                className="rounded-2xl bg-gray-50 border-0 px-4 py-3 h-auto text-gray-900 text-sm focus:ring-2 focus:ring-gray-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-2">Cookies</label>
              <Textarea
                rows={4}
                placeholder={
                  editForm.id
                    ? "留空表示不修改；账号过期时在此粘贴新的 Cookies"
                    : "从浏览器开发者工具（F12 → Network → 请求头 Cookie）复制完整 Cookies"
                }
                value={editForm.cookies}
                onChange={(e) => setEditForm({ ...editForm, cookies: e.target.value })}
                className="rounded-2xl bg-gray-50 border-0 px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-gray-200 resize-none"
              />
              {editForm.id && (
                <p className="mt-1.5 text-xs text-gray-400">留空表示不修改</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-2">代理 URL（选填）</label>
              <Input
                type="text"
                placeholder="例如：http://127.0.0.1:7890"
                value={editForm.proxyUrl}
                onChange={(e) => setEditForm({ ...editForm, proxyUrl: e.target.value })}
                className="rounded-2xl bg-gray-50 border-0 px-4 py-3 h-auto text-gray-900 text-sm focus:ring-2 focus:ring-gray-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-2">日限额（1-500）</label>
              <Input
                type="number"
                min={1}
                max={500}
                value={editForm.dailyLimit}
                onChange={(e) => setEditForm({ ...editForm, dailyLimit: e.target.value })}
                className="rounded-2xl bg-gray-50 border-0 px-4 py-3 h-auto text-gray-900 text-sm focus:ring-2 focus:ring-gray-200"
              />
            </div>
          </div>

          <DialogFooter className="flex gap-3 sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => setIsEditing(false)}
              disabled={saving}
              className="rounded-full px-6 py-2.5 h-auto text-sm"
            >
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="rounded-full px-6 py-2.5 h-auto text-sm"
            >
              {saving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除账号「{deleteTarget?.label}」吗？此操作无法撤销。
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
