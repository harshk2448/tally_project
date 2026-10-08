"use client";

import React, { useState, useRef, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { Badge } from "@/components/ui/Badge";
import { formatBytes } from "@/lib/utils";
import { DocumentRecord, ExtractedInvoice } from "@/types/document";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  X,
  FileSpreadsheet,
  Image as ImageIcon,
  Loader2,
  FileCheck,
  AlertTriangle,
  Play,
  RotateCcw,
  Layers,
  Plus,
} from "lucide-react";
import { DuplicateWarningModal } from "./DuplicateWarningModal";
import { optimizeImageForOcr } from "@/lib/client-image-optimizer";
import { BatchSummaryCard } from "./BatchSummaryCard";
import { BulkResultsTable, BulkItemRecord } from "./BulkResultsTable";
import { BulkDownloadModal } from "./BulkDownloadModal";
import { BulkTallyExportPreviewModal } from "@/components/tally/BulkTallyExportPreviewModal";

export interface UploadItem extends BulkItemRecord {
  previewUrl: string;
  progress: number;
  duplicateCheck?: any;
  wasOptimized?: boolean;
  compressionRatio?: number;
}

export function UploadDropzone() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sheetsSavedCount, setSheetsSavedCount] = useState(0);
  const [sheetsSpreadsheetUrl, setSheetsSpreadsheetUrl] = useState<string | undefined>(undefined);
  const [isSavingSheets, setIsSavingSheets] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [isTallyBulkModalOpen, setIsTallyBulkModalOpen] = useState(false);

  const [duplicateModal, setDuplicateModal] = useState<{
    isOpen: boolean;
    item?: UploadItem;
    documentRecord?: DocumentRecord;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phase 1: Multiple Invoice Selection
  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const allowedMimeTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
    ];

    const newItems: UploadItem[] = [];

    Array.from(files).forEach((file) => {
      if (
        !allowedMimeTypes.includes(file.type) &&
        !file.name.match(/\.(pdf|png|jpe?g|webp)$/i)
      ) {
        alert(`File "${file.name}" is not supported. Please upload PDF, PNG, JPG, or WEBP.`);
        return;
      }

      const id = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const previewUrl = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : "";

      newItems.push({
        id,
        file,
        previewUrl,
        progress: 0,
        stage: "queued",
        validationStatus: "QUEUED",
        validationErrors: [],
      });
    });

    setItems((prev) => [...prev, ...newItems]);
  };

  // Phase 10: Validation logic (Mathematical consistency & mandatory fields)
  const computeValidation = (
    doc: DocumentRecord
  ): { status: "VALID" | "NEEDS_REVIEW"; errors: string[] } => {
    const data: ExtractedInvoice =
      doc.aiResult?.cleanedData || ({} as ExtractedInvoice);
    const errors: string[] = [];

    // 1. Mandatory Fields
    if (!data.invoiceNumber || !data.invoiceNumber.trim()) {
      errors.push("Missing Invoice Number");
    }
    if (!data.invoiceDate || !data.invoiceDate.trim()) {
      errors.push("Missing Invoice Date");
    }
    if (!data.vendorName || !data.vendorName.trim()) {
      errors.push("Missing Vendor Name");
    }

    // 2. Mathematical Consistency (Phase 4 & 10)
    const subtotal = Number(data.subTotal) || 0;
    const cgst = Number(data.cgstTotal) || 0;
    const sgst = Number(data.sgstTotal) || 0;
    const igst = Number(data.igstTotal) || 0;
    const grandTotal = Number(data.grandTotal) || 0;

    const computedTotal = Number((subtotal + cgst + sgst + igst).toFixed(2));
    const discrepancy = Number(Math.abs(computedTotal - grandTotal).toFixed(2));
    const isBalanced = (discrepancy <= 0.15 || subtotal === 0) && grandTotal > 0;

    if (!isBalanced) {
      errors.push(`Amount mismatch: Subtotal + Taxes ≠ Grand Total (Diff: ₹${discrepancy})`);
    }

    return {
      status: errors.length === 0 ? "VALID" : "NEEDS_REVIEW",
      errors,
    };
  };

  // Process a single file through the real pipeline
  const processPipeline = async (item: UploadItem): Promise<boolean> => {
    let progressInterval: NodeJS.Timeout | null = null;
    try {
      // Stage 0: Fast client-side image compression
      updateItem(item.id, { progress: 15, stage: "optimizing" });
      const opt = await optimizeImageForOcr(item.file);
      const fileToUpload = opt.file;

      // Stage 1: Uploading
      updateItem(item.id, {
        progress: 35,
        stage: "uploading",
        file: fileToUpload,
        wasOptimized: opt.wasOptimized,
        compressionRatio: opt.compressionRatio,
      });

      const formData = new FormData();
      formData.append("file", fileToUpload);

      // Active progress ticker while OCR & data extraction process
      let currentProgress = 35;
      progressInterval = setInterval(() => {
        currentProgress = Math.min(currentProgress + 7, 92);
        if (currentProgress >= 45 && currentProgress < 75) {
          updateItem(item.id, { progress: currentProgress, stage: "ocr" });
        } else if (currentProgress >= 75) {
          updateItem(item.id, { progress: currentProgress, stage: "cleaning" });
        } else {
          updateItem(item.id, { progress: currentProgress });
        }
      }, 350);

      // Call real backend upload route
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (progressInterval) clearInterval(progressInterval);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload request failed (${res.status})`);
      }

      const result = await res.json();
      const documentRecord: DocumentRecord = result.data.document;
      const duplicateCheck = result.data.duplicateCheck;

      // Compute accounting validation
      const val = computeValidation(documentRecord);

      updateItem(item.id, {
        progress: 100,
        stage: "completed",
        documentRecord,
        duplicateCheck,
        validationStatus: val.status,
        validationErrors: val.errors,
      });

      // Automatically select valid items for bulk export
      setSelectedIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));

      // Track if auto-exported to Google Sheets
      if (result.data.autoExport?.success) {
        setSheetsSavedCount((prev) => prev + 1);
        if (result.data.autoExport?.spreadsheetUrl) {
          setSheetsSpreadsheetUrl(result.data.autoExport.spreadsheetUrl);
        }
      }

      return true;
    } catch (err) {
      if (progressInterval) clearInterval(progressInterval);
      const errMsg = err instanceof Error ? err.message : "Pipeline failed";
      updateItem(item.id, {
        stage: "error",
        errorMessage: errMsg,
        validationStatus: "FAILED",
        validationErrors: [errMsg],
      });
      return false;
    }
  };

  // Phase 2 & 12: Process All Invoices with Controlled Concurrency (concurrency = 2)
  const handleProcessAll = async () => {
    const queuedItems = items.filter(
      (it) => it.stage === "queued" || it.stage === "error"
    );
    if (queuedItems.length === 0) return;

    setIsProcessingBatch(true);
    const CONCURRENCY = 2;
    const queue = [...queuedItems];

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        await processPipeline(item);
      }
    };

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, queuedItems.length) },
      () => worker()
    );

    await Promise.all(workers);
    setIsProcessingBatch(false);
  };

  // Retry an individual failed item (Requirement 12)
  const handleRetryItem = async (id: string) => {
    const item = items.find((it) => it.id === id);
    if (!item) return;
    updateItem(id, { stage: "queued", progress: 0, errorMessage: undefined });
    await processPipeline(item);
  };

  // Phase 4: Save All to Google Sheets
  const handleSaveAllToSheets = async () => {
    const eligibleItems = items.filter(
      (it) => it.stage === "completed" && it.documentRecord && selectedIds.includes(it.id)
    );

    if (eligibleItems.length === 0) {
      alert("No valid invoices selected for Google Sheets export.");
      return;
    }

    setIsSavingSheets(true);
    try {
      const docIds = eligibleItems.map((it) => it.documentRecord!.id);
      const res = await fetch("/api/sheets/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: docIds }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to export to Google Sheets.");
      }

      setSheetsSavedCount((prev) => prev + (data.saved || 0));
      if (data.spreadsheetUrl) {
        setSheetsSpreadsheetUrl(data.spreadsheetUrl);
      }

      alert(`✅ ${data.message || `Exported ${data.saved} invoice(s) to Google Sheets!`}`);
    } catch (err: any) {
      console.error("[Sheets Bulk Export Error]:", err);
      alert(`❌ Google Sheets export failed: ${err.message}`);
    } finally {
      setIsSavingSheets(false);
    }
  };

  // Checkbox selection helpers (Requirement 3 & 10)
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const completedIds = items
      .filter((it) => it.stage === "completed" && it.documentRecord)
      .map((it) => it.id);
    setSelectedIds(completedIds);
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const handleSelectValidOnly = () => {
    const validIds = items
      .filter((it) => it.stage === "completed" && it.validationStatus === "VALID")
      .map((it) => it.id);
    setSelectedIds(validIds);
  };

  const updateItem = (id: string, updates: Partial<UploadItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...updates } : it))
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setSelectedIds((prev) => prev.filter((i) => i !== id));
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  // Batch Metrics (Requirement 11)
  const queuedCount = items.filter((it) => it.stage === "queued").length;
  const completedCount = items.filter((it) => it.stage === "completed").length;
  const needsReviewCount = items.filter(
    (it) => it.stage === "completed" && it.validationStatus === "NEEDS_REVIEW"
  ).length;
  const failedCount = items.filter((it) => it.stage === "error").length;

  // Documents available for bulk export
  const selectedDocuments: DocumentRecord[] = useMemo(() => {
    return items
      .filter((it) => it.stage === "completed" && it.documentRecord && selectedIds.includes(it.id))
      .map((it) => it.documentRecord!);
  }, [items, selectedIds]);

  return (
    <div className="space-y-6">
      {/* Drop Zone Box (Requirement 1) */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative rounded-3xl p-8 sm:p-12 border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center text-center cursor-pointer group ${
          isDragging
            ? "border-sky-400 bg-sky-500/10 shadow-[0_0_50px_rgba(56,189,248,0.2)] scale-[1.01]"
            : "border-slate-700/80 bg-slate-900/40 hover:bg-slate-900/70 hover:border-sky-500/40"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500/20 via-indigo-500/20 to-purple-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 group-hover:scale-110 transition-transform mb-4 shadow-lg shadow-sky-500/10">
          <UploadCloud className="w-8 h-8" />
        </div>

        <h3 className="text-lg sm:text-xl font-bold text-slate-100 mb-1">
          Select or Drag Multiple Invoices Here
        </h3>
        <p className="text-sm text-slate-400 max-w-md mb-4">
          Select single or multiple bills/invoices at once. Batch-processed through Azure OCR & AI Clean.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {["PDF", "PNG", "JPG", "WEBP"].map((ext) => (
            <span
              key={ext}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800/80 text-slate-300 border border-slate-700/60"
            >
              .{ext}
            </span>
          ))}
        </div>
      </div>

      {/* Selected Documents Queue (Requirement 1 & 2) */}
      {items.length > 0 && (
        <div className="space-y-3">
          {/* Queue Header & Primary Actions Toolbar */}
          <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h4 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Selected Documents ({items.length})
              </h4>
              {queuedCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30 font-mono">
                  {queuedCount} Queued
                </span>
              )}
              {isProcessingBatch && (
                <span className="text-xs text-sky-400 font-medium flex items-center gap-1.5 animate-pulse">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Processing Batch...
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Add More Files button (Requirement 14) */}
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-slate-300 hover:text-white gap-1"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingBatch}
              >
                <Plus className="w-3.5 h-3.5 text-sky-400" />
                <span>+ Select Multiple Bills</span>
              </Button>

              {/* Clear Queue */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-slate-400 hover:text-slate-200"
                onClick={() => {
                  setItems([]);
                  setSelectedIds([]);
                }}
                disabled={isProcessingBatch}
              >
                Clear Queue
              </Button>

              {/* Process All Button (Requirement 2) */}
              <Button
                size="sm"
                variant="glow"
                className="h-8 text-xs font-bold gap-1.5 px-4"
                onClick={handleProcessAll}
                isLoading={isProcessingBatch}
                disabled={isProcessingBatch || queuedCount + failedCount === 0}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  {isProcessingBatch
                    ? "Processing Batch..."
                    : queuedCount > 0
                    ? `Process All Invoices (${queuedCount})`
                    : "Process Invoices"}
                </span>
              </Button>
            </div>
          </div>

          {/* Queue Items List (Requirement 1) */}
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {items.map((item, index) => {
              const isDone = item.stage === "completed";
              const isErr = item.stage === "error";
              const isQueued = item.stage === "queued";

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                    isDone
                      ? "bg-slate-900/50 border-slate-800"
                      : isErr
                      ? "bg-rose-950/20 border-rose-500/30"
                      : isQueued
                      ? "bg-slate-950/60 border-slate-800/80"
                      : "bg-sky-950/20 border-sky-500/30"
                  }`}
                >
                  {/* Left: Index, Thumbnail, Name, Size */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[11px] font-mono text-slate-400 shrink-0">
                      {index + 1}
                    </span>

                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt="Preview"
                        className="w-9 h-9 rounded-lg object-cover border border-slate-700 shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate max-w-xs sm:max-w-md" title={item.file.name}>
                        {item.file.name}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                        <span>{formatBytes(item.file.size)}</span>
                        <span>•</span>

                        {isQueued && <span className="text-slate-500">Queued</span>}
                        {item.stage === "optimizing" && (
                          <span className="text-amber-400 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 animate-pulse" /> Optimizing Image...
                          </span>
                        )}
                        {item.stage === "uploading" && (
                          <span className="text-sky-400 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> Uploading...
                          </span>
                        )}
                        {item.stage === "ocr" && (
                          <span className="text-cyan-400 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> Azure OCR...
                          </span>
                        )}
                        {item.stage === "cleaning" && (
                          <span className="text-indigo-400 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> AI Clean / GPT...
                          </span>
                        )}
                        {isDone && (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Completed
                          </span>
                        )}
                        {isErr && (
                          <span className="text-rose-400 flex items-center gap-1 truncate max-w-xs" title={item.errorMessage}>
                            <AlertCircle className="w-3 h-3 shrink-0" /> {item.errorMessage}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Status badge or Progress / Retry button */}
                  <div className="flex items-center gap-2 shrink-0">
                    {!isDone && !isErr && !isQueued && (
                      <div className="w-24 sm:w-32">
                        <Progress value={item.progress} size="sm" />
                      </div>
                    )}

                    {isDone && item.documentRecord && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                        {item.documentRecord.confidenceScore}%
                      </span>
                    )}

                    {isErr && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px] px-2 text-rose-300 hover:text-white hover:bg-rose-500/20 gap-1"
                        onClick={() => handleRetryItem(item.id)}
                        title="Retry processing this document"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Retry</span>
                      </Button>
                    )}

                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
                      title="Remove from queue"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Batch Summary Card (Requirement 11) */}
      {completedCount > 0 && (
        <BatchSummaryCard
          total={items.length}
          successful={completedCount}
          needsReview={needsReviewCount}
          failed={failedCount}
          googleSheetsSaved={sheetsSavedCount}
          onSaveAllToSheets={handleSaveAllToSheets}
          onDownloadAllData={() => setIsDownloadModalOpen(true)}
          onExportTally={() => setIsTallyBulkModalOpen(true)}
          isSavingSheets={isSavingSheets}
          sheetsUrl={sheetsSpreadsheetUrl}
          canAct={!isProcessingBatch}
        />
      )}

      {/* Bulk OCR Results Table (Requirement 3 & 10) */}
      {completedCount > 0 && (
        <BulkResultsTable
          items={items}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onSelectValidOnly={handleSelectValidOnly}
          onRetryItem={handleRetryItem}
        />
      )}

      {/* Bulk Download Modal (Requirement 5, 6, 7) */}
      {isDownloadModalOpen && (
        <BulkDownloadModal
          isOpen={isDownloadModalOpen}
          onClose={() => setIsDownloadModalOpen(false)}
          documentIds={selectedDocuments.map((d) => d.id)}
          totalInvoices={selectedDocuments.length}
        />
      )}

      {/* Bulk Tally Export Preview Modal (Requirement 8 & 9) */}
      {isTallyBulkModalOpen && selectedDocuments.length > 0 && (
        <BulkTallyExportPreviewModal
          isOpen={isTallyBulkModalOpen}
          onClose={() => setIsTallyBulkModalOpen(false)}
          documents={selectedDocuments}
        />
      )}
    </div>
  );
}
