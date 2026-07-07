"use client";

import { Navbar } from "@/components/layout/Navbar";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useState } from "react";

const mockReplyTemplates = [
  {
    id: "1",
    name: "默认回复",
    content: "感谢您的关注！感兴趣的朋友可以看看我的主页介绍哦~",
    isDefault: true,
  },
  {
    id: "2",
    name: "资料引导",
    content: "私信您详细资料，请查收~",
    isDefault: false,
  },
  {
    id: "3",
    name: "置顶引导",
    content: "想了解更多可以看看我的置顶视频",
    isDefault: false,
  },
  {
    id: "4",
    name: "交流邀请",
    content: "有问题欢迎私信交流",
    isDefault: false,
  },
];

const mockDmTemplates = [
  {
    id: "1",
    name: "默认私信",
    content: "您好！看到您对我们的内容感兴趣，这里有一些详细资料供您参考",
    isDefault: true,
  },
  {
    id: "2",
    name: "资料发送",
    content: "感谢您的关注！我整理了一份资料，希望能帮到您",
    isDefault: false,
  },
  {
    id: "3",
    name: "进一步交流",
    content: "您好！我们可以进一步交流，看看怎么帮到您",
    isDefault: false,
  },
];

export default function TemplatesPage() {
  const { addToast } = useToast();
  const [replyTemplates, setReplyTemplates] = useState(mockReplyTemplates);
  const [dmTemplates, setDmTemplates] = useState(mockDmTemplates);
  const [activeTab, setActiveTab] = useState<"reply" | "dm">("reply");

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    id: "",
    name: "",
    content: "",
    isDefault: false,
  });

  const currentTemplates = activeTab === "reply" ? replyTemplates : dmTemplates;
  const setCurrentTemplates = activeTab === "reply" ? setReplyTemplates : setDmTemplates;

  const handleSave = () => {
    if (!editForm.name.trim() || !editForm.content.trim()) {
      addToast("请填写完整信息", "error");
      return;
    }

    if (editForm.id) {
      // 编辑
      setCurrentTemplates(
        currentTemplates.map((t) =>
          t.id === editForm.id
            ? { ...t, name: editForm.name, content: editForm.content, isDefault: editForm.isDefault }
            : t
        )
      );
      addToast("话术已更新", "success");
    } else {
      // 新增
      const newTemplate = {
        id: String(currentTemplates.length + 1),
        name: editForm.name,
        content: editForm.content,
        isDefault: editForm.isDefault,
      };
      setCurrentTemplates([...currentTemplates, newTemplate]);
      addToast("话术已添加", "success");
    }
    setIsEditing(false);
    setEditForm({ id: "", name: "", content: "", isDefault: false });
  };

  const handleDelete = (id: string) => {
    setCurrentTemplates(currentTemplates.filter((t) => t.id !== id));
    addToast("话术已删除", "success");
  };

  const handleSetDefault = (id: string) => {
    setCurrentTemplates(
      currentTemplates.map((t) => ({ ...t, isDefault: t.id === id }))
    );
    addToast("默认话术已设置", "success");
  };

  const openEdit = (template?: (typeof mockReplyTemplates)[0]) => {
    if (template) {
      setEditForm({
        id: template.id,
        name: template.name,
        content: template.content,
        isDefault: template.isDefault,
      });
    } else {
      setEditForm({ id: "", name: "", content: "", isDefault: false });
    }
    setIsEditing(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">话术管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            管理评论回复和私信的话术模板
          </p>
        </div>

        {/* 标签切换 */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={activeTab === "reply" ? "primary" : "ghost"}
            onClick={() => {
              setActiveTab("reply");
              setIsEditing(false);
            }}
          >
            评论回复话术 ({replyTemplates.length})
          </Button>
          <Button
            variant={activeTab === "dm" ? "primary" : "ghost"}
            onClick={() => {
              setActiveTab("dm");
              setIsEditing(false);
            }}
          >
            私信话术 ({dmTemplates.length})
          </Button>
        </div>

        {/* 编辑/新增表单 */}
        {isEditing && (
          <Card className="mb-8">
            <CardHeader title={editForm.id ? "编辑话术" : "新增话术"} />
            <CardBody>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    话术名称
                  </label>
                  <Input
                    placeholder="例如：默认回复"
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    话术内容
                  </label>
                  <textarea
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    rows={4}
                    placeholder="输入话术内容..."
                    value={editForm.content}
                    onChange={(e) =>
                      setEditForm({ ...editForm, content: e.target.value })
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isDefault"
                    checked={editForm.isDefault}
                    onChange={(e) =>
                      setEditForm({ ...editForm, isDefault: e.target.checked })
                    }
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="isDefault" className="text-sm text-gray-700">
                    设为默认话术
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave}>保存</Button>
                  <Button variant="ghost" onClick={() => setIsEditing(false)}>
                    取消
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        )}

        {/* 话术列表 */}
        <Card>
          <CardHeader
            title={activeTab === "reply" ? "评论回复话术" : "私信话术"}
            action={
              !isEditing && (
                <Button size="sm" onClick={() => openEdit()}>
                  + 新增话术
                </Button>
              )
            }
          />
          <CardBody>
            <div className="space-y-4">
              {currentTemplates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-start justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {template.name}
                      </span>
                      {template.isDefault && <Badge variant="success">默认</Badge>}
                    </div>
                    <div className="mt-2 text-sm text-gray-700 bg-white p-3 rounded border">
                      {template.content}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {!template.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetDefault(template.id)}
                      >
                        设为默认
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(template)}
                    >
                      编辑
                    </Button>
                    {!template.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(template.id)}
                      >
                        删除
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
