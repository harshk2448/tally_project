"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  UploadCloud,
  FileSpreadsheet,
  Settings,
  Sparkles,
  Zap,
  CheckCircle2,
  Cpu,
  Layers,
  FileCheck,
} from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      badge: "Live",
    },
    {
      label: "Upload Studio",
      href: "/upload",
      icon: UploadCloud,
    },
    {
      label: "Document Studio",
      href: "/documents",
      icon: FileSpreadsheet,
    },
    {
      label: "Settings & Models",
      href: "/settings",
      icon: Settings,
    },
  ];

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 bg-slate-950/80 backdrop-blur-xl border-r border-slate-800/80 flex flex-col justify-between p-4 z-30">
      <div>
        {/* Brand Logo */}
        <Link
          href="/dashboard"
          className="flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-slate-900/50 transition-colors group mb-6"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-sky-500/25 group-hover:scale-105 transition-transform">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base text-slate-100 tracking-tight">
                AI OCR Studio
              </span>
            </div>
            <p className="text-[11px] text-sky-400 font-medium flex items-center gap-1">
              <Zap className="w-3 h-3 inline" /> GPT-5.5 & Azure
            </p>
          </div>
        </Link>

        {/* Navigation Items */}
        <div className="space-y-1.5">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Workspace
          </p>
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                  isActive
                    ? "bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={cn(
                      "w-4 h-4 transition-colors",
                      isActive
                        ? "text-sky-400"
                        : "text-slate-400 group-hover:text-slate-200"
                    )}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/20 text-sky-300">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Modules Quick Access */}
        <div className="mt-8 space-y-1.5">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
            AI Engine Capabilities
          </p>
          <div className="px-3 py-2 rounded-xl bg-slate-900/40 border border-slate-800/60 space-y-2 text-xs text-slate-400">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-sky-400" /> Azure Doc Intelligence
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> OpenAI GPT-5.5
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileCheck className="w-3.5 h-3.5 text-emerald-400" /> GSTIN / PAN Cleaner
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            </div>
          </div>
        </div>
      </div>

      {/* Storage & User Status */}
      <div className="pt-4 border-t border-slate-800/80 space-y-3">
        <div className="p-3 rounded-xl bg-gradient-to-b from-slate-900/80 to-slate-950/80 border border-slate-800">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-400 font-medium">Monthly Processing</span>
            <span className="text-sky-400 font-semibold">12 / 500</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-sky-400 h-full rounded-full" style={{ width: "12%" }} />
          </div>
          <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Enterprise Tier
          </p>
        </div>

        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-xs font-bold text-sky-400">
            DS
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-medium text-slate-200 truncate">
              Admin Operator
            </p>
            <p className="text-[11px] text-slate-500 truncate">admin@ai-ocr.studio</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
