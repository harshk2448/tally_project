import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  Sparkles,
  ArrowRight,
  UploadCloud,
  FileSpreadsheet,
  ShieldCheck,
  Zap,
  Cpu,
  CheckCircle2,
  FileCheck2,
  Lock,
  ChevronRight,
} from "lucide-react";
import { SUPPORTED_DOC_TYPES } from "@/lib/constants";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#070913] text-slate-100 selection:bg-sky-500/30 selection:text-sky-300 relative overflow-hidden">
      {/* Dynamic Background Glows */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-b from-sky-500/15 via-indigo-500/10 to-transparent blur-[120px] pointer-events-none" />
      <div className="fixed bottom-0 right-10 w-[500px] h-[500px] bg-purple-500/10 blur-[140px] pointer-events-none" />

      {/* Top Navigation */}
      <header className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between relative z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-sky-500/25">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="font-extrabold text-xl text-slate-100 tracking-tight">
            AI OCR Studio
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm" className="text-slate-300">
              Sign In
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="glow" size="sm" className="gap-1.5 shadow-sky-500/20">
              <span>Launch Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6 pt-12 pb-24 relative z-10">
        <div className="text-center max-w-3xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/80 border border-sky-500/30 text-xs font-semibold text-sky-400 backdrop-blur-md shadow-lg shadow-sky-500/10">
            <Sparkles className="w-4 h-4" />
            <span>Azure Document Intelligence + OpenAI GPT-5.5</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black text-slate-100 tracking-tight leading-[1.15]">
            Next-Gen Intelligent <br />
            <span className="text-gradient-cyan">Document Processing</span> SaaS
          </h1>

          <p className="text-base sm:text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto">
            Upload PDFs, scans, and images. Automatically extract structured line items,
            clean data with Indian GSTIN & PAN checksums, validate side-by-side, and export to multi-sheet Excel.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <Link href="/dashboard">
              <Button size="lg" variant="glow" className="gap-2 shadow-xl shadow-sky-500/25">
                <Sparkles className="w-5 h-5" />
                <span>Open Interactive Studio</span>
              </Button>
            </Link>
            <Link href="/upload">
              <Button size="lg" variant="secondary" className="gap-2">
                <UploadCloud className="w-5 h-5 text-sky-400" />
                <span>Upload Sample Document</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20">
          <Card className="p-6 border-slate-800/80 hover:border-sky-500/40 transition-all">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mb-4">
              <Cpu className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-100 mb-2">
              Azure Layout & Table OCR
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Extracts complete document bounding boxes, lines, words, multi-column line item tables, and key-value pairs with sub-millimeter precision.
            </p>
          </Card>

          <Card className="p-6 border-slate-800/80 hover:border-indigo-500/40 transition-all">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
              <FileCheck2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-100 mb-2">
              AI Cleaner & GSTIN Validator
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Verifies Indian 15-character GSTIN via official Modulo-36 check digit algorithm, validates PAN structure, standardizes dates to ISO, and catches math discrepancies.
            </p>
          </Card>

          <Card className="p-6 border-slate-800/80 hover:border-emerald-500/40 transition-all">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-100 mb-2">
              Multi-Sheet Excel Export
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Generates formatted .xlsx workbooks with structured financial summary and dedicated itemized line items tabs, plus CSV and clean JSON formats.
            </p>
          </Card>
        </div>

        {/* Supported Document Types Badge Showcase */}
        <div className="mt-20 p-8 rounded-3xl bg-slate-900/50 backdrop-blur-xl border border-slate-800/80">
          <div className="text-center mb-6">
            <h3 className="text-lg font-bold text-slate-100">
              12+ Auto-Detected Document Classes
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Zero-shot classification powered by OpenAI reasoning
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2.5 max-w-4xl mx-auto">
            {SUPPORTED_DOC_TYPES.map((type) => (
              <span
                key={type}
                className="px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-300 text-xs font-semibold hover:border-sky-500/40 transition-colors"
              >
                {type}
              </span>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-8 px-6 text-center text-xs text-slate-500">
        <p>© 2026 AI OCR Studio. Built for enterprise invoice & document processing.</p>
      </footer>
    </div>
  );
}
