"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { DocumentRecord } from "@/types/document";
import { downloadBlob } from "@/lib/utils";
import {
  FileSpreadsheet,
  FileText,
  Code2,
  Copy,
  Check,
  DownloadCloud,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentRecord;
}

export function ExportModal({ isOpen, onClose, document }: ExportModalProps) {
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isTallyExporting, setIsTallyExporting] = useState(false);
  const [isSheetsExporting, setIsSheetsExporting] = useState(false);
  const [tallyVoucherType, setTallyVoucherType] = useState<"Purchase" | "Sales">("Purchase");
  const [tallyValidation, setTallyValidation] = useState<{
    isValid: boolean;
    errors: string[];
    voucherType?: string;
  } | null>(null);
  const [sheetsFeedback, setSheetsFeedback] = useState<{
    type: "success" | "error" | "warning";
    message: string;
    url?: string;
  } | null>(null);

  // Check Tally readiness when modal opens
  React.useEffect(() => {
    if (isOpen) {
      fetch("/api/export/tally", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: document.id,
          validateOnly: true,
          voucherType: tallyVoucherType,
        }),
      })
        .then((res) => res.json())
        .then((json) => {
          if (json.success && json.data?.validation) {
            setTallyValidation(json.data.validation);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, document.id, tallyVoucherType]);

  const handleExportGoogleSheets = async () => {
    setIsSheetsExporting(true);
    setSheetsFeedback(null);
    try {
      const res = await fetch("/api/sheets/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: document.id }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setSheetsFeedback({
          type: "error",
          message: data.error || "❌ Google Sheets authentication failed.",
        });
      } else if (data.duplicate) {
        setSheetsFeedback({
          type: "warning",
          message: data.message,
          url: data.spreadsheetUrl,
        });
      } else {
        const tallyMsg = data.tallyStatus
          ? data.tallyStatus.sheetTarget === "Tally Export"
            ? " & synced to Tally Export tab."
            : " (flagged to Tally Validation tab)."
          : "";
        setSheetsFeedback({
          type: "success",
          message: `✅ Invoice exported to Invoices${tallyMsg}`,
          url: data.spreadsheetUrl,
        });
      }
    } catch (err: any) {
      setSheetsFeedback({
        type: "error",
        message: err.message || "❌ Google Sheets authentication failed.",
      });
    } finally {
      setIsSheetsExporting(false);
    }
  };

  const handleDownloadTallyExcel = async () => {
    setIsTallyExporting(true);
    try {
      const res = await fetch("/api/export/tally", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: document.id,
          voucherType: tallyVoucherType,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Unable to export: No valid invoice data found.");
      }

      const blob = await res.blob();
      const invNo = document.aiResult?.cleanedData?.invoiceNumber;
      const baseName = (invNo || document.fileName.replace(/\.[^/.]+$/, "")).replace(/[^a-zA-Z0-9-_]/g, "_");
      downloadBlob(blob, `${baseName}_TallyPrime_Import.xlsx`);
    } catch (e: any) {
      console.error("Tally Excel download failed:", e);
      setSheetsFeedback({
        type: "error",
        message: e.message || "Unable to export: No valid invoice data found.",
      });
    } finally {
      setIsTallyExporting(false);
    }
  };

  const handleDownloadExcel = async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: document.id,
          format: "xlsx",
        }),
      });
      const blob = await res.blob();
      const baseName = document.fileName.replace(/\.[^/.]+$/, "");
      downloadBlob(blob, `${baseName}_Clean_Data.xlsx`);
    } catch (e) {
      console.error("Excel download failed:", e);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadCsv = async () => {
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: document.id,
          format: "csv",
        }),
      });
      const blob = await res.blob();
      const baseName = document.fileName.replace(/\.[^/.]+$/, "");
      downloadBlob(blob, `${baseName}_Clean_Data.csv`);
    } catch (e) {
      console.error("CSV download failed:", e);
    }
  };

  const handleDownloadJson = async () => {
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: document.id,
          format: "json",
        }),
      });
      const blob = await res.blob();
      const baseName = document.fileName.replace(/\.[^/.]+$/, "");
      downloadBlob(blob, `${baseName}_Clean_Data.json`);
    } catch (e) {
      console.error("JSON download failed:", e);
    }
  };

  const handleCopyJson = () => {
    const payload = document.aiResult?.cleanedData || document;
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Export Structured Data"
      description="Download clean results or sync live with Google Sheets"
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* TallyPrime Transaction Export Option */}
        <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 hover:border-amber-500/50 transition-colors space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-xs tracking-wider">
                TALLY
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <span>TallyPrime Import (.xlsx)</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    Accounting Ready
                  </span>
                </p>
                <p className="text-xs text-slate-400">
                  Item-wise rows, separate tax ledgers, preserved GSTIN/HSN codes & numbers
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex p-0.5 rounded-lg bg-slate-950 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setTallyVoucherType("Purchase")}
                  className={`px-2 py-0.5 text-[11px] font-bold rounded ${
                    tallyVoucherType === "Purchase"
                      ? "bg-amber-500 text-slate-950"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Purchase
                </button>
                <button
                  type="button"
                  onClick={() => setTallyVoucherType("Sales")}
                  className={`px-2 py-0.5 text-[11px] font-bold rounded ${
                    tallyVoucherType === "Sales"
                      ? "bg-sky-500 text-slate-950"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Sales
                </button>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="border-amber-500/40 text-amber-300 hover:bg-amber-500/20 hover:text-white gap-1.5"
                onClick={handleDownloadTallyExcel}
                isLoading={isTallyExporting}
              >
                <DownloadCloud className="w-4 h-4" />
                <span>Export to Tally</span>
              </Button>
            </div>
          </div>

          {/* Validation Status Indicator */}
          {tallyValidation && (
            <div
              className={`p-2.5 rounded-lg text-xs flex items-center justify-between gap-2 border ${
                tallyValidation.isValid
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                  : "bg-amber-500/10 border-amber-500/20 text-amber-300"
              }`}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                {tallyValidation.isValid ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
                <span className="truncate">
                  {tallyValidation.isValid
                    ? `Ready for Tally (${tallyValidation.voucherType || "Purchase"} Voucher, Ledgers & Taxes Verified)`
                    : `Validation Notice: ${tallyValidation.errors[0] || "Review required before importing"}`}
                </span>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 shrink-0">
                {tallyValidation.isValid ? "Ready" : "Flagged"}
              </span>
            </div>
          )}
        </div>

        {/* Google Sheets Live Export Option */}
        <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 hover:border-emerald-500/50 transition-colors space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <span>Google Sheets</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Live Sync
                  </span>
                </p>
                <p className="text-xs text-slate-400">
                  Appends invoice & items directly to your configured spreadsheet
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="emerald"
              onClick={handleExportGoogleSheets}
              isLoading={isSheetsExporting}
            >
              <span>Export to Google Sheets</span>
            </Button>
          </div>

          {/* Feedback banner */}
          {sheetsFeedback && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center justify-between gap-2 border ${
                sheetsFeedback.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : sheetsFeedback.type === "warning"
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-300"
              }`}
            >
              <div className="flex items-center gap-2">
                {sheetsFeedback.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{sheetsFeedback.message}</span>
              </div>
              {sheetsFeedback.url && (
                <a
                  href={sheetsFeedback.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline font-semibold flex items-center gap-1 hover:text-white shrink-0 ml-2"
                >
                  <span>Open Sheet</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}
        </div>

        {/* Excel Option */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-emerald-500/40 transition-colors flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">
                Download Clean Excel (.xlsx)
              </p>
              <p className="text-xs text-slate-400">
                Formatted 2-sheet workbook (Summary & Line Items)
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="emerald"
            onClick={handleDownloadExcel}
            isLoading={isExporting}
          >
            <DownloadCloud className="w-4 h-4" />
            <span>Excel</span>
          </Button>
        </div>

        {/* CSV Option */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-sky-500/40 transition-colors flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">
                Download CSV (.csv)
              </p>
              <p className="text-xs text-slate-400">
                Universal tabular export for spreadsheet software
              </p>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={handleDownloadCsv}>
            <DownloadCloud className="w-4 h-4" />
            <span>CSV</span>
          </Button>
        </div>

        {/* JSON Option */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-indigo-500/40 transition-colors flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">
                JSON Data Payload
              </p>
              <p className="text-xs text-slate-400">
                Full schema for API, ERP, or Tally ingestion
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleCopyJson}>
              {copied ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span>{copied ? "Copied" : "Copy"}</span>
            </Button>
            <Button size="sm" variant="secondary" onClick={handleDownloadJson}>
              <DownloadCloud className="w-4 h-4" />
              <span>JSON</span>
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
