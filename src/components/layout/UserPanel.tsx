"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Settings, LogOut, User, ChevronLeft } from "lucide-react";

export function UserPanel() {
  const { data: session } = useSession();
  const [expanded, setExpanded] = useState(false);

  if (!session?.user) return null;

  const userInitial = session.user.name?.[0] || "U";
  const planLabel = session.user.plan === "FREE" ? "免费版" : session.user.plan;

  if (!expanded) {
    return (
      <div className="hidden md:block fixed bottom-6 left-6 z-40">
        <button
          onClick={() => setExpanded(true)}
          className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center text-white shadow-[0_4px_24px_rgba(0,0,0,0.08)] hover:scale-105 transition-transform"
          title="展开用户菜单"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="hidden md:block fixed bottom-6 left-6 z-40">
      <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-gray-100 p-4 w-56">
        {/* User Info */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
              {userInitial}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{session.user.name || "用户"}</p>
              <p className="text-xs text-gray-400 truncate">{session.user.email}</p>
            </div>
          </div>
          <button
            onClick={() => setExpanded(false)}
            className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors flex-shrink-0"
            title="收起"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Plan */}
        <div className="mb-4 px-3 py-2 bg-gray-50 rounded-2xl">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <User className="w-3.5 h-3.5" />
            <span>当前套餐</span>
          </div>
          <p className="mt-1 text-sm font-medium text-gray-900">{planLabel}</p>
        </div>

        {/* Menu */}
        <div className="space-y-1">
          <Link
            href="/dashboard/settings"
            className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Settings className="w-4 h-4" />
            设置
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
