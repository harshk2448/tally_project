"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { downloadBlob } from "@/lib/utils";
import {
  FileSpreadsheet,
  FileText,
  Code2,
  DownloadCloud,
  Layers,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

interface BulkDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentIds: string[];
  totalInvoices: number;
}

export function BulkDownloadModal({
  isOpen,
  onClose,
  documentIds,
  totalInvoices,
}: BulkDownloadModalProps) {
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async (format: "xlsx" | "csv" | "json" | "tally") => {
    setDownloadingFormat(format);
    setDownloadError(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentIds,
          format,
          // For Tally: NEEDS_REVIEW (unmapped masters) doesn't block export.
          // Only genuinely INVALID invoices (math errors) are excluded.
          ...(format === "tally" ? { includeUnready: true } : {}),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Download failed (${res.status})`);
      }

      const blob = await res.blob();
      const ext = format === "json" ? "json" : format === "csv" ? "csv" : "xlsx";
      const prefix = format === "tally" ? "TallyPrime_Batch_Import" : "Invoices_Bulk_Export";
      const filename = `${prefix}_${documentIds.length}_Documents.${ext}`;
      downloadBlob(blob, filename);

      onClose();
    } catch (err: any) {
      console.error("[Bulk Download Error]:", err);
      setDownloadError(err.message || "Failed to download bulk export file.");
    } finally {
      setDownloadingFormat(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Download All Data"
      description={`Export ${documentIds.length} selected invoice(s) in accounting-ready or structured data formats.`}
      maxWidth="md"
    >
      <div className="space-y-4">
        {downloadError && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{downloadError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2.5">
          {/* Option 1: Excel Workbook */}
          <div
            onClick={() => !downloadingFormat && handleDownload("xlsx")}
            className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-emerald-500/40 hover:bg-slate-900 transition-all cursor-pointer flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-slate-100 group-hover:text-emerald-300 transition-colors">
                    Excel Workbook (.xlsx)
                  </h4>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    2 Sheets
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Sheet 1: Invoices (21 columns) • Sheet 2: All line items & tax details.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20"
              isLoading={downloadingFormat === "xlsx"}
            >
              <DownloadCloud className="w-3.5 h-3.5 mr-1" />
              <span>Download</span>
            </Button>
          </div>

          {/* Option 2: CSV Consolidated */}
          <div
            onClick={() => !downloadingFormat && handleDownload("csv")}
            className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-sky-500/40 hover:bg-slate-900 transition-all cursor-pointer flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 group-hover:scale-105 transition-transform">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-100 group-hover:text-sky-300 transition-colors">
                  Consolidated CSV (.csv)
                </h4>
                <p className="text-xs text-slate-400">
                  Standard comma-separated format for database and spreadsheet imports.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-sky-500/40 text-sky-300 hover:bg-sky-500/20"
              isLoading={downloadingFormat === "csv"}
            >
              <DownloadCloud className="w-3.5 h-3.5 mr-1" />
              <span>Download</span>
            </Button>
          </div>

          {/* Option 3: Structured JSON */}
          <div
            onClick={() => !downloadingFormat && handleDownload("json")}
            className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-indigo-500/40 hover:bg-slate-900 transition-all cursor-pointer flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
                <Code2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-slate-100 group-hover:text-indigo-300 transition-colors">
                    Structured JSON (.json)
                  </h4>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                    Exact Schema
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Normalized JSON payload {"{ invoices: [...] }"} with full line items & taxes.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/20"
              isLoading={downloadingFormat === "json"}
            >
              <DownloadCloud className="w-3.5 h-3.5 mr-1" />
              <span>Download</span>
            </Button>
          </div>

          {/* Option 4: Tally Data */}
          <div
            onClick={() => !downloadingFormat && handleDownload("tally")}
            className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 hover:border-amber-500/50 hover:bg-amber-950/30 transition-all cursor-pointer flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-xs group-hover:scale-105 transition-transform">
                TALLY
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-slate-100 group-hover:text-amber-300 transition-colors">
                    TallyPrime Import (.xlsx)
                  </h4>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    Accounting Ready
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Item-wise rows, separate tax ledgers, preserved GSTIN/HSN codes & numbers.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-amber-500/40 text-amber-300 hover:bg-amber-500/20 font-bold"
              isLoading={downloadingFormat === "tally"}
            >
              <DownloadCloud className="w-3.5 h-3.5 mr-1" />
              <span>Download</span>
            </Button>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-800">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={Boolean(downloadingFormat)}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
