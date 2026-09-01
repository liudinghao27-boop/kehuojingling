"use client";

import { useSession } from "next-auth/react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CollapsibleCard } from "@/components/ui/collapsible-card";

interface DashboardStats {
  videos: number;
  comments: number;
  highIntent: number;
  replies: number;
  dms: number;
  converted: number;
}

interface FunnelStep {
  label: string;
  value: number;
  percent: string;
}

interface HighIntentUser {
  id: string;
  name: string;
  comment: string;
  score: number;
  time: string;
  avatar: string;
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
  createdAt: string;
}

interface ApiComment {
  id: string;
  authorName: string;
  content: string;
  intentScore: number;
  createdAt: string;
}

const platformNames: Record<string, string> = {
  DOUYIN: '抖音',
  KUAISHOU: '快手',
  SHIPINHAO: '视频号',
};

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  MONITORING: { label: "监控中", variant: "default" },
  PAUSED: { label: "已暂停", variant: "secondary" },
  ERROR: { label: "异常", variant: "destructive" },
};

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const { addToast } = useToast();
  const [videos, setVideos] = useState<Video[]>([]);
  const [highIntentUsers, setHighIntentUsers] = useState<HighIntentUser[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    videos: 0,
    comments: 0,
    highIntent: 0,
    replies: 0,
    dms: 0,
    converted: 0,
  });
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [activities, setActivities] = useState<{ id: string; type: string; description: string; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 重试计数：点击重试时 +1，驱动下方 effect 重新拉取
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    Promise.all([
      fetch('/api/videos'),
      fetch('/api/comments?intent=high'),
      fetch('/api/dashboard/stats'),
      fetch('/api/activities'),
    ])
      .then(async ([videosRes, commentsRes, statsRes, activitiesRes]) => {
        if (!videosRes.ok || !commentsRes.ok || !statsRes.ok || !activitiesRes.ok) {
          throw new Error('获取数据失败');
        }
        const videosData = await videosRes.json();
        const commentsData = await commentsRes.json();
        const statsData = await statsRes.json();
        const activitiesData = await activitiesRes.json();
        if (!ignore) {
          setVideos(videosData.videos || []);
          setHighIntentUsers(
            (commentsData.comments || []).slice(0, 5).map((comment: ApiComment) => ({
              id: comment.id,
              name: comment.authorName,
              comment: comment.content,
              score: comment.intentScore,
              time: formatRelativeTime(comment.createdAt),
              avatar: comment.authorName[0] || '?',
            }))
          );
          setStats(statsData.stats || { videos: 0, comments: 0, highIntent: 0, replies: 0, dms: 0, converted: 0 });
          setFunnel(statsData.funnel || []);
          setActivities(activitiesData.items || []);
          setError(null);
        }
      })
      .catch((error) => {
        if (!ignore) {
          console.error('Fetch dashboard error:', error);
          setError('获取数据失败');
          addToast('获取数据失败', 'error');
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [addToast, reloadKey]);

  // 重试：重置状态后触发重新拉取
  const handleRetry = () => {
    setError(null);
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  const statCards = [
    { label: "监控视频", value: String(stats.videos), change: "+0" },
    { label: "抓取评论", value: String(stats.comments), change: "+0" },
    { label: "高意向用户", value: String(stats.highIntent), change: "需处理" },
    { label: "今日获客", value: String(stats.converted), change: "+0" },
  ];

  const recentVideos = videos.slice(0, 3);

  return (
    <div className="min-h-screen bg-white font-sans">
      <Navbar />

      <main className="max-w-5xl mx-auto px-6 py-8 pt-24">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            欢迎回来，{session?.user?.name || "用户"}
          </h1>
          <p className="mt-2 text-lg text-gray-400">今日获客概览</p>
        </div>

        {/* 加载失败：错误态优先于各区块空态 */}
        {error && (
          <div className="mb-12 rounded-2xl bg-red-50 p-4 text-sm text-red-600 flex items-center justify-between gap-4">
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
        )}

        {/* Stats Grid - Apple Style */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {statCards.map((stat) => (
            <Card
              key={stat.label}
              className="rounded-3xl border-0 shadow-none bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <CardContent className="p-6">
                <div className="text-3xl font-bold text-gray-900 tracking-tight">{stat.value}</div>
                <div className="text-sm text-gray-400 mt-1">{stat.label}</div>
                <div className="text-xs text-gray-400 mt-2 font-medium">{stat.change}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Videos & Users */}
          <div className="lg:col-span-2 space-y-8">
            {/* Recent Videos */}
            <CollapsibleCard
              title="最近监控的视频"
              defaultOpen={true}
              headerAction={
                <Link href="/dashboard/videos" className="text-sm text-gray-400 hover:text-gray-900 transition-colors">
                  查看全部
                </Link>
              }
            >
                {loading ? (
                  <div className="space-y-4">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-20 w-full rounded-2xl" />
                    ))}
                  </div>
                ) : error ? null : recentVideos.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-sm text-gray-400">暂无监控视频</p>
                    <Link href="/dashboard/videos" className="text-sm text-gray-900 hover:text-gray-600 mt-2 inline-block">
                      添加第一个监控视频 →
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {recentVideos.map((video) => {
                      const status = statusMap[video.status] || { label: video.status, variant: "outline" };
                      return (
                        <Card key={video.id} className="rounded-2xl border-0 shadow-sm hover:shadow-sm transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3">
                                  <span className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs font-bold">V</span>
                                  <span className="font-medium text-gray-900 truncate">{video.title}</span>
                                  <Badge variant={status.variant} className="rounded-full">{status.label}</Badge>
                                </div>
                                <div className="mt-2 text-sm text-gray-400">
                                  {platformNames[video.platform] || video.platform} · 评论 {video.comments} · 高意向 {video.highIntent}
                                </div>
                              </div>
                              <div className="ml-4 flex-shrink-0">
                                <Link href={`/dashboard/comments?videoId=${video.id}`}>
                                  <Button size="sm">查看</Button>
                                </Link>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
            </CollapsibleCard>

            {/* High Intent Users */}
            <CollapsibleCard
              title="高意向用户"
              defaultOpen={true}
              headerAction={
                <Link href="/dashboard/comments?intent=high" className="text-sm text-gray-400 hover:text-gray-900 transition-colors">
                  查看全部
                </Link>
              }
            >
                {loading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20 w-full rounded-2xl" />
                    ))}
                  </div>
                ) : error ? null : highIntentUsers.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-sm text-gray-400">暂无高意向用户</p>
                    <Link href="/dashboard/videos" className="text-sm text-gray-900 hover:text-gray-600 mt-2 inline-block">
                      添加视频监控，自动识别高意向 →
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {highIntentUsers.map((user) => (
                      <Card key={user.id} className="rounded-2xl border-0 shadow-sm">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-white text-sm font-medium">
                                  {user.avatar}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-900">{user.name}</span>
                                    <Badge variant={user.score === 5 ? "destructive" : "default"} className="rounded-full text-xs">
                                      {user.score === 5 ? "强意向" : "高意向"} {user.score}分
                                    </Badge>
                                  </div>
                                  <div className="text-sm text-gray-500 mt-1 truncate">&ldquo;{user.comment}&rdquo;</div>
                                  <div className="text-xs text-gray-400 mt-1">{user.time}</div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                              <Link href={`/dashboard/comments?highlight=${user.id}`}>
                                <Button size="sm">回复</Button>
                              </Link>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
            </CollapsibleCard>
          </div>

          {/* Right Column - Funnel & Quick Actions */}
          <div className="space-y-8">
            {/* Conversion Funnel */}
            <CollapsibleCard title="转化漏斗" defaultOpen={true}>
                {loading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-xl" />
                    ))}
                  </div>
                ) : error ? null : funnel.length === 0 ? (
                  <div className="text-center py-12 text-sm text-gray-400">暂无数据</div>
                ) : (
                  <div className="space-y-5">
                    {funnel.map((step, idx, arr) => {
                      const colors = ["bg-gray-900", "bg-gray-600", "bg-gray-500", "bg-gray-400", "bg-gray-300"];
                      const maxValue = arr[0]?.value || 1;
                      return (
                        <div key={step.label}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">{step.label}</span>
                            <div className="text-sm text-gray-400">
                              {step.value} <span className="text-xs ml-1">({step.percent})</span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`${colors[idx] || colors[colors.length - 1]} h-2 rounded-full transition-all`}
                              style={{ width: `${Math.max((step.value / maxValue) * 100, 2)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </CollapsibleCard>

            {/* Quick Actions */}
            <CollapsibleCard title="快捷操作" defaultOpen={true}>
                <div className="space-y-3">
                  <Link href="/dashboard/videos" className="block">
                    <Button className="w-full justify-start bg-white hover:bg-gray-100" variant="secondary">
                      <span className="mr-3 w-5 h-5 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs font-bold">V</span> 添加监控视频
                    </Button>
                  </Link>
                  <Link href="/dashboard/templates" className="block">
                    <Button className="w-full justify-start bg-white hover:bg-gray-100" variant="secondary">
                      <span className="mr-3 w-5 h-5 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs font-bold">T</span> 管理话术模板
                    </Button>
                  </Link>
                  <Link href="/dashboard/analytics" className="block">
                    <Button className="w-full justify-start bg-white hover:bg-gray-100" variant="secondary">
                      <span className="mr-3 w-5 h-5 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs font-bold">D</span> 查看数据报表
                    </Button>
                  </Link>
                </div>
            </CollapsibleCard>

            {/* Recent Activities */}
            <CollapsibleCard title="最近动态" defaultOpen={false}>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-xl" />
                    ))}
                  </div>
                ) : error ? null : activities.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-400">暂无动态</div>
                ) : (
                  <div className="space-y-4">
                    {activities.map((activity) => (
                      <div key={activity.id} className="flex items-start gap-3 text-sm">
                        <span className="w-2 h-2 rounded-full bg-gray-400 mt-1.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-700">{activity.description}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{formatRelativeTime(activity.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </CollapsibleCard>
          </div>
        </div>
      </main>
    </div>
  );
}
