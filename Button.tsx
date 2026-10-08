import React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "glow"
    | "secondary"
    | "outline"
    | "ghost"
    | "destructive"
    | "emerald";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "relative inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sky-400/50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none active:scale-[0.98]";

    const sizeStyles = {
      sm: "text-xs px-3 py-1.5 gap-1.5 h-8",
      md: "text-sm px-4 py-2 gap-2 h-10",
      lg: "text-base px-5 py-2.5 gap-2.5 h-12",
      icon: "h-10 w-10 p-0",
    };

    const variantStyles = {
      primary:
        "bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold shadow-lg shadow-sky-500/20 hover:shadow-sky-400/30",
      glow:
        "bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-600 hover:from-sky-400 hover:via-indigo-400 hover:to-purple-500 text-white font-semibold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50",
      secondary:
        "bg-slate-800/80 hover:bg-slate-700/80 text-slate-100 border border-slate-700/50 hover:border-slate-600",
      outline:
        "bg-transparent hover:bg-slate-800/50 text-slate-200 border border-slate-700 hover:border-slate-500",
      ghost:
        "bg-transparent hover:bg-slate-800/50 text-slate-300 hover:text-white",
      destructive:
        "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20",
      emerald:
        "bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-600/20",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, sizeStyles[size], variantStyles[variant], className)}
        {...props}
      >
        {isLoading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
