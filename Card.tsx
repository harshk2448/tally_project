import React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: "cyan" | "indigo" | "emerald" | "none";
}

export function Card({ className, glow = "none", children, ...props }: CardProps) {
  const glowMap = {
    cyan: "hover:border-sky-500/40 hover:shadow-[0_0_30px_-5px_rgba(56,189,248,0.2)]",
    indigo: "hover:border-indigo-500/40 hover:shadow-[0_0_30px_-5px_rgba(99,102,241,0.2)]",
    emerald: "hover:border-emerald-500/40 hover:shadow-[0_0_30px_-5px_rgba(16,185,129,0.2)]",
    none: "",
  };

  return (
    <div
      className={cn(
        "rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 shadow-xl transition-all duration-300",
        glowMap[glow],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("px-6 py-5 border-b border-slate-800/60 flex items-center justify-between", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-lg font-semibold text-slate-100 tracking-tight", className)}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardDescription({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm text-slate-400 mt-0.5", className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-6", className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("px-6 py-4 border-t border-slate-800/60 flex items-center justify-end gap-3", className)}
      {...props}
    >
      {children}
    </div>
  );
}
