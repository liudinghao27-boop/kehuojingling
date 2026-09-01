"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 打印错误详情，便于对照服务端日志排查（digest 可关联服务端日志）
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-6">
        <AlertTriangle className="w-7 h-7 text-red-500" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900">页面出错了</h2>
      <p className="mt-3 text-sm text-gray-400 max-w-md leading-relaxed">
        抱歉，页面加载时出现了问题，请稍后重试。
        {error.digest && (
          <span className="block mt-2 text-xs text-gray-300">错误编号：{error.digest}</span>
        )}
      </p>
      <Button onClick={reset} className="mt-8 rounded-full px-8">
        重试
      </Button>
    </div>
  );
}
