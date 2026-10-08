"use client";

import React, { useState, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import { DocumentRecord, ExtractedInvoice } from "@/types/document";
import { TallyImportRow, TALLY_IMPORT_COLUMNS, TallyProfile } from "@/types/tally";
import { createTallyImportRows } from "@/lib/tally-utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { downloadBlob } from "@/lib/utils";
import {
  FileSpreadsheet,
  DownloadCloud,
  Search,
  Copy,
  Check,
  CheckSquare,
  Square,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  Sparkles,
  ExternalLink,
} from "lucide-react";

interface TallyDataTableProps {
  document?: DocumentRecord;
  documents?: DocumentRecord[];
  formData?: ExtractedInvoice;
  voucherType?: "Auto" | "Purchase" | "Sales";
  onVoucherTypeChange?: (val: "Auto" | "Purchase" | "Sales") => void;
  showExportButton?: boolean;
  compact?: boolean;
  activeProfile?: TallyProfile;
  onProfileUpdate?: (profile: TallyProfile) => void;
}

type SortField = keyof TallyImportRow;
type SortDirection = "asc" | "desc";

export function TallyDataTable({
  document,
  documents,
  formData,
  voucherType = "Auto",
  onVoucherTypeChange,
  showExportButton = true,
  compact = false,
  activeProfile: propProfile,
  onProfileUpdate,
}: TallyDataTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("ALL");
  const [gstRateFilter, setGstRateFilter] = useState<string>("ALL");
  const [sortField, setSortField] = useState<SortField>("voucherDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [sheetsToast, setSheetsToast] = useState<{
    type: "success" | "error";
    message: string;
    url?: string;
  } | null>(null);
  const [localProfile, setLocalProfile] = useState<TallyProfile | undefined>(propProfile);

  // Sync profile from server if not provided via props
  useEffect(() => {
    if (propProfile) {
      setLocalProfile(propProfile);
      return;
    }
    fetch("/api/tally/profiles")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && json.data?.activeProfile) {
          setLocalProfile(json.data.activeProfile);
        }
      })
      .catch(() => {});
  }, [propProfile]);

  const profileToUse = propProfile || localProfile;

  // Single Source of Truth: Generate canonical 21-column rows
  const allRows: TallyImportRow[] = useMemo(() => {
    const explicitVoucherType = voucherType !== "Auto" ? voucherType : undefined;

    // Case 1: Multiple documents provided (Bulk / Repository view)
    if (documents && documents.length > 0) {
      return documents.flatMap((doc) =>
        createTallyImportRows(doc, {
          profile: profileToUse,
          explicitVoucherType,
        })
      );
    }

    // Case 2: Single document with optional live formData
    if (document) {
      const effectiveDoc = {
        ...document,
        aiResult: {
          ...(document.aiResult as any),
          cleanedData: formData || document.aiResult?.cleanedData,
        },
        ocrResult: document.ocrResult,
      };

      return createTallyImportRows(effectiveDoc, {
        profile: profileToUse,
        explicitVoucherType,
      });
    }

    // Case 3: Raw formData
    if (formData) {
      return createTallyImportRows(formData, {
        profile: profileToUse,
        explicitVoucherType,
      });
    }

    return [];
  }, [document, documents, formData, voucherType, profileToUse]);

  // Initial selection: select all rows by default
  useEffect(() => {
    setSelectedRowIds(allRows.map((r, idx) => r.id || `${r.voucherNumber}-${idx}`));
  }, [allRows]);

  // Distinct states for filter
  const distinctStates = useMemo(() => {
    const states = new Set<string>();
    allRows.forEach((r) => {
      if (r.state && r.state.trim()) states.add(r.state.trim());
    });
    return Array.from(states).sort();
  }, [allRows]);

  // Distinct GST rates for filter
  const distinctGstRates = useMemo(() => {
    const rates = new Set<number>();
    allRows.forEach((r) => {
      rates.add(r.itemGstRate);
    });
    return Array.from(rates).sort((a, b) => a - b);
  }, [allRows]);

  // Filtered & Sorted rows
  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      const matchesState = stateFilter === "ALL" || r.state === stateFilter;
      const matchesGstRate =
        gstRateFilter === "ALL" || String(r.itemGstRate) === gstRateFilter;

      if (!matchesState || !matchesGstRate) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        r.voucherNumber.toLowerCase().includes(q) ||
        r.voucherRefNo.toLowerCase().includes(q) ||
        r.partyName.toLowerCase().includes(q) ||
        r.state.toLowerCase().includes(q) ||
        r.gstNumber.toLowerCase().includes(q) ||
        r.itemName.toLowerCase().includes(q) ||
        r.itemHsn.toLowerCase().includes(q) ||
        r.itemDescription.toLowerCase().includes(q) ||
        r.salesLedger.toLowerCase().includes(q) ||
        r.narration.toLowerCase().includes(q) ||
        r.deliveryNote.toLowerCase().includes(q) ||
        r.deliveryNo.toLowerCase().includes(q)
      );
    });
  }, [allRows, stateFilter, gstRateFilter, searchQuery]);

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows];
    rows.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }

      const strA = String(aVal || "").toLowerCase();
      const strB = String(bVal || "").toLowerCase();
      return sortDirection === "asc"
        ? strA.localeCompare(strB)
        : strB.localeCompare(strA);
    });
    return rows;
  }, [filteredRows, sortField, sortDirection]);

  // Row selection helpers
  const handleToggleSelectRow = (rowId: string) => {
    setSelectedRowIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    );
  };

  const isAllSelected =
    sortedRows.length > 0 &&
    sortedRows.every((r, idx) =>
      selectedRowIds.includes(r.id || `${r.voucherNumber}-${idx}`)
    );

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedRowIds([]);
    } else {
      setSelectedRowIds(
        sortedRows.map((r, idx) => r.id || `${r.voucherNumber}-${idx}`)
      );
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const selectedRows = sortedRows.filter((r, idx) =>
      selectedRowIds.includes(r.id || `${r.voucherNumber}-${idx}`)
    );

    const totalTaxable = selectedRows.reduce((sum, r) => sum + r.taxableAmount, 0);
    const totalIgst = selectedRows.reduce((sum, r) => sum + r.igstValue, 0);
    const totalCgst = selectedRows.reduce((sum, r) => sum + r.cgstValue, 0);
    const totalSgst = selectedRows.reduce((sum, r) => sum + r.sgstValue, 0);
    const grandTotal = totalTaxable + totalIgst + totalCgst + totalSgst;

    const voucherNumbers = new Set(selectedRows.map((r) => r.voucherNumber));

    return {
      selectedCount: selectedRows.length,
      invoiceCount: voucherNumbers.size,
      totalTaxable: Number(totalTaxable.toFixed(2)),
      totalIgst: Number(totalIgst.toFixed(2)),
      totalCgst: Number(totalCgst.toFixed(2)),
      totalSgst: Number(totalSgst.toFixed(2)),
      grandTotal: Number(grandTotal.toFixed(2)),
    };
  }, [sortedRows, selectedRowIds]);

  // 1-Click Excel Download: Tally_Import_YYYY-MM-DD.xlsx containing ONLY the Tally Import sheet
  const handleExportToTally = async (exportAll = false) => {
    setIsExporting(true);
    try {
      const rowsToExport = exportAll
        ? allRows
        : sortedRows.filter((r, idx) =>
            selectedRowIds.includes(r.id || `${r.voucherNumber}-${idx}`)
          );

      if (rowsToExport.length === 0) {
        alert("No rows selected for export.");
        return;
      }

      // Build single worksheet with typed cells
      const wb = XLSX.utils.book_new();
      const ws: XLSX.WorkSheet = {};
      const range = {
        s: { c: 0, r: 0 },
        e: { c: TALLY_IMPORT_COLUMNS.length - 1, r: rowsToExport.length },
      };

      // Set headers
      TALLY_IMPORT_COLUMNS.forEach((h, c) => {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c });
        ws[cellRef] = { t: "s", v: h };
      });

      // Strict numeric column indices:
      // 6: ITEM GST RATE, 10: Quantity, 11: Rate, 12: TAXABLE AMOUNT, 14: IGST VALUE, 15: CGST VALUE, 16: SGST VALUE
      const numericIndices = new Set([6, 10, 11, 12, 14, 15, 16]);

      rowsToExport.forEach((row, rIdx) => {
        const r = rIdx + 1;
        const values = [
          row.voucherDate,
          row.voucherNumber,
          row.voucherRefNo,
          row.partyName,
          row.state,
          row.gstNumber,
          row.itemGstRate,
          row.itemHsn,
          row.itemName,
          row.units,
          row.quantity,
          row.rate,
          row.taxableAmount,
          row.salesLedger,
          row.igstValue,
          row.cgstValue,
          row.sgstValue,
          row.itemDescription,
          row.narration,
          row.deliveryNote,
          row.deliveryNo,
        ];

        values.forEach((val, c) => {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          if (val === null || val === undefined || val === "") {
            ws[cellRef] = { t: "s", v: "" };
          } else if (numericIndices.has(c)) {
            const num = typeof val === "number" ? val : Number(val);
            ws[cellRef] = isNaN(num) ? { t: "s", v: "" } : { t: "n", v: num };
          } else {
            ws[cellRef] = { t: "s", v: String(val).trim() };
          }
        });
      });

      ws["!ref"] = XLSX.utils.encode_range(range);
      ws["!freeze"] = { xSplit: 0, ySplit: 1 };
      ws["!views"] = [{ state: "frozen", ySplit: 1 }];
      ws["!autofilter"] = { ref: XLSX.utils.encode_range(range) };
      ws["!cols"] = [
        { wch: 14 }, // 1. Voucher Date
        { wch: 18 }, // 2. Voucher Number
        { wch: 18 }, // 3. Voucher Ref. No
        { wch: 32 }, // 4. Party Name
        { wch: 16 }, // 5. State
        { wch: 18 }, // 6. GST Number
        { wch: 15 }, // 7. ITEM GST RATE
        { wch: 14 }, // 8. ITEM HSN
        { wch: 32 }, // 9. Item Name
        { wch: 10 }, // 10. Units
        { wch: 12 }, // 11. Quantity
        { wch: 12 }, // 12. Rate
        { wch: 18 }, // 13. TAXABLE AMOUNT
        { wch: 24 }, // 14. SALES LEDGER
        { wch: 14 }, // 15. IGST VALUE
        { wch: 14 }, // 16. CGST VALUE
        { wch: 14 }, // 17. SGST VALUE
        { wch: 30 }, // 18. ITEM DESCRIPTION
        { wch: 25 }, // 19. NARRATION
        { wch: 18 }, // 20. Delivery Note
        { wch: 16 }, // 21. Delivery No.
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Tally Data");
      const excelBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const blob = new Blob([excelBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const today = new Date().toISOString().split("T")[0];
      downloadBlob(blob, `Tally_Data_${today}.xlsx`);
    } catch (err: any) {
      console.error("Export to Tally failed:", err);
      alert("Failed to export Excel: " + (err.message || err));
    } finally {
      setIsExporting(false);
    }
  };

  // Copy table as TSV (Tab-Separated Values) for direct paste into Excel
  const handleCopyTsv = () => {
    const selectedRows = sortedRows.filter((r, idx) =>
      selectedRowIds.includes(r.id || `${r.voucherNumber}-${idx}`)
    );

    const headerLine = TALLY_IMPORT_COLUMNS.join("\t");
    const dataLines = selectedRows.map((r) =>
      [
        r.voucherDate,
        r.voucherNumber,
        r.voucherRefNo,
        r.partyName,
        r.state,
        r.gstNumber,
        r.itemGstRate,
        r.itemHsn,
        r.itemName,
        r.units,
        r.quantity,
        r.rate,
        r.taxableAmount,
        r.salesLedger,
        r.igstValue,
        r.cgstValue,
        r.sgstValue,
        r.itemDescription,
        r.narration,
        r.deliveryNote,
        r.deliveryNo,
      ].join("\t")
    );

    const tsv = [headerLine, ...dataLines].join("\n");
    navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Sync selected rows directly to Google Sheets "Tally Data" tab
  const handleSyncToGoogleSheets = async () => {
    setIsSyncingSheets(true);
    setSheetsToast(null);
    try {
      const rowsToSync = sortedRows.filter((r, idx) =>
        selectedRowIds.includes(r.id || `${r.voucherNumber}-${idx}`)
      );
      if (rowsToSync.length === 0) {
        alert("No rows selected to sync.");
        return;
      }
      const res = await fetch("/api/sheets/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tallyRows: rowsToSync }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSheetsToast({
          type: "error",
          message: data.error || "Failed to sync rows to Google Sheets.",
        });
      } else {
        setSheetsToast({
          type: "success",
          message: `✅ Saved ${data.saved ?? rowsToSync.length} row(s) to Google Sheets 'Tally Data' tab!`,
          url: data.spreadsheetUrl,
        });
      }
    } catch (err: any) {
      setSheetsToast({
        type: "error",
        message: err.message || "Failed to sync to Google Sheets.",
      });
    } finally {
      setIsSyncingSheets(false);
      setTimeout(() => setSheetsToast(null), 10000);
    }
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-600 inline ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3 h-3 text-amber-400 inline ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 text-amber-400 inline ml-1" />
    );
  };

  return (
    <div className="rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-amber-500/30 overflow-hidden shadow-2xl space-y-3 p-4">
      {/* Google Sheets Toast Notification */}
      {sheetsToast && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
            sheetsToast.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
              : "bg-rose-950/40 border-rose-500/30 text-rose-300"
          }`}
        >
          <span>{sheetsToast.message}</span>
          {sheetsToast.url && (
            <a
              href={sheetsToast.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-sky-400 hover:text-sky-300 underline whitespace-nowrap"
            >
              <span>Open Google Sheet</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}

      {/* Spreadsheet Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500/30 to-amber-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-extrabold text-xs shadow-md shadow-amber-500/10">
            TALLY
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                Tally Import
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                21 Columns Verified
              </span>
              <span className="text-[11px] text-slate-400 font-medium">
                ({allRows.length} item {allRows.length === 1 ? "row" : "rows"})
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Live flat table structure matching Tally Excel Import specifications exactly 1:1
            </p>
          </div>
        </div>

        {/* Voucher Type & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {onVoucherTypeChange && (
            <select
              value={voucherType}
              onChange={(e) => onVoucherTypeChange(e.target.value as any)}
              className="h-8 px-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="Auto">Auto-Detect Type</option>
              <option value="Purchase">Purchase (Inward)</option>
              <option value="Sales">Sales (Outward)</option>
            </select>
          )}

          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-slate-700 text-slate-300 hover:text-white gap-1"
            onClick={handleCopyTsv}
            title="Copy selected rows as TSV to paste directly into Excel"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? "Copied" : "Copy Table"}</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 gap-1.5"
            onClick={handleSyncToGoogleSheets}
            isLoading={isSyncingSheets}
            disabled={summaryMetrics.selectedCount === 0}
            title="Sync selected rows to Google Sheet 'Tally Data' tab"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Sync to Google Sheet</span>
          </Button>

          {showExportButton && (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                className="h-8 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 text-xs shadow-md shadow-amber-500/20 gap-1.5"
                onClick={() => handleExportToTally(false)}
                isLoading={isExporting}
                disabled={summaryMetrics.selectedCount === 0}
                title="Download single Excel file containing all selected rows (Tally_Data_YYYY-MM-DD.xlsx)"
              >
                <DownloadCloud className="w-3.5 h-3.5 text-slate-950" />
                <span>Export to Tally</span>
                {summaryMetrics.selectedCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded bg-amber-600/40 text-[10px] text-slate-950 font-extrabold">
                    {summaryMetrics.selectedCount}
                  </span>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs bg-slate-900/60 p-2 rounded-xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in all 21 columns..."
              className="w-full h-7 pl-8 pr-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* State Filter */}
          {distinctStates.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-slate-400 font-medium">State:</span>
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="h-7 px-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-amber-400 cursor-pointer"
              >
                <option value="ALL">All States ({distinctStates.length})</option>
                {distinctStates.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* GST Rate Filter */}
          {distinctGstRates.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-slate-400 font-medium">GST Rate:</span>
              <select
                value={gstRateFilter}
                onChange={(e) => setGstRateFilter(e.target.value)}
                className="h-7 px-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-amber-400 cursor-pointer"
              >
                <option value="ALL">All Rates</option>
                {distinctGstRates.map((r) => (
                  <option key={r} value={String(r)}>
                    {r}%
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Selection Stats */}
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span>
            Selected: <strong className="text-amber-300">{summaryMetrics.selectedCount}</strong> of {allRows.length} rows
          </span>
          <button
            onClick={handleToggleSelectAll}
            className="text-xs text-sky-400 hover:text-sky-300 underline font-medium cursor-pointer ml-1"
          >
            {isAllSelected ? "Deselect All" : "Select All"}
          </button>
        </div>
      </div>

      {/* SPREADSHEET TABLE: Exactly the 21 columns in exact order */}
      <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/40">
        <div className="overflow-x-auto max-h-[480px]">
          <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
            <thead className="bg-slate-950 text-slate-300 uppercase tracking-wider text-[10px] sticky top-0 z-10 border-b border-slate-800 select-none shadow-sm">
              <tr>
                {/* Select column */}
                <th className="px-2.5 py-2.5 w-8 text-center bg-slate-950 sticky left-0 z-20 border-r border-slate-800">
                  <button
                    onClick={handleToggleSelectAll}
                    className="text-slate-400 hover:text-amber-400 cursor-pointer flex items-center justify-center"
                    title={isAllSelected ? "Deselect All" : "Select All"}
                  >
                    {isAllSelected ? (
                      <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                  </button>
                </th>

                {/* 1. Voucher Date */}
                <th
                  onClick={() => handleSort("voucherDate")}
                  className="px-3 py-2.5 font-bold cursor-pointer hover:text-amber-300 group transition-colors"
                >
                  1. Voucher Date {renderSortIndicator("voucherDate")}
                </th>

                {/* 2. Voucher Number */}
                <th
                  onClick={() => handleSort("voucherNumber")}
                  className="px-3 py-2.5 font-bold cursor-pointer hover:text-amber-300 group transition-colors"
                >
                  2. Voucher Number {renderSortIndicator("voucherNumber")}
                </th>

                {/* 3. Voucher Ref. No */}
                <th
                  onClick={() => handleSort("voucherRefNo")}
                  className="px-3 py-2.5 font-bold cursor-pointer hover:text-amber-300 group transition-colors"
                >
                  3. Voucher Ref. No {renderSortIndicator("voucherRefNo")}
                </th>

                {/* 4. Party Name */}
                <th
                  onClick={() => handleSort("partyName")}
                  className="px-3 py-2.5 font-bold cursor-pointer hover:text-amber-300 group transition-colors"
                >
                  4. Party Name {renderSortIndicator("partyName")}
                </th>

                {/* 5. State */}
                <th
                  onClick={() => handleSort("state")}
                  className="px-3 py-2.5 font-bold cursor-pointer hover:text-amber-300 group transition-colors"
                >
                  5. State {renderSortIndicator("state")}
                </th>

                {/* 6. GST Number */}
                <th
                  onClick={() => handleSort("gstNumber")}
                  className="px-3 py-2.5 font-bold cursor-pointer hover:text-amber-300 group transition-colors"
                >
                  6. GST Number {renderSortIndicator("gstNumber")}
                </th>

                {/* 7. ITEM GST RATE */}
                <th
                  onClick={() => handleSort("itemGstRate")}
                  className="px-3 py-2.5 font-bold text-center cursor-pointer hover:text-amber-300 group transition-colors"
                >
                  7. ITEM GST RATE {renderSortIndicator("itemGstRate")}
                </th>

                {/* 8. ITEM HSN */}
                <th
                  onClick={() => handleSort("itemHsn")}
                  className="px-3 py-2.5 font-bold cursor-pointer hover:text-amber-300 group transition-colors"
                >
                  8. ITEM HSN {renderSortIndicator("itemHsn")}
                </th>

                {/* 9. Item Name */}
                <th
                  onClick={() => handleSort("itemName")}
                  className="px-3 py-2.5 font-bold cursor-pointer hover:text-amber-300 group transition-colors"
                >
                  9. Item Name {renderSortIndicator("itemName")}
                </th>

                {/* 10. Units */}
                <th
                  onClick={() => handleSort("units")}
                  className="px-3 py-2.5 font-bold text-center cursor-pointer hover:text-amber-300 group transition-colors"
                >
                  10. Units {renderSortIndicator("units")}
                </th>

                {/* 11. Quantity */}
                <th
                  onClick={() => handleSort("quantity")}
                  className="px-3 py-2.5 font-bold text-right cursor-pointer hover:text-amber-300 group transition-colors"
                >
                  11. Quantity {renderSortIndicator("quantity")}
                </th>

                {/* 12. Rate */}
                <th
                  onClick={() => handleSort("rate")}
                  className="px-3 py-2.5 font-bold text-right cursor-pointer hover:text-amber-300 group transition-colors"
                >
                  12. Rate {renderSortIndicator("rate")}
                </th>

                {/* 13. TAXABLE AMOUNT */}
                <th
                  onClick={() => handleSort("taxableAmount")}
                  className="px-3 py-2.5 font-bold text-right text-amber-300 cursor-pointer hover:text-amber-200 group transition-colors"
                >
                  13. TAXABLE AMOUNT {renderSortIndicator("taxableAmount")}
                </th>

                {/* 14. SALES LEDGER */}
                <th
                  onClick={() => handleSort("salesLedger")}
                  className="px-3 py-2.5 font-bold cursor-pointer hover:text-amber-300 group transition-colors"
                >
                  14. SALES LEDGER {renderSortIndicator("salesLedger")}
                </th>

                {/* 15. IGST VALUE */}
                <th
                  onClick={() => handleSort("igstValue")}
                  className="px-3 py-2.5 font-bold text-right text-indigo-300 cursor-pointer hover:text-indigo-200 group transition-colors"
                >
                  15. IGST VALUE {renderSortIndicator("igstValue")}
                </th>

                {/* 16. CGST VALUE */}
                <th
                  onClick={() => handleSort("cgstValue")}
                  className="px-3 py-2.5 font-bold text-right text-emerald-300 cursor-pointer hover:text-emerald-200 group transition-colors"
                >
                  16. CGST VALUE {renderSortIndicator("cgstValue")}
                </th>

                {/* 17. SGST VALUE */}
                <th
                  onClick={() => handleSort("sgstValue")}
                  className="px-3 py-2.5 font-bold text-right text-emerald-300 cursor-pointer hover:text-emerald-200 group transition-colors"
                >
                  17. SGST VALUE {renderSortIndicator("sgstValue")}
                </th>

                {/* 18. ITEM DESCRIPTION */}
                <th
                  onClick={() => handleSort("itemDescription")}
                  className="px-3 py-2.5 font-bold cursor-pointer hover:text-amber-300 group transition-colors"
                >
                  18. ITEM DESCRIPTION {renderSortIndicator("itemDescription")}
                </th>

                {/* 19. NARRATION */}
                <th
                  onClick={() => handleSort("narration")}
                  className="px-3 py-2.5 font-bold cursor-pointer hover:text-amber-300 group transition-colors"
                >
                  19. NARRATION {renderSortIndicator("narration")}
                </th>

                {/* 20. Delivery Note */}
                <th
                  onClick={() => handleSort("deliveryNote")}
                  className="px-3 py-2.5 font-bold cursor-pointer hover:text-amber-300 group transition-colors"
                >
                  20. Delivery Note {renderSortIndicator("deliveryNote")}
                </th>

                {/* 21. Delivery No. */}
                <th
                  onClick={() => handleSort("deliveryNo")}
                  className="px-3 py-2.5 font-bold cursor-pointer hover:text-amber-300 group transition-colors"
                >
                  21. Delivery No. {renderSortIndicator("deliveryNo")}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px] text-slate-300">
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={22} className="px-4 py-8 text-center text-slate-500 font-sans text-xs">
                    No Tally Import rows found matching your search.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row, idx) => {
                  const rowId = row.id || `${row.voucherNumber}-${idx}`;
                  const isSelected = selectedRowIds.includes(rowId);

                  return (
                    <tr
                      key={rowId}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        !isSelected ? "opacity-35" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-2.5 py-1.5 text-center bg-slate-950/70 sticky left-0 z-1 border-r border-slate-800">
                        <button
                          onClick={() => handleToggleSelectRow(rowId)}
                          className="text-slate-400 hover:text-amber-400 cursor-pointer flex items-center justify-center"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>

                      {/* 1. Voucher Date */}
                      <td className="px-3 py-1.5 font-semibold text-slate-200">
                        {row.voucherDate || "—"}
                      </td>

                      {/* 2. Voucher Number */}
                      <td className="px-3 py-1.5 text-slate-100 font-medium">
                        {row.voucherNumber || "—"}
                      </td>

                      {/* 3. Voucher Ref. No */}
                      <td className="px-3 py-1.5 text-slate-400">
                        {row.voucherRefNo || "—"}
                      </td>

                      {/* 4. Party Name */}
                      <td className="px-3 py-1.5 font-sans font-medium text-slate-200 max-w-[200px] truncate" title={row.partyName}>
                        {row.partyName || "—"}
                      </td>

                      {/* 5. State */}
                      <td className="px-3 py-1.5 font-sans text-slate-300">
                        {row.state || "—"}
                      </td>

                      {/* 6. GST Number */}
                      <td className="px-3 py-1.5 text-slate-400">
                        {row.gstNumber || "—"}
                      </td>

                      {/* 7. ITEM GST RATE */}
                      <td className="px-3 py-1.5 text-center text-amber-400 font-semibold">
                        {row.itemGstRate}%
                      </td>

                      {/* 8. ITEM HSN */}
                      <td className="px-3 py-1.5 text-slate-400">
                        {row.itemHsn || "—"}
                      </td>

                      {/* 9. Item Name */}
                      <td className="px-3 py-1.5 font-sans font-medium text-slate-100 max-w-[240px] truncate" title={row.itemName}>
                        {row.itemName || "—"}
                      </td>

                      {/* 10. Units */}
                      <td className="px-3 py-1.5 text-center text-slate-400">
                        {row.units}
                      </td>

                      {/* 11. Quantity */}
                      <td className="px-3 py-1.5 text-right font-medium text-slate-200">
                        {row.quantity}
                      </td>

                      {/* 12. Rate */}
                      <td className="px-3 py-1.5 text-right text-slate-300">
                        {row.rate.toFixed(2)}
                      </td>

                      {/* 13. TAXABLE AMOUNT */}
                      <td className="px-3 py-1.5 text-right font-bold text-amber-300">
                        {row.taxableAmount.toFixed(2)}
                      </td>

                      {/* 14. SALES LEDGER */}
                      <td className="px-3 py-1.5 font-sans text-slate-300 max-w-[160px] truncate" title={row.salesLedger}>
                        {row.salesLedger}
                      </td>

                      {/* 15. IGST VALUE */}
                      <td className={`px-3 py-1.5 text-right ${row.igstValue > 0 ? "font-bold text-indigo-400" : "text-slate-600"}`}>
                        {row.igstValue.toFixed(2)}
                      </td>

                      {/* 16. CGST VALUE */}
                      <td className={`px-3 py-1.5 text-right ${row.cgstValue > 0 ? "font-bold text-emerald-400" : "text-slate-600"}`}>
                        {row.cgstValue.toFixed(2)}
                      </td>

                      {/* 17. SGST VALUE */}
                      <td className={`px-3 py-1.5 text-right ${row.sgstValue > 0 ? "font-bold text-emerald-400" : "text-slate-600"}`}>
                        {row.sgstValue.toFixed(2)}
                      </td>

                      {/* 18. ITEM DESCRIPTION */}
                      <td className="px-3 py-1.5 font-sans text-slate-400 max-w-[180px] truncate" title={row.itemDescription}>
                        {row.itemDescription || "—"}
                      </td>

                      {/* 19. NARRATION */}
                      <td className="px-3 py-1.5 font-sans text-slate-500 max-w-[180px] truncate" title={row.narration}>
                        {row.narration || "—"}
                      </td>

                      {/* 20. Delivery Note */}
                      <td className="px-3 py-1.5 text-slate-400">
                        {row.deliveryNote || "—"}
                      </td>

                      {/* 21. Delivery No. */}
                      <td className="px-3 py-1.5 text-slate-400">
                        {row.deliveryNo || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SPREADSHEET SUMMARY BAR */}
      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="text-slate-500">Selected Rows:</span>
            <strong className="text-slate-100 font-mono">{summaryMetrics.selectedCount}</strong>
            <span className="text-slate-600">({summaryMetrics.invoiceCount} {summaryMetrics.invoiceCount === 1 ? "voucher" : "vouchers"})</span>
          </div>

          <div className="h-3 w-[1px] bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Taxable Amount:</span>
            <span className="font-mono font-bold text-amber-300">
              ₹{summaryMetrics.totalTaxable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="h-3 w-[1px] bg-slate-800 hidden sm:block" />

          {summaryMetrics.totalIgst > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">IGST:</span>
              <span className="font-mono font-bold text-indigo-400">
                ₹{summaryMetrics.totalIgst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {(summaryMetrics.totalCgst > 0 || summaryMetrics.totalSgst > 0) && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">CGST + SGST:</span>
              <span className="font-mono font-bold text-emerald-400">
                ₹{(summaryMetrics.totalCgst + summaryMetrics.totalSgst).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          <div className="h-3 w-[1px] bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-semibold">Grand Total:</span>
            <span className="font-mono font-bold text-emerald-300 text-sm">
              ₹{summaryMetrics.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2">
          {summaryMetrics.selectedCount < allRows.length && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-slate-700 text-slate-300"
              onClick={() => handleExportToTally(true)}
              isLoading={isExporting}
            >
              Export All ({allRows.length})
            </Button>
          )}

          <Button
            size="sm"
            className="h-7 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 text-xs shadow-md shadow-amber-500/20 gap-1"
            onClick={() => handleExportToTally(false)}
            isLoading={isExporting}
            disabled={summaryMetrics.selectedCount === 0}
          >
            <DownloadCloud className="w-3.5 h-3.5 text-slate-950" />
            <span>Download Excel</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
