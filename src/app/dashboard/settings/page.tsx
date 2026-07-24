"use client";

import { useState, useEffect, useCallback, useLayoutEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Navbar } from "@/components/layout/Navbar";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, Mail, Crown, Smartphone, Lock, Bookmark, Copy } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";
import { DEFAULT_NOISE_RULES, type NoiseRules } from "@/lib/ai/noise";

type PlatformCredential = {
  platform: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

const PLATFORM_OPTIONS: { value: "DOUYIN" | "KUAISHOU" | "SHIPINHAO"; label: string }[] = [
  { value: "DOUYIN", label: "抖音" },
  { value: "KUAISHOU", label: "快手" },
  { value: "SHIPINHAO", label: "视频号" },
];

const PLATFORM_DOMAINS: Record<"DOUYIN" | "KUAISHOU" | "SHIPINHAO", string> = {
  DOUYIN: "www.douyin.com",
  KUAISHOU: "www.kuaishou.com",
  SHIPINHAO: "channels.weixin.qq.com",
};

type AlertChannelType = "dingtalk" | "wecom";

interface AlertConfig {
  enabled: boolean;
  channelType: AlertChannelType | null;
  webhook: string | null;
}

const ALERT_CHANNEL_OPTIONS: { value: AlertChannelType; label: string }[] = [
  { value: "dingtalk", label: "钉钉" },
  { value: "wecom", label: "企业微信" },
];

function formatPlatformName(platform: string) {
  const option = PLATFORM_OPTIONS.find((p) => p.value === platform);
  return option?.label || platform;
}

function generateBookmarkletCode(platform: string, token: string): string {
  const apiUrl = `${window.location.origin}/api/user/platform-credentials/${platform}/bookmarklet`;
  return `javascript:(function(){var cookies=document.cookie;if(!cookies){alert('未获取到Cookie，请确保已登录'+window.location.hostname);return;}fetch('${apiUrl}',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer ${token}'},body:JSON.stringify({cookies:cookies})}).then(function(r){return r.json();}).then(function(data){if(data.success){alert('Cookie 同步成功');}else{alert('同步失败：'+(data.error||'未知错误'));}}).catch(function(e){alert('同步失败：'+e.message);});})();`;
}

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const { addToast } = useToast();
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [profileForm, setProfileForm] = useState({
    name: "",
    email: "",
    phone: "",
    industryContext: "",
    intentScoreThreshold: 4,
  });
  const [profileEditing, setProfileEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [usage, setUsage] = useState<{
    videos: { used: number; limit: number };
    replies: { used: number; limit: number };
    dms: { used: number; limit: number };
    aiResearch: { used: number; limit: number };
  } | null>(null);
  const [aiKey, setAiKey] = useState("");
  const [aiKeyMasked, setAiKeyMasked] = useState<string | null>(null);
  const [aiKeyHas, setAiKeyHas] = useState(false);
  const [aiKeySubmitting, setAiKeySubmitting] = useState(false);
  const [aiKeyVerifying, setAiKeyVerifying] = useState(false);

  const [platform, setPlatform] = useState<"DOUYIN" | "KUAISHOU" | "SHIPINHAO">("DOUYIN");
  const [cookies, setCookies] = useState("");
  const [credentials, setCredentials] = useState<PlatformCredential[]>([]);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [credentialsSaving, setCredentialsSaving] = useState(false);
  const [credentialsVerifying, setCredentialsVerifying] = useState(false);
  const [deletingPlatform, setDeletingPlatform] = useState<string | null>(null);
  const [showCookieInput, setShowCookieInput] = useState(false);

  const [bookmarkletToken, setBookmarkletToken] = useState<string | null>(null);
  const [bookmarkletPlatform, setBookmarkletPlatform] = useState<"DOUYIN" | "KUAISHOU" | "SHIPINHAO">("DOUYIN");
  const [showBookmarklet, setShowBookmarklet] = useState(false);

  const [noiseRules, setNoiseRules] = useState<NoiseRules>(DEFAULT_NOISE_RULES);
  const [noiseRulesSubmitting, setNoiseRulesSubmitting] = useState(false);

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    enabled: false,
    channelType: null,
    webhook: null,
  });
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertTesting, setAlertTesting] = useState(false);

  const planLabel = session?.user?.plan === "FREE" ? "免费版" : session?.user?.plan;
  const phone = session?.user?.phone;

  const fetchCredentials = useCallback(async () => {
    setCredentialsLoading(true);
    try {
      const res = await fetch("/api/user/platform-credentials");
      const data = await res.json();
      if (res.ok && Array.isArray(data.credentials)) {
        setCredentials(data.credentials);
      }
    } catch (err) {
      console.error("Fetch platform credentials error:", err);
    } finally {
      setCredentialsLoading(false);
    }
  }, []);

  const profileFormInitialized = useRef(false);
  useLayoutEffect(() => {
    if (session?.user && !profileFormInitialized.current) {
      profileFormInitialized.current = true;
      setProfileForm({
        name: session.user.name || "",
        email: session.user.email || "",
        phone: session.user.phone || "",
        industryContext: session.user.industryContext || "",
        intentScoreThreshold: session.user.intentScoreThreshold ?? 4,
      });
      setNoiseRules(session.user.noiseRules ?? DEFAULT_NOISE_RULES);
    }
  }, [session?.user]);

  useEffect(() => {
    let ignore = false;

    fetch("/api/user/usage")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!ignore && data?.usage) setUsage(data.usage);
      })
      .catch((err) => {
        if (!ignore) console.error("Fetch usage error:", err);
      });

    fetch("/api/user/ai-key")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!ignore && data) {
          setAiKeyHas(data.hasKey);
          setAiKeyMasked(data.maskedKey);
        }
      })
      .catch((err) => {
        if (!ignore) console.error("Fetch AI key error:", err);
      });

    fetch("/api/user/platform-credentials")
      .then(async (res) => {
        const data = await res.json();
        if (!ignore && res.ok && Array.isArray(data.credentials)) {
          setCredentials(data.credentials);
        }
      })
      .catch((err) => {
        if (!ignore) console.error("Fetch platform credentials error:", err);
      })
      .finally(() => {
        if (!ignore) setCredentialsLoading(false);
      });

    fetch("/api/user/bookmarklet-token")
      .then(async (res) => {
        const data = await res.json();
        if (!ignore && res.ok && data.token) {
          setBookmarkletToken(data.token);
        } else if (!ignore) {
          throw new Error(data.error || "获取书签令牌失败");
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.error("Fetch bookmarklet token error:", err);
          addToast("请刷新页面重试", "error");
        }
      });

    fetch("/api/user/alert-config")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!ignore && data?.config) setAlertConfig(data.config);
      })
      .catch((err) => {
        if (!ignore) console.error("Fetch alert config error:", err);
      });

    return () => {
      ignore = true;
    };
  }, [addToast]);

  const handleProfileUpdate = async () => {
    if (!profileForm.name.trim() || !profileForm.email.trim()) {
      addToast("用户名和邮箱不能为空", "error");
      return;
    }

    setProfileSubmitting(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileForm.name.trim(),
          email: profileForm.email.trim(),
          phone: profileForm.phone.trim(),
          industryContext: profileForm.industryContext.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "更新失败");
      }

      await update({
        user: {
          name: data.user.name,
          email: data.user.email,
          phone: data.user.phone,
          industryContext: data.user.industryContext,
          intentScoreThreshold: data.user.intentScoreThreshold,
        },
      });

      addToast("个人信息已更新", "success");
      setProfileEditing(false);
    } catch (error) {
      addToast(getErrorMessage(error) || "更新个人信息失败", "error");
    } finally {
      setProfileSubmitting(false);
    }
  };

  const handleSaveThreshold = async (score: number) => {
    if (score === profileForm.intentScoreThreshold) return;

    setProfileSubmitting(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intentScoreThreshold: score }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "保存失败");
      }

      setProfileForm((prev) => ({ ...prev, intentScoreThreshold: score }));
      await update({
        user: { intentScoreThreshold: score },
      });

      addToast(`意向分析阈值已设为 ${score} 分`, "success");
    } catch (error) {
      addToast(getErrorMessage(error) || "保存阈值失败", "error");
    } finally {
      setProfileSubmitting(false);
    }
  };

  const handleNoiseRulesChange = (type: keyof NoiseRules, value: string) => {
    setNoiseRules((prev) => ({
      ...prev,
      [type]: value
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter(Boolean),
    }));
  };

  const handleSaveNoiseRules = async () => {
    setNoiseRulesSubmitting(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noiseRules }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "保存失败");
      }

      await update({
        user: { noiseRules },
      });

      addToast("噪音过滤规则已保存", "success");
    } catch (error) {
      addToast(getErrorMessage(error) || "保存噪音规则失败", "error");
    } finally {
      setNoiseRulesSubmitting(false);
    }
  };

  const handleResetNoiseRules = () => {
    setNoiseRules(DEFAULT_NOISE_RULES);
  };

  const handleSaveAiKey = async () => {
    if (!aiKey.trim()) {
      addToast("请输入 API Key", "error");
      return;
    }

    setAiKeySubmitting(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch("/api/user/ai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiApiKey: aiKey.trim() }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "保存失败");
      }
      addToast("AI Key 已保存", "success");
      setAiKey("");
      setAiKeyHas(true);
      setAiKeyMasked(data.maskedKey || null);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        addToast("保存超时，请检查网络或稍后重试", "error");
      } else {
        addToast(getErrorMessage(error) || "保存 AI Key 失败", "error");
      }
    } finally {
      clearTimeout(timeout);
      setAiKeySubmitting(false);
    }
  };

  const handleVerifyAiKey = async () => {
    if (!aiKey.trim()) {
      addToast("请输入 API Key 再验证", "error");
      return;
    }

    setAiKeyVerifying(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch("/api/user/ai-key/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiApiKey: aiKey.trim() }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "验证失败");
      }
      addToast(`Key 验证通过：${data.model || 'deepseek'}`, "success");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        addToast("验证超时，请检查网络或稍后重试", "error");
      } else {
        addToast(getErrorMessage(error) || "验证失败", "error");
      }
    } finally {
      clearTimeout(timeout);
      setAiKeyVerifying(false);
    }
  };

  const handleDeleteAiKey = async () => {
    setAiKeySubmitting(true);
    try {
      const res = await fetch("/api/user/ai-key", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "删除失败");
      }
      addToast("AI Key 已删除", "success");
      setAiKeyHas(false);
      setAiKeyMasked(null);
      setAiKey("");
    } catch (error) {
      addToast(getErrorMessage(error) || "删除 AI Key 失败", "error");
    } finally {
      setAiKeySubmitting(false);
    }
  };

  const handleSaveAlertConfig = async () => {
    if (alertConfig.enabled) {
      if (!alertConfig.channelType) {
        addToast("请选择告警渠道", "error");
        return;
      }
      if (!alertConfig.webhook?.trim()) {
        addToast("请填写 Webhook URL", "error");
        return;
      }
    }

    setAlertSaving(true);
    try {
      const res = await fetch("/api/user/alert-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: alertConfig.enabled,
          channelType: alertConfig.channelType,
          webhook: alertConfig.webhook?.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "保存失败");
      }
      if (data.config) setAlertConfig(data.config);
      addToast("告警配置已保存", "success");
    } catch (error) {
      addToast(getErrorMessage(error) || "保存告警配置失败", "error");
    } finally {
      setAlertSaving(false);
    }
  };

  const handleTestAlert = async () => {
    setAlertTesting(true);
    try {
      const res = await fetch("/api/user/alert-config/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "发送失败");
      }
      addToast("测试消息已发送，请查收", "success");
    } catch (error) {
      addToast(getErrorMessage(error) || "发送测试消息失败", "error");
    } finally {
      setAlertTesting(false);
    }
  };

  const handleSavePlatformCredential = async () => {
    if (!cookies.trim()) {
      addToast("请输入 Cookie 字符串", "error");
      return false;
    }

    setCredentialsSaving(true);
    try {
      const res = await fetch("/api/user/platform-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, cookies: cookies.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "保存失败");
      }
      addToast("保存成功", "success");
      setCookies("");
      await fetchCredentials();
      return true;
    } catch (error) {
      addToast(getErrorMessage(error) || "保存失败", "error");
      return false;
    } finally {
      setCredentialsSaving(false);
    }
  };

  const handleVerifyPlatformCredential = async () => {
    setCredentialsVerifying(true);
    try {
      const hasInput = cookies.trim().length > 0;
      if (hasInput) {
        const saved = await handleSavePlatformCredential();
        if (!saved) return;
      }

      const res = await fetch(`/api/user/platform-credentials/${platform}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "验证失败");
      }
      if (data.valid) {
        addToast("验证通过", "success");
      } else {
        addToast(`验证失败：${data.error || "未知错误"}`, "error");
      }
    } catch (error) {
      addToast(getErrorMessage(error) || "验证失败", "error");
    } finally {
      setCredentialsVerifying(false);
    }
  };

  const handleDeletePlatformCredential = async (targetPlatform: string) => {
    setDeletingPlatform(targetPlatform);
    try {
      const res = await fetch(`/api/user/platform-credentials/${targetPlatform}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "删除失败");
      }
      addToast("删除成功", "success");
      await fetchCredentials();
    } catch (error) {
      addToast(getErrorMessage(error) || "删除失败", "error");
    } finally {
      setDeletingPlatform(null);
    }
  };

  const handleOpenBookmarklet = (targetPlatform: "DOUYIN" | "KUAISHOU" | "SHIPINHAO") => {
    setBookmarkletPlatform(targetPlatform);
    setShowBookmarklet(true);
  };

  const handleCopyBookmarkletCode = async () => {
    if (!bookmarkletToken) {
      addToast("书签令牌未获取，请刷新页面重试", "error");
      return;
    }
    const code = generateBookmarkletCode(bookmarkletPlatform, bookmarkletToken);
    try {
      await navigator.clipboard.writeText(code);
      addToast("书签代码已复制", "success");
    } catch {
      addToast("复制失败，请手动复制", "error");
    }
  };

  const handlePasswordChange = async () => {
    if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      addToast("请填写完整密码信息", "error");
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      addToast("新密码至少6位", "error");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      addToast("两次输入的新密码不一致", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldPassword: passwordForm.oldPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "修改失败");
      }
      addToast("密码已更新", "success");
      setPasswordForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
    } catch (error) {
      addToast(getErrorMessage(error) || "修改密码失败", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const bookmarkletCode = bookmarkletToken
    ? generateBookmarkletCode(bookmarkletPlatform, bookmarkletToken)
    : null;

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 lg:px-8 pt-24 pb-32">
        <div className="mb-16">
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">设置</h1>
          <p className="mt-2 text-base text-gray-400">管理账号信息和系统配置</p>
        </div>

        <div className="grid gap-6">
          {/* Personal Info */}
          <CollapsibleCard
            title="个人信息"
            defaultOpen={true}
            headerAction={
              !profileEditing ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setProfileEditing(true)}
                  className="rounded-full px-4 py-2 h-auto text-xs text-gray-500"
                >
                  编辑
                </Button>
              ) : undefined
            }
          >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-gray-900 flex items-center justify-center text-white text-xl font-medium">
                  {session?.user?.name?.[0] || "U"}
                </div>
                <div>
                  <p className="text-lg font-medium text-gray-900">{session?.user?.name || "用户"}</p>
                  <p className="text-sm text-gray-400">{session?.user?.email}</p>
                </div>
              </div>

              {profileEditing ? (
                <div className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">用户名</label>
                    <div className="flex items-center gap-3">
                      <User className="w-4 h-4 text-gray-400" />
                      <Input
                        value={profileForm.name}
                        onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                        placeholder="用户名"
                        className="flex-1 rounded-2xl bg-white border-0 px-4 py-2.5 h-auto text-sm focus:ring-2 focus:ring-gray-200"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">邮箱</label>
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <Input
                        type="email"
                        value={profileForm.email}
                        onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                        placeholder="邮箱"
                        className="flex-1 rounded-2xl bg-white border-0 px-4 py-2.5 h-auto text-sm focus:ring-2 focus:ring-gray-200"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">手机号</label>
                    <div className="flex items-center gap-3">
                      <Smartphone className="w-4 h-4 text-gray-400" />
                      <Input
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                        placeholder="11 位手机号（可选）"
                        className="flex-1 rounded-2xl bg-white border-0 px-4 py-2.5 h-auto text-sm focus:ring-2 focus:ring-gray-200"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">业务场景描述</label>
                    <Textarea
                      value={profileForm.industryContext}
                      onChange={(e) => setProfileForm({ ...profileForm, industryContext: e.target.value })}
                      placeholder="例如：荆州贷款中介，主营个人公积金重组贷款、资金过桥、经营贷款，客户为 30-45 岁公职人员"
                      rows={4}
                      className="rounded-2xl bg-white border-0 px-4 py-2.5 text-sm focus:ring-2 focus:ring-gray-200 resize-none"
                    />
                    <p className="mt-1.5 text-xs text-gray-400">
                      用于 AI 判断评论意向，AI 获客助手也会默认使用该描述
                    </p>
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setProfileEditing(false);
                        setProfileForm({
                          name: session?.user?.name || "",
                          email: session?.user?.email || "",
                          phone: session?.user?.phone || "",
                          industryContext: session?.user?.industryContext || "",
                          intentScoreThreshold: session?.user?.intentScoreThreshold ?? 4,
                        });
                      }}
                      disabled={profileSubmitting}
                      className="rounded-full px-5 py-2.5 h-auto text-sm"
                    >
                      取消
                    </Button>
                    <Button
                      onClick={handleProfileUpdate}
                      disabled={profileSubmitting}
                      className="rounded-full px-5 py-2.5 h-auto text-sm"
                    >
                      {profileSubmitting ? "保存中..." : "保存"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-sm text-gray-700">
                    <User className="w-4 h-4 text-gray-400" />
                    <span>用户名：{session?.user?.name || "未设置"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-700">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span>邮箱：{session?.user?.email}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-700">
                    <Smartphone className="w-4 h-4 text-gray-400" />
                    <span>手机号：{phone || "未绑定（后续用于验证码）"}</span>
                  </div>
                  <div className="flex items-start gap-3 text-sm text-gray-700">
                    <span className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">
                      业务场景：{session?.user?.industryContext || "未配置（AI 将使用通用规则判断意向）"}
                    </span>
                  </div>
                </div>
              )}
          </CollapsibleCard>

          {/* Account Security */}
          <CollapsibleCard title="账号安全" defaultOpen={false}>
              <div className="flex items-center gap-3 mb-6">
                <Lock className="w-5 h-5 text-gray-900" />
                <span className="text-base font-medium text-gray-900">修改密码</span>
              </div>
              <div className="space-y-4 max-w-md">
                <Input
                  type="password"
                  placeholder="原密码"
                  value={passwordForm.oldPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                  className="rounded-2xl bg-white border-0 px-4 py-3 h-auto text-sm focus:ring-2 focus:ring-gray-200"
                />
                <Input
                  type="password"
                  placeholder="新密码（至少6位）"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  className="rounded-2xl bg-white border-0 px-4 py-3 h-auto text-sm focus:ring-2 focus:ring-gray-200"
                />
                <Input
                  type="password"
                  placeholder="确认新密码"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  className="rounded-2xl bg-white border-0 px-4 py-3 h-auto text-sm focus:ring-2 focus:ring-gray-200"
                />
                <Button
                  onClick={handlePasswordChange}
                  disabled={submitting}
                  className="rounded-full px-6 py-3 h-auto text-sm"
                >
                  {submitting ? "保存中..." : "更新密码"}
                </Button>
              </div>
          </CollapsibleCard>

          {/* Plan */}
          <CollapsibleCard title="当前套餐" defaultOpen={true}>
              <div className="flex items-center gap-3 mb-6">
                <Crown className="w-5 h-5 text-gray-900" />
                <span className="text-base font-medium text-gray-900">当前套餐</span>
                <Badge variant="secondary" className="rounded-full">{planLabel}</Badge>
              </div>
              {usage && (
                <div className="space-y-4">
                  {[
                    { label: "监控视频", key: "videos" as const, unit: "个" },
                    { label: "今日回复", key: "replies" as const, unit: "条" },
                    { label: "今日私信", key: "dms" as const, unit: "条" },
                    { label: "今日 AI 研究", key: "aiResearch" as const, unit: "次" },
                  ].map((item) => {
                    const { used, limit } = usage[item.key];
                    const unlimited = limit >= Number.MAX_SAFE_INTEGER;
                    const percent = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
                    return (
                      <div key={item.key}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm text-gray-700">{item.label}</span>
                          <span className="text-xs text-gray-400">
                            {used}{unlimited ? "" : ` / ${limit}`} {item.unit}
                          </span>
                        </div>
                        {!unlimited && (
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-gray-900 h-1.5 rounded-full"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-sm text-gray-400 mt-6">
                升级套餐可获得更多监控视频、更高回复/私信额度和更频繁的自动抓取。
              </p>
          </CollapsibleCard>

          {/* AI Config */}
          <CollapsibleCard title="AI 模型配置" defaultOpen={true}>
              <p className="text-sm text-gray-500 mb-4">
                当前系统默认使用 DeepSeek 大模型。你可以填写自己的 DeepSeek API Key，AI 获客助手将使用你的 Key 进行关键词提取和网页研究。
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-2xl text-sm text-gray-700 mb-5">
                <span className={`w-2 h-2 rounded-full ${aiKeyHas ? "bg-green-500" : "bg-red-500"}`} />
                默认模型：deepseek-v4-flash · {aiKeyHas ? "已配置个人 Key" : "未配置个人 Key"}
              </div>

              <div className="space-y-4 max-w-md">
                {aiKeyHas && aiKeyMasked && (
                  <div className="flex items-center justify-between px-4 py-3 bg-white rounded-2xl text-sm text-gray-700">
                    <span>当前 Key：{aiKeyMasked}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDeleteAiKey}
                      disabled={aiKeySubmitting}
                      className="rounded-full px-3 py-1 h-auto text-xs text-red-500 hover:text-red-700"
                    >
                      删除
                    </Button>
                  </div>
                )}
                <Input
                  type="password"
                  placeholder={aiKeyHas ? "如需更换，请输入新的 DeepSeek API Key" : "请输入 DeepSeek API Key"}
                  value={aiKey}
                  onChange={(e) => setAiKey(e.target.value)}
                  className="rounded-2xl bg-white border-0 px-4 py-3 h-auto text-sm focus:ring-2 focus:ring-gray-200"
                />
                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleSaveAiKey}
                    disabled={aiKeySubmitting || !aiKey.trim()}
                    className="rounded-full px-6 py-3 h-auto text-sm"
                  >
                    {aiKeySubmitting ? "保存中..." : (aiKeyHas ? "更新 Key" : "保存 Key")}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleVerifyAiKey}
                    disabled={aiKeyVerifying || !aiKey.trim()}
                    className="rounded-full px-6 py-3 h-auto text-sm"
                  >
                    {aiKeyVerifying ? "验证中..." : "验证 Key"}
                  </Button>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100">
                <h4 className="text-sm font-medium text-gray-900 mb-3">意向分析阈值</h4>
                <p className="text-xs text-gray-400 mb-4">
                  评论意向分 ≥ {profileForm.intentScoreThreshold} 分时会被标记为&quot;高意向&quot;，并出现在&quot;高意向&quot;筛选中。
                </p>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => handleSaveThreshold(score)}
                      disabled={profileSubmitting}
                      className={`w-10 h-10 rounded-2xl text-sm font-medium transition-colors ${
                        profileForm.intentScoreThreshold === score
                          ? "bg-gray-900 text-white"
                          : "bg-white text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {score}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400 mt-2 max-w-[232px]">
                  <span>宽松</span>
                  <span>严格</span>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-gray-900">噪音过滤规则</h4>
                  <button
                    type="button"
                    onClick={handleResetNoiseRules}
                    className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
                  >
                    恢复默认
                  </button>
                </div>
                <p className="text-xs text-gray-400 mb-4">
                  当 AI 分析不可用或失败时，使用以下关键词进行本地兜底判断。每行一个关键词，逗号也可分隔。
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {([
                    { key: "peer", label: "同行 / 服务商" },
                    { key: "vendor", label: "广告 / 推销" },
                    { key: "scam", label: "诈骗 / 黑灰产" },
                    { key: "emotional", label: "纯情绪 / 表情" },
                    { key: "offtopic", label: "无关闲聊" },
                  ] as { key: keyof NoiseRules; label: string }[]).map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
                      <Textarea
                        value={noiseRules[key].join("\n")}
                        onChange={(e) => handleNoiseRulesChange(key, e.target.value)}
                        placeholder="每行一个关键词"
                        rows={4}
                        className="rounded-2xl bg-white border-0 px-4 py-3 text-sm focus:ring-2 focus:ring-gray-200 resize-none"
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Button
                    onClick={handleSaveNoiseRules}
                    disabled={noiseRulesSubmitting}
                    className="rounded-full px-6 py-3 h-auto text-sm"
                  >
                    {noiseRulesSubmitting ? "保存中..." : "保存噪音规则"}
                  </Button>
                </div>
              </div>

              <p className="mt-6 text-xs text-gray-400">
                你也可以在服务端环境变量中配置全局 OPENAI_API_KEY，作为未配置个人 Key 用户的兜底（当前未配置则不生效）。
              </p>
          </CollapsibleCard>

          {/* Alert Notification */}
          <CollapsibleCard title="告警通知" defaultOpen={false}>
              <p className="text-sm text-gray-500 mb-4">
                当账号触发风控冷却时，系统会向下方配置的 Webhook 推送告警消息，支持钉钉 / 企业微信群机器人。
              </p>
              <div className="space-y-4 max-w-md">
                <div className="flex items-center justify-between px-4 py-3 bg-white rounded-2xl">
                  <span className="text-sm text-gray-700">启用告警</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={alertConfig.enabled}
                    onClick={() => setAlertConfig({ ...alertConfig, enabled: !alertConfig.enabled })}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      alertConfig.enabled ? "bg-gray-900" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                        alertConfig.enabled ? "translate-x-5" : ""
                      }`}
                    />
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">告警渠道</label>
                  <Select
                    value={alertConfig.channelType ?? ""}
                    onValueChange={(value) =>
                      setAlertConfig({ ...alertConfig, channelType: value as AlertChannelType })
                    }
                    disabled={!alertConfig.enabled}
                  >
                    <SelectTrigger className="w-full rounded-2xl bg-white border-0 px-4 py-3 h-auto text-sm focus:ring-2 focus:ring-gray-200">
                      <SelectValue placeholder="选择渠道" />
                    </SelectTrigger>
                    <SelectContent>
                      {ALERT_CHANNEL_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Webhook URL</label>
                  <Input
                    type="text"
                    placeholder="例如：https://oapi.dingtalk.com/robot/send?access_token=..."
                    value={alertConfig.webhook ?? ""}
                    onChange={(e) => setAlertConfig({ ...alertConfig, webhook: e.target.value })}
                    disabled={!alertConfig.enabled}
                    className="rounded-2xl bg-white border-0 px-4 py-3 h-auto text-sm focus:ring-2 focus:ring-gray-200"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleSaveAlertConfig}
                    disabled={alertSaving}
                    className="rounded-full px-6 py-3 h-auto text-sm"
                  >
                    {alertSaving ? "保存中..." : "保存配置"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleTestAlert}
                    disabled={alertTesting || !alertConfig.enabled}
                    className="rounded-full px-6 py-3 h-auto text-sm"
                  >
                    {alertTesting ? "发送中..." : "发送测试"}
                  </Button>
                </div>
                <p className="text-xs text-gray-400">
                  请先保存配置，再发送测试消息验证 Webhook 是否可用。
                </p>
              </div>
          </CollapsibleCard>

          {/* Platform Credentials */}
          <CollapsibleCard title="平台账号配置" defaultOpen={false}>
              <div className="space-y-4 max-w-md">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">选择平台</label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as "DOUYIN" | "KUAISHOU" | "SHIPINHAO")}
                    className="w-full rounded-2xl bg-white border-0 px-4 py-3 h-auto text-sm text-gray-900 focus:ring-2 focus:ring-gray-200 outline-none"
                  >
                    {PLATFORM_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  onClick={() => handleOpenBookmarklet(platform)}
                  className="rounded-full px-6 py-3 h-auto text-sm w-full"
                >
                  <Bookmark className="w-4 h-4 mr-2" />
                  使用浏览器书签同步 Cookie
                </Button>

                {showBookmarklet && bookmarkletPlatform === platform && (
                  <div className="space-y-4 p-4 bg-white rounded-2xl">
                    <h4 className="text-sm font-medium text-gray-900">
                      {formatPlatformName(bookmarkletPlatform)} Cookie 同步书签
                    </h4>
                    <ol className="list-decimal list-inside space-y-1.5 text-xs text-gray-600">
                      <li>把下面这个按钮拖到浏览器书签栏</li>
                      <li>在浏览器里打开 {PLATFORM_DOMAINS[bookmarkletPlatform]} 并登录</li>
                      <li>点击书签栏里的「同步{formatPlatformName(bookmarkletPlatform)} Cookie」</li>
                      <li>看到「同步成功」即完成</li>
                    </ol>
                    <div className="flex items-center gap-3">
                      {bookmarkletCode ? (
                        // React 19 会拦截 javascript: URL，必须用原生 HTML 渲染
                        <span
                          dangerouslySetInnerHTML={{
                            __html: `<a href="${bookmarkletCode.replace(/"/g, '&quot;')}" draggable="true" class="inline-block rounded-2xl bg-gray-900 text-white px-4 py-2 text-sm cursor-move">同步${formatPlatformName(bookmarkletPlatform)} Cookie</a>`,
                          }}
                        />
                      ) : (
                        <span className="inline-block rounded-2xl bg-gray-200 text-gray-500 px-4 py-2 text-sm">
                          同步{formatPlatformName(bookmarkletPlatform)} Cookie
                        </span>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleCopyBookmarkletCode}
                        disabled={!bookmarkletCode}
                        className="rounded-full px-4 py-2 h-auto text-xs"
                      >
                        <Copy className="w-3.5 h-3.5 mr-1.5" />
                        复制书签代码
                      </Button>
                    </div>
                    <p className="text-xs text-gray-400">
                      提示：token 10 分钟内有效，过期请刷新页面重新获取。
                    </p>
                  </div>
                )}

                {!showCookieInput && (
                  <button
                    type="button"
                    onClick={() => setShowCookieInput(true)}
                    className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
                  >
                    手动输入 Cookie（高级）
                  </button>
                )}
                {showCookieInput && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">Cookie 字符串</label>
                      <Textarea
                        value={cookies}
                        onChange={(e) => setCookies(e.target.value)}
                        placeholder="请从浏览器开发者工具复制该平台的 Cookie 字符串并粘贴到这里"
                        rows={4}
                        className="rounded-2xl bg-white border-0 px-4 py-3 text-sm focus:ring-2 focus:ring-gray-200 resize-none"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        onClick={handleSavePlatformCredential}
                        disabled={credentialsSaving || !cookies.trim()}
                        className="rounded-full px-6 py-3 h-auto text-sm"
                      >
                        {credentialsSaving ? "保存中..." : "保存"}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={handleVerifyPlatformCredential}
                        disabled={credentialsVerifying}
                        className="rounded-full px-6 py-3 h-auto text-sm"
                      >
                        {credentialsVerifying ? "验证中..." : "验证"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-8">
                <h4 className="text-sm font-medium text-gray-900 mb-3">已保存凭证</h4>
                {credentialsLoading ? (
                  <p className="text-sm text-gray-400">加载中...</p>
                ) : credentials.length === 0 ? (
                  <p className="text-sm text-gray-400">暂无已保存的平台凭证</p>
                ) : (
                  <div className="space-y-3">
                    {credentials.map((credential) => (
                      <div
                        key={credential.platform}
                        className="flex items-center justify-between px-4 py-3 bg-white rounded-2xl text-sm"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-gray-900">{formatPlatformName(credential.platform)}</span>
                          <Badge variant="secondary" className="rounded-full">书签同步</Badge>
                          <span className="text-xs text-gray-400">
                            保存于 {new Date(credential.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeletePlatformCredential(credential.platform)}
                          disabled={deletingPlatform === credential.platform}
                          className="rounded-full px-3 py-1 h-auto text-xs text-red-500 hover:text-red-700"
                        >
                          {deletingPlatform === credential.platform ? "删除中..." : "删除"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p className="mt-6 text-xs text-gray-400">
                Cookie 仅用于自动回复/私信，请妥善保管，定期更新。
              </p>
          </CollapsibleCard>
        </div>
      </main>
    </div>
  );
}
