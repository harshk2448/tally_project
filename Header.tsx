"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { UploadCloud, Bell, Search, Sparkles, ShieldCheck } from "lucide-react";

export function Header() {
  return (
    <header className="h-16 border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Search Input */}
      <div className="flex items-center gap-4 w-96">
        <div className="relative w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search documents, vendors, invoice #..."
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Header Actions */}
      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400 font-medium">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Google Gemini Vision & AI Engine Ready</span>
        </div>

        <Link href="/upload">
          <Button size="sm" variant="glow" className="shadow-sky-500/20">
            <UploadCloud className="w-4 h-4" />
            <span>Upload Document</span>
          </Button>
        </Link>

        <button
          aria-label="Notifications"
          className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
        >
          <Bell className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
