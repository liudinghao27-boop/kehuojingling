"use client";

import { useState, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleCardProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  headerAction?: ReactNode;
}

export function CollapsibleCard({
  title,
  children,
  defaultOpen = true,
  className,
  headerAction,
}: CollapsibleCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card className={cn("rounded-3xl border-0 shadow-none bg-gray-50 overflow-hidden", className)}>
      <CardHeader className="px-8 pt-8 pb-0 flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-medium text-gray-900">{title}</CardTitle>
        <div className="flex items-center gap-2">
          {headerAction}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 rounded-full hover:bg-gray-200 transition-colors focus:outline-none"
            aria-label={isOpen ? "折叠" : "展开"}
          >
            <ChevronDown
              className={cn(
                "w-5 h-5 text-gray-400 transition-transform duration-300",
                isOpen ? "rotate-180" : "rotate-0"
              )}
            />
          </button>
        </div>
      </CardHeader>
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <CardContent className="p-8">{children}</CardContent>
        </div>
      </div>
    </Card>
  );
}
