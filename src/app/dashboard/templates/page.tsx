"use client";

import { Navbar } from "@/components/layout/Navbar";
import { useToast } from "@/components/ui/use-toast";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
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
import { Sparkles } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";

interface Template {
  id: string;
  name: string;
  content: string;
  isDefault: boolean;
  createdAt?: string;
}

interface GeneratedTemplate {
  name: string;
  content: string;
}

export default function TemplatesPage() {
  const { data: session } = useSession();
  const { addToast } = useToast();
  const [replyTemplates, setReplyTemplates] = useState<Template[]>([]);
  const [dmTemplates, setDmTemplates] = useState<Template[]>([]);
  const [activeTab, setActiveTab] = useState<"reply" | "dm">("reply");
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ id: "", name: "", content: "", isDefault: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);

  // AI 生成话术
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [generatedTemplates, setGeneratedTemplates] = useState<GeneratedTemplate[]>([]);
  const [selectedGenerated, setSelectedGenerated] = useState<Set<number>>(new Set());

  const currentTemplates = activeTab === "reply" ? replyTemplates : dmTemplates;
  const setCurrentTemplates = activeTab === "reply" ? setReplyTemplates : setDmTemplates;

  interface FetchTemplatesResult {
    replyTemplates: Template[];
    dmTemplates: Template[];
  }

  const fetchTemplatesData = useCallback(async (): Promise<FetchTemplatesResult> => {
    const [replyRes, dmRes] = await Promise.all([
      fetch("/api/templates?type=reply"),
      fetch("/api/templates?type=dm"),
    ]);

    if (!replyRes.ok || !dmRes.ok) {
      throw new Error("获取话术模板失败");
    }

    const [replyData, dmData] = await Promise.all([replyRes.json(), dmRes.json()]);
    return {
      replyTemplates: replyData.templates || [],
      dmTemplates: dmData.templates || [],
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    fetchTemplatesData()
      .then((result) => {
        if (!ignore) {
          setReplyTemplates(result.replyTemplates);
          setDmTemplates(result.dmTemplates);
        }
      })
      .catch((error) => {
        if (!ignore) {
          console.error("Fetch templates error:", error);
          addToast("加载话术模板失败", "error");
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [fetchTemplatesData, addToast]);

  const aiPromptInitialized = useRef(false);
  useLayoutEffect(() => {
    if (session?.user?.industryContext && !aiPromptInitialized.current) {
      aiPromptInitialized.current = true;
      setAiPrompt(session.user.industryContext);
    }
  }, [session?.user?.industryContext]);

  const handleSave = async () => {
    if (!editForm.name.trim() || !editForm.content.trim()) {
      addToast("请填写完整信息", "error");
      return;
    }

    setSaving(true);
    try {
      const url = editForm.id ? `/api/templates/${editForm.id}` : "/api/templates";
      const method = editForm.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: activeTab,
          name: editForm.name,
          content: editForm.content,
          isDefault: editForm.isDefault,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "保存失败");
      }

      if (editForm.id) {
        setCurrentTemplates(
          currentTemplates.map((t) =>
            t.id === editForm.id
              ? {
                  ...t,
                  name: data.template.name,
                  content: data.template.content,
                  isDefault: data.template.isDefault,
                }
              : data.template.isDefault && t.isDefault && t.id !== editForm.id
                ? { ...t, isDefault: false }
                : t
          )
        );
        addToast("话术已更新", "success");
      } else {
        if (data.template.isDefault) {
          setCurrentTemplates(
            [data.template, ...currentTemplates.map((t) => ({ ...t, isDefault: false }))]
          );
        } else {
          setCurrentTemplates([data.template, ...currentTemplates]);
        }
        addToast("话术已添加", "success");
      }

      setIsEditing(false);
      setEditForm({ id: "", name: "", content: "", isDefault: false });
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
      const res = await fetch(`/api/templates/${deleteTarget.id}?type=${activeTab}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "删除失败");
      }

      setCurrentTemplates(currentTemplates.filter((t) => t.id !== deleteTarget.id));
      addToast("话术已删除", "success");
      setDeleteTarget(null);
    } catch (error) {
      addToast(getErrorMessage(error) || "删除失败", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    const template = currentTemplates.find((t) => t.id === id);
    if (!template) return;

    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: activeTab,
          name: template.name,
          content: template.content,
          isDefault: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "设置默认失败");
      }

      setCurrentTemplates(
        currentTemplates.map((t) => ({
          ...t,
          isDefault: t.id === id,
        }))
      );
      addToast("默认话术已设置", "success");
    } catch (error) {
      addToast(getErrorMessage(error) || "设置默认失败", "error");
    }
  };

  const openAiDialog = () => {
    setGeneratedTemplates([]);
    setSelectedGenerated(new Set());
    setIsAiDialogOpen(true);
  };

  const handleGenerateTemplates = async () => {
    if (!aiPrompt.trim()) {
      addToast("请输入业务场景或提示词", "error");
      return;
    }

    setAiGenerating(true);
    try {
      const res = await fetch("/api/templates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: activeTab, prompt: aiPrompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "生成失败");
      }
      const templates = (data.templates || []) as GeneratedTemplate[];
      setGeneratedTemplates(templates);
      // 默认全选
      setSelectedGenerated(new Set(templates.map((_, i) => i)));
      addToast(`已生成 ${data.templates?.length || 0} 条话术`, "success");
    } catch (error) {
      addToast(getErrorMessage(error) || "生成话术失败", "error");
    } finally {
      setAiGenerating(false);
    }
  };

  const toggleGeneratedSelection = (index: number) => {
    setSelectedGenerated((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleSelectAllGenerated = () => {
    if (selectedGenerated.size === generatedTemplates.length) {
      setSelectedGenerated(new Set());
    } else {
      setSelectedGenerated(new Set(generatedTemplates.map((_, i) => i)));
    }
  };

  const handleSaveGenerated = async () => {
    if (selectedGenerated.size === 0) {
      addToast("请至少选择一条话术", "error");
      return;
    }

    const templatesToSave = generatedTemplates
      .filter((_, i) => selectedGenerated.has(i))
      .map((t) => ({ name: t.name, content: t.content }));

    setSaving(true);
    try {
      const res = await fetch("/api/templates/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: activeTab, templates: templatesToSave }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "保存失败");
      }

      setCurrentTemplates([...(data.templates || []), ...currentTemplates]);
      setIsAiDialogOpen(false);
      setGeneratedTemplates([]);
      setSelectedGenerated(new Set());
      addToast(`已保存 ${data.templates?.length || 0} 条话术`, "success");
    } catch (error) {
      addToast(getErrorMessage(error) || "保存话术失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (template?: Template) => {
    if (template) {
      setEditForm({ id: template.id, name: template.name, content: template.content, isDefault: template.isDefault });
    } else {
      setEditForm({ id: "", name: "", content: "", isDefault: false });
    }
    setIsEditing(true);
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 lg:px-8 pt-24 pb-32">
        <div className="mb-16">
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">话术管理</h1>
          <p className="mt-2 text-base text-gray-400">管理评论回复和私信的话术模板</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-10">
          {(["reply", "dm"] as const).map((tab) => (
            <Button
              key={tab}
              onClick={() => { setActiveTab(tab); setIsEditing(false); }}
              variant={activeTab === tab ? "default" : "secondary"}
              className="rounded-full px-6 py-3 h-auto text-sm"
            >
              {tab === "reply" ? "评论回复话术" : "私信话术"}
              <span className="ml-2 text-xs opacity-60">
                {tab === "reply" ? replyTemplates.length : dmTemplates.length}
              </span>
            </Button>
          ))}
        </div>

        {/* Edit Form */}
        {isEditing && (
          <Card className="mb-10 rounded-3xl border-0 shadow-none bg-gray-50">
            <CardContent className="p-8">
              <h2 className="text-lg font-medium text-gray-900 mb-6">
                {editForm.id ? "编辑话术" : "新增话术"}
              </h2>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-2">话术名称</label>
                  <Input
                    type="text"
                    placeholder="例如：默认回复"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="rounded-2xl bg-white border-0 px-4 py-3 h-auto text-gray-900 text-sm focus:ring-2 focus:ring-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-2">话术内容</label>
                  <Textarea
                    rows={4}
                    placeholder="输入话术内容..."
                    value={editForm.content}
                    onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                    className="rounded-2xl bg-white border-0 px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-gray-200 resize-none"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="isDefault"
                    checked={editForm.isDefault}
                    onChange={(e) => setEditForm({ ...editForm, isDefault: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-200"
                  />
                  <label htmlFor="isDefault" className="text-sm text-gray-500">设为默认话术</label>
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-full px-6 py-2.5 h-auto text-sm"
                  >
                    {saving ? "保存中..." : "保存"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setIsEditing(false)}
                    disabled={saving}
                    className="rounded-full px-6 py-2.5 h-auto text-sm"
                  >
                    取消
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Template List */}
        <Card className="rounded-3xl border-0 shadow-none bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between px-8 pt-8 pb-0">
            <CardTitle className="text-lg font-medium text-gray-900">
              {activeTab === "reply" ? "评论回复话术" : "私信话术"}
            </CardTitle>
            {!isEditing && (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={openAiDialog}
                  className="rounded-full px-5 py-2.5 h-auto text-sm"
                >
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  AI 生成话术
                </Button>
                <Button
                  onClick={() => openEdit()}
                  className="rounded-full px-5 py-2.5 h-auto text-sm"
                >
                  新增话术
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-8">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-2xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {currentTemplates.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 text-sm">
                    暂无话术模板，点击右上角新增
                  </div>
                ) : (
                  currentTemplates.map((template) => (
                    <Card key={template.id} className="rounded-2xl border-0 shadow-sm">
                      <CardContent className="p-5">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <span className="font-medium text-gray-900">{template.name}</span>
                              {template.isDefault && (
                                <Badge variant="secondary" className="rounded-full">默认</Badge>
                              )}
                            </div>
                            <div className="mt-2 text-sm text-gray-600 bg-gray-50 p-4 rounded-2xl">{template.content}</div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {!template.isDefault && (
                              <Button
                                variant="secondary"
                                onClick={() => handleSetDefault(template.id)}
                                className="rounded-full px-4 py-2 h-auto text-sm"
                              >
                                设为默认
                              </Button>
                            )}
                            <Button
                              variant="secondary"
                              onClick={() => openEdit(template)}
                              className="rounded-full px-4 py-2 h-auto text-sm"
                            >
                              编辑
                            </Button>
                            {!template.isDefault && (
                              <Button
                                variant="destructive"
                                onClick={() => setDeleteTarget(template)}
                                className="rounded-full px-4 py-2 h-auto text-sm"
                              >
                                删除
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除话术「{deleteTarget?.name}」吗？此操作无法撤销。
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

      {/* AI Generate Dialog */}
      <Dialog open={isAiDialogOpen} onOpenChange={(open) => !open && setIsAiDialogOpen(false)}>
        <DialogContent className="sm:max-w-2xl rounded-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI 生成话术</DialogTitle>
            <DialogDescription>
              输入业务场景或提示词，AI 会生成一组{activeTab === "reply" ? "评论回复" : "私信"}话术。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-2">业务场景 / 提示词</label>
              <Textarea
                rows={4}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="例如：荆州贷款中介，主营公积金重组贷款、资金过桥，客户为 30-45 岁公职人员"
                className="rounded-2xl bg-white border-0 px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-gray-200 resize-none"
              />
              <p className="mt-1.5 text-xs text-gray-400">
                留空将使用个人信息中设置的业务场景
              </p>
            </div>

            <Button
              onClick={handleGenerateTemplates}
              disabled={aiGenerating || !aiPrompt.trim()}
              className="rounded-full px-6 py-2.5 h-auto text-sm w-full sm:w-auto"
            >
              {aiGenerating ? "生成中..." : "生成话术"}
            </Button>

            {generatedTemplates.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">生成结果</span>
                  <button
                    type="button"
                    onClick={toggleSelectAllGenerated}
                    className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2"
                  >
                    {selectedGenerated.size === generatedTemplates.length ? "取消全选" : "全选"}
                  </button>
                </div>

                {generatedTemplates.map((template, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-2xl border transition-colors cursor-pointer ${
                      selectedGenerated.has(index)
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-700 border-gray-100 hover:border-gray-300"
                    }`}
                    onClick={() => toggleGeneratedSelection(index)}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedGenerated.has(index)}
                        onChange={() => toggleGeneratedSelection(index)}
                        className="mt-1 w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-200"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm">{template.name}</div>
                        <div className={`mt-1 text-sm ${selectedGenerated.has(index) ? "text-gray-200" : "text-gray-600"}`}>
                          {template.content}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-3 sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => setIsAiDialogOpen(false)}
              disabled={saving || aiGenerating}
              className="rounded-full px-6 py-2.5 h-auto text-sm"
            >
              取消
            </Button>
            <Button
              onClick={handleSaveGenerated}
              disabled={saving || selectedGenerated.size === 0}
              className="rounded-full px-6 py-2.5 h-auto text-sm"
            >
              {saving ? "保存中..." : `添加选中的 ${selectedGenerated.size} 条话术`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
