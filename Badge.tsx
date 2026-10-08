import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "purple";
  dot?: boolean;
}

export function Badge({
  className,
  variant = "default",
  dot = false,
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    default: "bg-slate-800/80 text-slate-300 border-slate-700/60",
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    danger: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    info: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    purple: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  };

  const dotStyles = {
    default: "bg-slate-400",
    success: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]",
    warning: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]",
    danger: "bg-rose-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]",
    info: "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]",
    purple: "bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border backdrop-blur-md",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {dot && (
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotStyles[variant])} />
      )}
      {children}
    </span>
  );
}
