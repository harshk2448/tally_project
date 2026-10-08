"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileSpreadsheet,
  DownloadCloud,
  Layers,
  Sparkles,
  ExternalLink,
  Loader2,
} from "lucide-react";

interface BatchSummaryCardProps {
  total: number;
  successful: number;
  needsReview: number;
  failed: number;
  googleSheetsSaved: number;
  onSaveAllToSheets: () => void;
  onDownloadAllData: () => void;
  onExportTally: () => void;
  isSavingSheets?: boolean;
  sheetsUrl?: string;
  canAct?: boolean;
}

export function BatchSummaryCard({
  total,
  successful,
  needsReview,
  failed,
  googleSheetsSaved,
  onSaveAllToSheets,
  onDownloadAllData,
  onExportTally,
  isSavingSheets = false,
  sheetsUrl,
  canAct = true,
}: BatchSummaryCardProps) {
  const isComplete = total > 0 && successful + failed === total;

  return (
    <div className="rounded-2xl bg-slate-900/80 backdrop-blur-xl border border-sky-500/30 p-5 shadow-2xl space-y-4 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <span>{isComplete ? "Batch Processing Complete" : "Batch Processing in Progress"}</span>
              {isComplete && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Ready
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              Review batch ingestion metrics and trigger multi-destination actions below.
            </p>
          </div>
        </div>

        {sheetsUrl && (
          <a
            href={sheetsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <span>Open Google Sheet</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Metrics Row (Requirement 11) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
          <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider block">
            Total Files
          </span>
          <span className="text-xl font-bold font-mono text-slate-100">{total}</span>
        </div>

        <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
          <span className="text-[10px] uppercase font-semibold text-emerald-400 tracking-wider block flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Successful
          </span>
          <span className="text-xl font-bold font-mono text-emerald-400">{successful}</span>
        </div>

        <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30">
          <span className="text-[10px] uppercase font-semibold text-amber-400 tracking-wider block flex items-center justify-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Needs Review
          </span>
          <span className="text-xl font-bold font-mono text-amber-400">{needsReview}</span>
        </div>

        <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30">
          <span className="text-[10px] uppercase font-semibold text-rose-400 tracking-wider block flex items-center justify-center gap-1">
            <XCircle className="w-3 h-3" /> Failed
          </span>
          <span className="text-xl font-bold font-mono text-rose-400">{failed}</span>
        </div>

        <div className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-500/30 col-span-2 sm:col-span-1">
          <span className="text-[10px] uppercase font-semibold text-indigo-400 tracking-wider block flex items-center justify-center gap-1">
            <FileSpreadsheet className="w-3 h-3" /> Sheets Saved
          </span>
          <span className="text-xl font-bold font-mono text-indigo-400">{googleSheetsSaved}</span>
        </div>
      </div>

      {/* Action Buttons Toolbar (Requirements 4, 5, 9, 11) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
        <div className="text-xs text-slate-400">
          {successful > 0
            ? `${successful} invoice(s) ready for Google Sheets & download.`
            : "Waiting for batch completion..."}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Save All to Google Sheets (Requirement 4) */}
          <Button
            size="sm"
            variant="outline"
            className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20 gap-1.5 h-8 text-xs font-semibold"
            onClick={onSaveAllToSheets}
            isLoading={isSavingSheets}
            disabled={!canAct || successful === 0}
            title="Save only successfully validated invoices to Google Sheets"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Save All to Google Sheets</span>
          </Button>

          {/* Download All Data (Requirement 5) */}
          <Button
            size="sm"
            variant="outline"
            className="border-sky-500/40 text-sky-300 hover:bg-sky-500/20 gap-1.5 h-8 text-xs font-semibold"
            onClick={onDownloadAllData}
            disabled={!canAct || successful === 0}
            title="Download multi-sheet Excel (.xlsx), CSV, or JSON for all processed invoices"
          >
            <DownloadCloud className="w-3.5 h-3.5 text-sky-400" />
            <span>Download All Data</span>
          </Button>

          {/* Export Selected to Tally (Requirement 9) */}
          <Button
            size="sm"
            variant="outline"
            className="border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 gap-1.5 h-8 text-xs font-bold"
            onClick={onExportTally}
            disabled={!canAct || successful === 0}
            title="Review and export invoices into TallyPrime format"
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>Export Selected to Tally</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
