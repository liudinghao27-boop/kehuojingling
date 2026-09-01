import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
      <Link
        href="/"
        className="flex items-center gap-2 text-lg font-semibold text-gray-900 tracking-tight mb-12"
      >
        <span className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center text-white text-sm font-bold">
          K
        </span>
        获客精灵
      </Link>
      <p className="text-6xl font-bold text-gray-900 tracking-tight">404</p>
      <h2 className="mt-4 text-xl font-semibold text-gray-900">页面不存在</h2>
      <p className="mt-3 text-sm text-gray-400">您访问的页面不存在或已被移除</p>
      <Button asChild className="mt-10 rounded-full px-8">
        <Link href="/">返回首页</Link>
      </Button>
    </div>
  );
}
