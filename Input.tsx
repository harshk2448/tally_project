import React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, icon, ...props }, ref) => {
    return (
      <div className="w-full relative">
        {icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={cn(
            "w-full h-10 px-3.5 py-2 rounded-xl bg-slate-900/80 text-slate-100 placeholder:text-slate-500 text-sm border border-slate-700/80 transition-all duration-150 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:opacity-50 disabled:cursor-not-allowed",
            icon && "pl-10",
            error && "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20",
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-rose-400 mt-1.5 ml-1">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";
