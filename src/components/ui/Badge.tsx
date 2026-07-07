import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "success" | "warning" | "danger" | "info" | "default" | "intent-5" | "intent-4" | "intent-3" | "intent-2" | "intent-1";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  const variants = {
    success: "bg-green-100 text-green-800",
    warning: "bg-yellow-100 text-yellow-800",
    danger: "bg-red-100 text-red-800",
    info: "bg-blue-100 text-blue-800",
    default: "bg-gray-100 text-gray-800",
    "intent-5": "bg-red-50 text-red-600",
    "intent-4": "bg-orange-50 text-orange-600",
    "intent-3": "bg-yellow-50 text-yellow-600",
    "intent-2": "bg-blue-50 text-blue-600",
    "intent-1": "bg-gray-100 text-gray-500",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
