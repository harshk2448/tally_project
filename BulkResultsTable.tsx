"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { DocumentRecord } from "@/types/document";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency, getConfidenceBadge } from "@/lib/utils";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  RefreshCw,
  FileText,
  ExternalLink,
  CheckSquare,
  Square,
  MinusSquare,
} from "lucide-react";

export interface BulkItemRecord {
  id: string;
  file: File;
  stage: "queued" | "optimizing" | "uploading" | "ocr" | "cleaning" | "completed" | "error";
  errorMessage?: string;
  documentRecord?: DocumentRecord;
  validationStatus: "VALID" | "NEEDS_REVIEW" | "FAILED" | "QUEUED";
  validationErrors: string[];
}

interface BulkResultsTableProps {
  items: BulkItemRecord[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onSelectValidOnly: () => void;
  onRetryItem: (id: string) => void;
}

export function BulkResultsTable({
  items,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onSelectValidOnly,
  onRetryItem,
}: BulkResultsTableProps) {
  const completedItems = useMemo(
    () => items.filter((it) => it.stage === "completed" || it.stage === "error"),
    [items]
  );

  const allSelected =
    completedItems.length > 0 &&
    completedItems.every((it) => selectedIds.includes(it.id));

  const someSelected =
    completedItems.some((it) => selectedIds.includes(it.id)) && !allSelected;

  if (completedItems.length === 0) return null;

  return (
    <div className="rounded-2xl bg-slate-950/70 backdrop-blur-xl border border-slate-800 overflow-hidden shadow-2xl space-y-3 p-4 animate-fadeIn">
      {/* Table Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold text-xs">
            BULK
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
              Bulk OCR Results ({completedItems.length})
            </h3>
            <p className="text-xs text-slate-400">
              {selectedIds.length} invoice(s) selected for export and Google Sheets sync.
            </p>
          </div>
        </div>

        {/* Selection Shortcuts (Requirement 3 & 10) */}
        <div className="flex items-center gap-1.5 text-xs">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2 text-slate-300 hover:text-white"
            onClick={onSelectAll}
          >
            <CheckSquare className="w-3.5 h-3.5 mr-1 text-sky-400" />
            <span>Select All</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2 text-slate-300 hover:text-white"
            onClick={onSelectValidOnly}
            title="Select only invoices that passed all math and validation checks"
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-400" />
            <span>Select Valid Only</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2 text-slate-400 hover:text-slate-200"
            onClick={onClearSelection}
            disabled={selectedIds.length === 0}
          >
            <Square className="w-3.5 h-3.5 mr-1" />
            <span>Clear Selection</span>
          </Button>
        </div>
      </div>

      {/* Table Wrapper */}
      <div className="rounded-xl border border-slate-800/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="px-3 py-2.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={() => (allSelected ? onClearSelection() : onSelectAll())}
                    className="rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-500 cursor-pointer"
                  />
                </th>
                <th className="px-3 py-2.5 font-semibold">File</th>
                <th className="px-3 py-2.5 font-semibold">Vendor</th>
                <th className="px-3 py-2.5 font-semibold">Invoice No</th>
                <th className="px-3 py-2.5 font-semibold">Date</th>
                <th className="px-3 py-2.5 font-semibold">GSTIN</th>
                <th className="px-3 py-2.5 font-semibold text-right">Total</th>
                <th className="px-3 py-2.5 font-semibold text-center">Confidence</th>
                <th className="px-3 py-2.5 font-semibold text-center">Status</th>
                <th className="px-3 py-2.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {completedItems.map((item) => {
                const doc = item.documentRecord;
                const data = doc?.aiResult?.cleanedData;
                const isSelected = selectedIds.includes(item.id);
                const isErr = item.stage === "error";

                const invNumber = data?.invoiceNumber || (isErr ? "—" : "Missing");
                const invDate = data?.invoiceDate || "—";
                const vendor = data?.vendorName || (isErr ? "—" : "Unassigned Vendor");
                const gstin = data?.vendorGstin || "—";
                const total = data?.grandTotal || 0;
                const currency = data?.currency || "INR";
                const confidence = doc?.confidenceScore || 0;
                const badge = getConfidenceBadge(confidence);

                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-slate-900/50 transition-colors ${
                      isSelected ? "bg-sky-500/5" : ""
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isErr}
                        onChange={() => onToggleSelect(item.id)}
                        className="rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-500 cursor-pointer disabled:opacity-30"
                      />
                    </td>

                    {/* File */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2 max-w-[200px]">
                        <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span className="truncate font-medium text-slate-200" title={item.file.name}>
                          {item.file.name}
                        </span>
                      </div>
                    </td>

                    {/* Vendor */}
                    <td className="px-3 py-2.5 max-w-[180px] truncate" title={vendor}>
                      <span className={vendor === "Unassigned Vendor" ? "text-slate-500 italic" : "text-slate-200"}>
                        {vendor}
                      </span>
                    </td>

                    {/* Invoice Number */}
                    <td className="px-3 py-2.5 font-mono">
                      <span className={invNumber === "Missing" ? "text-amber-400" : "text-slate-200"}>
                        {invNumber}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-3 py-2.5 font-mono text-slate-400">{invDate}</td>

                    {/* GSTIN */}
                    <td className="px-3 py-2.5 font-mono text-slate-400">
                      {gstin !== "—" ? (
                        <span className="text-slate-300">{gstin}</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Total */}
                    <td className="px-3 py-2.5 text-right font-mono font-semibold">
                      {isErr ? (
                        <span className="text-slate-600">—</span>
                      ) : (
                        <span className="text-emerald-400">{formatCurrency(total, currency)}</span>
                      )}
                    </td>

                    {/* Confidence */}
                    <td className="px-3 py-2.5 text-center">
                      {isErr ? (
                        <span className="text-slate-600 font-mono">—</span>
                      ) : (
                        <span className={`text-[11px] font-semibold ${badge.color}`}>
                          {confidence}%
                        </span>
                      )}
                    </td>

                    {/* Status (Requirement 10) */}
                    <td className="px-3 py-2.5 text-center">
                      {item.validationStatus === "VALID" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" /> Valid
                        </span>
                      )}
                      {item.validationStatus === "NEEDS_REVIEW" && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 cursor-help"
                          title={item.validationErrors.join("; ") || "Review required"}
                        >
                          <AlertTriangle className="w-3 h-3 text-amber-400" /> Needs Review
                        </span>
                      )}
                      {item.validationStatus === "FAILED" && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 cursor-help"
                          title={item.errorMessage || "Processing failed"}
                        >
                          <XCircle className="w-3 h-3" /> Failed
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2.5 text-right">
                      {isErr ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px] px-2 text-rose-300 hover:text-white hover:bg-rose-500/20 gap-1"
                          onClick={() => onRetryItem(item.id)}
                          title="Retry processing this document"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Retry</span>
                        </Button>
                      ) : doc ? (
                        <Link href={`/documents/${doc.id}/validate`}>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[11px] px-2 text-sky-400 hover:text-white hover:bg-sky-500/20 gap-1"
                            title="Open in Validation Studio"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>Studio</span>
                          </Button>
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
