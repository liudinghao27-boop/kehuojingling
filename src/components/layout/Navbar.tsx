import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

interface NavbarProps {
  className?: string;
}

export function Navbar({ className }: NavbarProps) {
  const { data: session } = useSession();

  return (
    <nav className={cn("bg-white border-b border-gray-200", className)}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="text-xl font-bold text-gray-900">
              🎯 获客精灵
            </Link>
            <div className="hidden md:flex items-center gap-6">
              <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
                仪表盘
              </Link>
              <Link href="/dashboard/videos" className="text-sm text-gray-600 hover:text-gray-900">
                视频监控
              </Link>
              <Link href="/dashboard/templates" className="text-sm text-gray-600 hover:text-gray-900">
                话术管理
              </Link>
              <Link href="/dashboard/analytics" className="text-sm text-gray-600 hover:text-gray-900">
                数据报表
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {session?.user ? (
              <>
                <span className="text-sm text-gray-500">
                  {session.user.plan === "FREE" ? "免费版" : session.user.plan}
                </span>
                <Link
                  href="/pricing"
                  className="text-sm text-blue-600 hover:text-blue-500"
                >
                  升级套餐
                </Link>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
                    {session.user.name?.[0] || "U"}
                  </div>
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    退出
                  </button>
                </div>
              </>
            ) : (
              <Link href="/login" className="text-sm text-blue-600 hover:text-blue-500">
                登录
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
