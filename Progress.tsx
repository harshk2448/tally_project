import React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number; // 0 to 100
  color?: "sky" | "indigo" | "emerald" | "amber" | "rose" | "gradient";
  size?: "sm" | "md" | "lg";
}

export function Progress({
  value,
  color = "gradient",
  size = "md",
  className,
  ...props
}: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));

  const sizeMap = {
    sm: "h-1.5",
    md: "h-2.5",
    lg: "h-4",
  };

  const colorMap = {
    sky: "bg-sky-500",
    indigo: "bg-indigo-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    gradient: "bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-400",
  };

  return (
    <div
      className={cn(
        "w-full bg-slate-800/80 rounded-full overflow-hidden border border-slate-700/40 p-0.5",
        sizeMap[size],
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500 ease-out",
          colorMap[color]
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
