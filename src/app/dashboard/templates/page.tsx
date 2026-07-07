"use client";

import { Navbar } from "@/components/layout/Navbar";
import { useToast } from "@/components/ui/Toast";
import { useState } from "react";

const mockReplyTemplates = [
  { id: "1", name: "默认回复", content: "感谢您的关注！感兴趣的朋友可以看看我的主页介绍哦~", isDefault: true },
  { id: "2", name: "资料引导", content: "私信您详细资料，请查收~", isDefault: false },
  { id: "3", name: "置顶引导", content: "想了解更多可以看看我的置顶视频", isDefault: false },
  { id: "4", name: "交流邀请", content: "有问题欢迎私信交流", isDefault: false },
];

const mockDmTemplates = [
  { id: "1", name: "默认私信", content: "您好！看到您对我们的内容感兴趣，这里有一些详细资料供您参考", isDefault: true },
  { id: "2", name: "资料发送", content: "感谢您的关注！我整理了一份资料，希望能帮到您", isDefault: false },
  { id: "3", name: "进一步交流", content: "您好！我们可以进一步交流，看看怎么帮到您", isDefault: false },
];

export default function TemplatesPage() {
  const { addToast } = useToast();
  const [replyTemplates, setReplyTemplates] = useState(mockReplyTemplates);
  const [dmTemplates, setDmTemplates] = useState(mockDmTemplates);
  const [activeTab, setActiveTab] = useState<"reply" | "dm">("reply");
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ id: "", name: "", content: "", isDefault: false });

  const currentTemplates = activeTab === "reply" ? replyTemplates : dmTemplates;
  const setCurrentTemplates = activeTab === "reply" ? setReplyTemplates : setDmTemplates;

  const handleSave = () => {
    if (!editForm.name.trim() || !editForm.content.trim()) { addToast("请填写完整信息", "error"); return; }
    if (editForm.id) {
      setCurrentTemplates(currentTemplates.map((t) => t.id === editForm.id ? { ...t, name: editForm.name, content: editForm.content, isDefault: editForm.isDefault } : t));
      addToast("话术已更新", "success");
    } else {
      const newTemplate = { id: String(currentTemplates.length + 1), name: editForm.name, content: editForm.content, isDefault: editForm.isDefault };
      setCurrentTemplates([...currentTemplates, newTemplate]);
      addToast("话术已添加", "success");
    }
    setIsEditing(false);
    setEditForm({ id: "", name: "", content: "", isDefault: false });
  };

  const handleDelete = (id: string) => { setCurrentTemplates(currentTemplates.filter((t) => t.id !== id)); addToast("话术已删除", "success"); };
  const handleSetDefault = (id: string) => { setCurrentTemplates(currentTemplates.map((t) => ({ ...t, isDefault: t.id === id }))); addToast("默认话术已设置", "success"); };
  const openEdit = (template?: typeof mockReplyTemplates[0]) => {
    if (template) { setEditForm({ id: template.id, name: template.name, content: template.content, isDefault: template.isDefault }); }
    else { setEditForm({ id: "", name: "", content: "", isDefault: false }); }
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
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setIsEditing(false); }}
              className={`px-6 py-3 text-sm font-medium rounded-full transition-all active:scale-95 ${
                activeTab === tab
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tab === "reply" ? "评论回复话术" : "私信话术"}
              <span className="ml-2 text-xs opacity-60">{tab === "reply" ? replyTemplates.length : dmTemplates.length}</span>
            </button>
          ))}
        </div>

        {/* Edit Form */}
        {isEditing && (
          <div className="bg-gray-50 rounded-3xl p-8 mb-10">
            <h2 className="text-lg font-medium text-gray-900 mb-6">{editForm.id ? "编辑话术" : "新增话术"}</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-2">话术名称</label>
                <input
                  type="text"
                  placeholder="例如：默认回复"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="block w-full rounded-2xl bg-white border-0 px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-gray-200 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-2">话术内容</label>
                <textarea
                  rows={4}
                  placeholder="输入话术内容..."
                  value={editForm.content}
                  onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                  className="block w-full rounded-2xl bg-white border-0 px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-gray-200 transition-all resize-none"
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
                <button
                  onClick={handleSave}
                  className="px-6 py-2.5 text-sm font-medium text-white bg-gray-900 rounded-full hover:bg-gray-800 active:scale-95 transition-all"
                >
                  保存
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-6 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 active:scale-95 transition-all"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Template List */}
        <div className="bg-gray-50 rounded-3xl p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-gray-900">{activeTab === "reply" ? "评论回复话术" : "私信话术"}</h2>
            {!isEditing && (
              <button
                onClick={() => openEdit()}
                className="px-5 py-2.5 text-sm font-medium text-white bg-gray-900 rounded-full hover:bg-gray-800 active:scale-95 transition-all"
              >
                新增话术
              </button>
            )}
          </div>
          <div className="space-y-3">
            {currentTemplates.map((template) => (
              <div key={template.id} className="flex flex-col sm:flex-row sm:items-start justify-between p-5 bg-white rounded-2xl gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-900">{template.name}</span>
                    {template.isDefault && (
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">默认</span>
                    )}
                  </div>
                  <div className="mt-2 text-sm text-gray-600 bg-gray-50 p-4 rounded-2xl">{template.content}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!template.isDefault && (
                    <button
                      onClick={() => handleSetDefault(template.id)}
                      className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 active:scale-95 transition-all"
                    >
                      设为默认
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(template)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 active:scale-95 transition-all"
                  >
                    编辑
                  </button>
                  {!template.isDefault && (
                    <button
                      onClick={() => handleDelete(template.id)}
                      className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-full hover:bg-red-100 active:scale-95 transition-all"
                    >
                      删除
                    </button>
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
