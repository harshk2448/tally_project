"use client";

import React, { useState } from "react";
import confetti from "canvas-confetti";
import {
  DocumentRecord,
  ExtractedInvoice,
  InvoiceLineItem,
  DocumentType,
} from "@/types/document";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Modal } from "@/components/ui/Modal";
import { ExportModal } from "./ExportModal";
import { TallyDataTable } from "./TallyDataTable";
import { TallyExportPreviewModal } from "@/components/tally/TallyExportPreviewModal";
import { transformValidatedInvoiceToTally, validateTallyInvoice } from "@/lib/tally-utils";
import { TallyProfile } from "@/types/tally";
import { validateGstin, validatePan } from "@/services/data-cleaner.service";
import { SUPPORTED_DOC_TYPES } from "@/lib/constants";
import {
  CheckCircle,
  XCircle,
  DownloadCloud,
  RefreshCw,
  Plus,
  Trash2,
  AlertTriangle,
  Copy,
  Check,
  FileSpreadsheet,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";

interface ValidationEditorPaneProps {
  initialDocument: DocumentRecord;
}

export function ValidationEditorPane({
  initialDocument,
}: ValidationEditorPaneProps) {
  const [document, setDocument] = useState<DocumentRecord>(initialDocument);
  const [formData, setFormData] = useState<ExtractedInvoice>(() => {
    const clean = initialDocument.aiResult?.cleanedData;
    const ocr = initialDocument.ocrResult?.structuredData;
    return {
      vendorName: clean?.vendorName || ocr?.vendorName || "",
      vendorGstin: clean?.vendorGstin || ocr?.vendorGstin || "",
      vendorPan: clean?.vendorPan || ocr?.vendorPan || "",
      vendorEmail: clean?.vendorEmail || ocr?.vendorEmail || "",
      vendorPhone: clean?.vendorPhone || ocr?.vendorPhone || "",
      vendorAddress: clean?.vendorAddress || ocr?.vendorAddress || "",
      customerName: clean?.customerName || ocr?.customerName || "",
      customerGstin: clean?.customerGstin || ocr?.customerGstin || "",
      customerAddress: clean?.customerAddress || ocr?.customerAddress || "",
      invoiceNumber: clean?.invoiceNumber || ocr?.invoiceNumber || "",
      invoiceDate: clean?.invoiceDate || ocr?.invoiceDate || "",
      dueDate: clean?.dueDate || ocr?.dueDate || "",
      poNumber: clean?.poNumber || ocr?.poNumber || "",
      currency: clean?.currency || ocr?.currency || "INR",
      items: (clean?.items && clean.items.length > 0 ? clean.items : ocr?.items) || [],
      subTotal: Number(clean?.subTotal !== undefined ? clean.subTotal : ocr?.subTotal ?? 0),
      cgstTotal: Number(clean?.cgstTotal !== undefined ? clean.cgstTotal : ocr?.cgstTotal ?? 0),
      sgstTotal: Number(clean?.sgstTotal !== undefined ? clean.sgstTotal : ocr?.sgstTotal ?? 0),
      igstTotal: Number(clean?.igstTotal !== undefined ? clean.igstTotal : ocr?.igstTotal ?? 0),
      totalTax: Number(clean?.totalTax !== undefined ? clean.totalTax : ocr?.totalTax ?? 0),
      grandTotal: Number(clean?.grandTotal !== undefined ? clean.grandTotal : ocr?.grandTotal ?? 0),
      notes: clean?.notes || ocr?.notes || "",
    };
  });
  const [activeTab, setActiveTab] = useState<string>("general");
  const [isSaving, setIsSaving] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [isSheetsExporting, setIsSheetsExporting] = useState(false);
  const [sheetsToast, setSheetsToast] = useState<{
    type: "success" | "error" | "warning";
    message: string;
    url?: string;
  } | null>(null);
  const [tallyVoucherType, setTallyVoucherType] = useState<"Auto" | "Purchase" | "Sales">(
    (document.metadata?.tallyVoucherType as "Purchase" | "Sales") || "Auto"
  );
  const [isTallyDownloading, setIsTallyDownloading] = useState(false);
  const [isTallyPreviewOpen, setIsTallyPreviewOpen] = useState(false);
  const [activeProfile, setActiveProfile] = useState<TallyProfile | undefined>(undefined);

  // Sync active Tally Profile from server
  const loadProfile = React.useCallback(async () => {
    try {
      const res = await fetch("/api/tally/profiles");
      const json = await res.json();
      if (json?.success && json.data?.activeProfile) {
        setActiveProfile(json.data.activeProfile);
      }
    } catch {}
  }, []);

  React.useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const currentTallyInvoice = React.useMemo(() => {
    return transformValidatedInvoiceToTally(
      {
        ...document,
        aiResult: { ...(document.aiResult as any), cleanedData: formData },
        ocrResult: document.ocrResult,
      },
      {
        explicitVoucherType: tallyVoucherType !== "Auto" ? tallyVoucherType : undefined,
        profile: activeProfile,
      }
    );
  }, [document, formData, tallyVoucherType, activeProfile]);

  const currentTallyValidation = React.useMemo(() => {
    return validateTallyInvoice(currentTallyInvoice, { profile: activeProfile });
  }, [currentTallyInvoice, activeProfile]);

  const handleQuickExportTally = () => {
    setIsTallyPreviewOpen(true);
  };

  const handleQuickExportSheets = async () => {
    setIsSheetsExporting(true);
    setSheetsToast(null);
    try {
      const res = await fetch("/api/sheets/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: document.id }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setSheetsToast({
          type: "error",
          message: data.error || "❌ Google Sheets authentication failed.",
        });
      } else if (data.duplicate) {
        setSheetsToast({
          type: "warning",
          message: data.message,
          url: data.spreadsheetUrl,
        });
      } else {
        setSheetsToast({
          type: "success",
          message: "✅ Invoice exported successfully.",
          url: data.spreadsheetUrl,
        });
      }
    } catch (err: any) {
      setSheetsToast({
        type: "error",
        message: err.message || "❌ Google Sheets authentication failed.",
      });
    } finally {
      setIsSheetsExporting(false);
      setTimeout(() => setSheetsToast(null), 8000);
    }
  };

  // Live GSTIN check
  const gstinStatus = validateGstin(formData.vendorGstin || "");
  const panStatus = validatePan(formData.vendorPan || "");

  // Real-time Tally Accounting Math Check (Rule 9 & 10)
  const subTotal = Number(formData.subTotal) || 0;
  const cgstTotal = Number(formData.cgstTotal) || 0;
  const sgstTotal = Number(formData.sgstTotal) || 0;
  const igstTotal = Number(formData.igstTotal) || 0;
  const totalTax = Number(formData.totalTax) || (cgstTotal + sgstTotal + igstTotal);
  const grandTotal = Number(formData.grandTotal) || 0;
  const computedMathTotal = Number((subTotal + cgstTotal + sgstTotal + igstTotal).toFixed(2));
  const mathDiscrepancy = Math.abs(computedMathTotal - grandTotal);
  const isMathBalanced = mathDiscrepancy <= 0.15 && grandTotal > 0;

  const handleFieldChange = (field: keyof ExtractedInvoice, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleLineItemChange = (
    index: number,
    field: keyof InvoiceLineItem,
    val: unknown
  ) => {
    const updatedItems = [...(formData.items || [])];
    const currentItem = { ...updatedItems[index], [field]: val };

    // Auto-recalculate line totals if numeric fields changed
    if (field === "qty" || field === "rate" || field === "discount" || field === "gstRate") {
      const qty = Number(currentItem.qty) || 0;
      const rate = Number(currentItem.rate) || 0;
      const discount = Number(currentItem.discount) || 0;
      const gstRate = Number(currentItem.gstRate) || 0;

      const taxable = Math.max(0, qty * rate - discount);
      const taxAmount = (taxable * gstRate) / 100;

      currentItem.cgst = Number((taxAmount / 2).toFixed(2));
      currentItem.sgst = Number((taxAmount / 2).toFixed(2));
      currentItem.igst = 0;
      currentItem.total = Number((taxable + taxAmount).toFixed(2));
    }

    updatedItems[index] = currentItem;

    // Recalculate grand totals
    const newSubTotal = updatedItems.reduce(
      (sum, item) => sum + item.qty * item.rate - item.discount,
      0
    );
    const newTotalTax = updatedItems.reduce(
      (sum, item) => sum + item.cgst + item.sgst + item.igst,
      0
    );
    const newGrandTotal = Number((newSubTotal + newTotalTax).toFixed(2));

    setFormData((prev) => ({
      ...prev,
      items: updatedItems,
      subTotal: Number(newSubTotal.toFixed(2)),
      totalTax: Number(newTotalTax.toFixed(2)),
      grandTotal: newGrandTotal,
    }));
  };

  const addLineItem = () => {
    const newItem: InvoiceLineItem = {
      id: `item_${(formData.items || []).length + 1}`,
      description: "New Item",
      hsn: "9983",
      qty: 1,
      rate: 1000,
      discount: 0,
      gstRate: 18,
      cgst: 90,
      sgst: 90,
      igst: 0,
      total: 1180,
      confidence: 100,
    };

    const items = [...(formData.items || []), newItem];
    const subTotal = items.reduce((sum, it) => sum + it.qty * it.rate - it.discount, 0);
    const tax = items.reduce((sum, it) => sum + it.cgst + it.sgst + it.igst, 0);

    setFormData((prev) => ({
      ...prev,
      items,
      subTotal: Number(subTotal.toFixed(2)),
      totalTax: Number(tax.toFixed(2)),
      grandTotal: Number((subTotal + tax).toFixed(2)),
    }));
  };

  const deleteLineItem = (index: number) => {
    const items = (formData.items || []).filter((_, i) => i !== index);
    const subTotal = items.reduce((sum, it) => sum + it.qty * it.rate - it.discount, 0);
    const tax = items.reduce((sum, it) => sum + it.cgst + it.sgst + it.igst, 0);

    setFormData((prev) => ({
      ...prev,
      items,
      subTotal: Number(subTotal.toFixed(2)),
      totalTax: Number(tax.toFixed(2)),
      grandTotal: Number((subTotal + tax).toFixed(2)),
    }));
  };

  const handleApprove = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/document/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "approved",
          cleanedData: formData,
          metadata: {
            ...document.metadata,
            tallyVoucherType: tallyVoucherType !== "Auto" ? tallyVoucherType : undefined,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDocument(data.data);
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      }
    } catch (e) {
      console.error("Approve failed:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReject = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/document/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "rejected",
          rejectionReason,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDocument(data.data);
        setIsRejectModalOpen(false);
      }
    } catch (e) {
      console.error("Reject failed:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRerunCleaner = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/clean`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: document.id,
          data: formData,
        }),
      });
      const resData = await res.json();
      if (resData.success) {
        setFormData(resData.data.cleanedData);
        setDocument((prev) => ({
          ...prev,
          confidenceScore: resData.data.overallConfidence,
          aiResult: prev.aiResult
            ? {
                ...prev.aiResult,
                cleanedData: resData.data.cleanedData,
                validationErrors: resData.data.validationErrors,
                flags: resData.data.flags,
                cleaningAudit: resData.data.audit,
                overallConfidence: resData.data.overallConfidence,
              }
            : undefined,
        }));
      }
    } catch (e) {
      console.error("Rerun cleaner failed:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const editorTabs = [
    { id: "general", label: "General Fields" },
    {
      id: "items",
      label: "Line Items",
      badge: formData.items?.length || 0,
    },
    {
      id: "tally",
      label: "Tally Data",
      badge: formData.items?.length || 1,
    },
    {
      id: "quality",
      label: "AI Cleaner & Audit",
      badge: document.aiResult?.validationErrors?.length || 0,
    },
    { id: "rawOcr", label: "Raw OCR JSON" },
    { id: "cleanJson", label: "Clean JSON" },
  ];

  return (
    <div className="flex flex-col h-full rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 overflow-hidden shadow-xl">
      {/* Studio Header Toolbar */}
      <div className="px-6 py-4 border-b border-slate-800/80 bg-slate-950/40 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Document Type Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Type:</span>
            <select
              value={document.documentType}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                const newType = e.target.value as DocumentType;
                setDocument((prev) => ({ ...prev, documentType: newType }));
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-sky-400 font-semibold focus:outline-none focus:border-sky-500"
            >
              {SUPPORTED_DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Confidence Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-xs">
            <span className="text-slate-400">Confidence:</span>
            <span className="font-bold text-emerald-400">
              {document.confidenceScore}%
            </span>
          </div>

          {/* Status Badge */}
          <Badge
            variant={
              document.status === "approved"
                ? "success"
                : document.status === "rejected"
                ? "danger"
                : "warning"
            }
            dot
          >
            {document.status.replace(/_/g, " ").toUpperCase()}
          </Badge>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRerunCleaner}
            isLoading={isSaving}
            title="Re-run normalization and checksum algorithms"
          >
            <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
            <span>AI Clean</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 gap-1.5"
            onClick={handleQuickExportTally}
            isLoading={isTallyDownloading}
            title="Export to TallyPrime Excel format (.xlsx)"
          >
            <DownloadCloud className="w-3.5 h-3.5 text-amber-400" />
            <span>Export to Tally</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 gap-1.5"
            onClick={handleQuickExportSheets}
            isLoading={isSheetsExporting}
            title="Export to Google Sheets"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export to Sheets</span>
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => setIsExportModalOpen(true)}
          >
            <DownloadCloud className="w-3.5 h-3.5 text-sky-400" />
            <span>Export</span>
          </Button>

          <Button
            size="sm"
            variant="destructive"
            onClick={() => setIsRejectModalOpen(true)}
            disabled={document.status === "rejected"}
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Reject</span>
          </Button>

          <Button
            size="sm"
            variant="emerald"
            onClick={handleApprove}
            isLoading={isSaving}
            disabled={document.status === "approved"}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Approve & Save</span>
          </Button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="px-6 pt-3 border-b border-slate-800/80 bg-slate-950/20">
        <Tabs tabs={editorTabs} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {/* Editor Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* TAB 1: General Fields */}
        {activeTab === "general" && (
          <div className="space-y-6">
            {/* Vendor Information Card */}
            <div className="p-5 rounded-2xl bg-slate-950/50 border border-slate-800/80 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400">
                  Vendor Details
                </h4>
                {document.aiResult?.cleaningAudit?.normalizedVendorName && (
                  <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Auto-normalized by AI
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                    Vendor Legal Name
                  </label>
                  <Input
                    value={formData.vendorName || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleFieldChange("vendorName", e.target.value)
                    }
                    placeholder="e.g. Infosys Technologies Limited"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-slate-400 font-medium">
                      GSTIN (15-character)
                    </label>
                    <span
                      className={`text-[10px] font-semibold ${
                        gstinStatus.isValid ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {gstinStatus.isValid ? "✓ Modulo-36 Verified" : "⚠ Invalid Format"}
                    </span>
                  </div>
                  <Input
                    value={formData.vendorGstin || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleFieldChange("vendorGstin", e.target.value.toUpperCase())
                    }
                    placeholder="e.g. 27AABCT3421A1Z7"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-slate-400 font-medium">
                      PAN (Derived or Extracted)
                    </label>
                    <span
                      className={`text-[10px] font-semibold ${
                        panStatus.isValid ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {panStatus.isValid ? "✓ Valid Structure" : "⚠ Format Error"}
                    </span>
                  </div>
                  <Input
                    value={formData.vendorPan || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleFieldChange("vendorPan", e.target.value.toUpperCase())
                    }
                    placeholder="e.g. AABCT3421A"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                    Vendor Email
                  </label>
                  <Input
                    type="email"
                    value={formData.vendorEmail || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleFieldChange("vendorEmail", e.target.value)
                    }
                    placeholder="e.g. accounts@vendor.com"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                    Vendor Phone / Mobile
                  </label>
                  <Input
                    value={formData.vendorPhone || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleFieldChange("vendorPhone", e.target.value)
                    }
                    placeholder="+91 98200 00000"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                    Vendor Physical Address
                  </label>
                  <Input
                    value={formData.vendorAddress || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleFieldChange("vendorAddress", e.target.value)
                    }
                    placeholder="Address line..."
                  />
                </div>
              </div>
            </div>

            {/* Invoice Identifiers & Dates */}
            <div className="p-5 rounded-2xl bg-slate-950/50 border border-slate-800/80 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 border-b border-slate-800/60 pb-3">
                Invoice Identifiers & Financials
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                    Invoice Number
                  </label>
                  <Input
                    value={formData.invoiceNumber || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleFieldChange("invoiceNumber", e.target.value)
                    }
                    placeholder="INV-XXXX"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                    Invoice Date (ISO YYYY-MM-DD)
                  </label>
                  <Input
                    type="date"
                    value={formData.invoiceDate || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleFieldChange("invoiceDate", e.target.value)
                    }
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                    Due Date
                  </label>
                  <Input
                    type="date"
                    value={formData.dueDate || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleFieldChange("dueDate", e.target.value)
                    }
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                    PO Number Reference
                  </label>
                  <Input
                    value={formData.poNumber || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleFieldChange("poNumber", e.target.value)
                    }
                    placeholder="PO-XXXX"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                    Currency
                  </label>
                  <Input
                    value={formData.currency || "INR"}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleFieldChange("currency", e.target.value)
                    }
                    placeholder="INR, USD, EUR..."
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                    Grand Total Amount
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.grandTotal || 0}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleFieldChange("grandTotal", parseFloat(e.target.value) || 0)
                    }
                    className="font-bold text-emerald-400"
                  />
                </div>
              </div>
            </div>

            {/* Customer Details */}
            <div className="p-5 rounded-2xl bg-slate-950/50 border border-slate-800/80 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 border-b border-slate-800/60 pb-3">
                Customer (Billed To) Details
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                    Customer Name
                  </label>
                  <Input
                    value={formData.customerName || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleFieldChange("customerName", e.target.value)
                    }
                    placeholder="Customer enterprise name"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                    Customer GSTIN
                  </label>
                  <Input
                    value={formData.customerGstin || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleFieldChange("customerGstin", e.target.value.toUpperCase())
                    }
                    placeholder="Customer GSTIN..."
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Interactive Line Items Grid */}
        {activeTab === "items" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-slate-100">
                  Itemized Line Breakdown ({formData.items?.length || 0} items)
                </h4>
                <p className="text-xs text-slate-400">
                  Inline editable grid. Changing Quantity, Rate, or GST% automatically updates subtotals and grand total.
                </p>
              </div>

              <Button size="sm" variant="secondary" onClick={addLineItem}>
                <Plus className="w-3.5 h-3.5" />
                <span>Add Line Item</span>
              </Button>
            </div>

            {/* Line items Table */}
            <div className="rounded-xl border border-slate-800 overflow-x-auto bg-slate-950/60">
              <table className="w-full text-left text-xs min-w-[900px]">
                <thead className="bg-slate-900/80 text-slate-400 text-[11px] uppercase border-b border-slate-800">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Description</th>
                    <th className="px-2 py-2.5 font-semibold w-24">HSN/SAC</th>
                    <th className="px-2 py-2.5 font-semibold w-20">Qty</th>
                    <th className="px-2 py-2.5 font-semibold w-24">Rate</th>
                    <th className="px-2 py-2.5 font-semibold w-20">Disc.</th>
                    <th className="px-2 py-2.5 font-semibold w-20">GST %</th>
                    <th className="px-2 py-2.5 font-semibold w-20">CGST</th>
                    <th className="px-2 py-2.5 font-semibold w-20">SGST</th>
                    <th className="px-2 py-2.5 font-semibold w-28 text-right">Total</th>
                    <th className="px-2 py-2.5 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {(formData.items || []).map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-slate-900/40">
                      <td className="p-2">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            handleLineItemChange(idx, "description", e.target.value)
                          }
                          className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 focus:border-sky-400 focus:outline-none text-xs"
                        />
                      </td>

                      <td className="p-2">
                        <input
                          type="text"
                          value={item.hsn}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            handleLineItemChange(idx, "hsn", e.target.value)
                          }
                          className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 focus:border-sky-400 focus:outline-none text-xs font-mono"
                        />
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          value={item.qty}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            handleLineItemChange(
                              idx,
                              "qty",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 focus:border-sky-400 focus:outline-none text-xs text-center font-mono"
                        />
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          value={item.rate}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            handleLineItemChange(
                              idx,
                              "rate",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 focus:border-sky-400 focus:outline-none text-xs font-mono"
                        />
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          value={item.discount}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            handleLineItemChange(
                              idx,
                              "discount",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 focus:border-sky-400 focus:outline-none text-xs font-mono"
                        />
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          value={item.gstRate}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            handleLineItemChange(
                              idx,
                              "gstRate",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 focus:border-sky-400 focus:outline-none text-xs font-mono text-center"
                        />
                      </td>

                      <td className="p-2 text-slate-400 font-mono text-center">
                        {item.cgst}
                      </td>

                      <td className="p-2 text-slate-400 font-mono text-center">
                        {item.sgst}
                      </td>

                      <td className="p-2 text-right font-semibold font-mono text-emerald-400">
                        {item.total}
                      </td>

                      <td className="p-2 text-center">
                        <button
                          onClick={() => deleteLineItem(idx)}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Totals Summary Bar */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-6">
                <div>
                  <span className="text-slate-400 block">Subtotal:</span>
                  <span className="font-semibold text-slate-200">
                    {formData.currency} {formData.subTotal}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Total GST (Tax):</span>
                  <span className="font-semibold text-slate-200">
                    {formData.currency} {formData.totalTax}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-300">
                  Computed Grand Total:
                </span>
                <span className="text-base font-bold text-emerald-400">
                  {formData.currency} {formData.grandTotal}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB: Dedicated Tally Data Table */}
        {activeTab === "tally" && (
          <div className="space-y-4">
            <TallyDataTable
              document={document}
              formData={formData}
              voucherType={tallyVoucherType}
              onVoucherTypeChange={setTallyVoucherType}
              showExportButton={true}
            />
          </div>
        )}

        {/* TAB 3: AI Cleaner Audit & Data Quality */}
        {activeTab === "quality" && (
          <div className="space-y-6">
            {/* Audit Telemetry */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-xs text-slate-400">Spaces Trimmed</span>
                <p className="text-xl font-bold text-sky-400 mt-1">
                  {document.aiResult?.cleaningAudit?.trimmedSpacesCount || 0}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-xs text-slate-400">Dates Standardized</span>
                <p className="text-xl font-bold text-indigo-400 mt-1">
                  {document.aiResult?.cleaningAudit?.standardizedDatesCount || 0}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-xs text-slate-400">OCR Corrections</span>
                <p className="text-xl font-bold text-emerald-400 mt-1">
                  {document.aiResult?.cleaningAudit?.ocrCorrectionsCount || 0}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-xs text-slate-400">Duplicate Rows Cut</span>
                <p className="text-xl font-bold text-amber-400 mt-1">
                  {document.aiResult?.cleaningAudit?.duplicateRowsRemoved || 0}
                </p>
              </div>
            </div>

            {/* Validation Issues / Alerts */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Validation & Discrepancy Alerts
              </h4>

              {(!document.aiResult?.validationErrors ||
                document.aiResult.validationErrors.length === 0) && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 shrink-0" />
                  <div>
                    <p className="font-semibold">All Data Quality Checks Passed!</p>
                    <p className="text-[11px] text-emerald-400/80">
                      GSTIN checksum, PAN format, line items summation, and dates are 100% verified.
                    </p>
                  </div>
                </div>
              )}

              {(document.aiResult?.validationErrors || []).map((err) => (
                <div
                  key={err.id}
                  className={`p-3.5 rounded-xl border text-xs flex items-start gap-3 ${
                    err.severity === "error"
                      ? "bg-rose-500/10 border-rose-500/20 text-rose-300"
                      : "bg-amber-500/10 border-amber-500/20 text-amber-300"
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">{err.message}</p>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      Field: <code className="font-mono">{err.field}</code> | Code:{" "}
                      {err.code}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: Raw OCR JSON */}
        {activeTab === "rawOcr" && (
          <div className="relative">
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  JSON.stringify(document.ocrResult || {}, null, 2)
                );
                setCopySuccess(true);
                setTimeout(() => setCopySuccess(false), 2000);
              }}
              className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs flex items-center gap-1.5 border border-slate-700 cursor-pointer"
            >
              {copySuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copySuccess ? "Copied" : "Copy JSON"}</span>
            </button>
            <pre className="p-4 rounded-xl bg-slate-950 font-mono text-xs text-sky-300 overflow-auto max-h-[500px] border border-slate-800 leading-relaxed">
              {JSON.stringify(document.ocrResult || {}, null, 2)}
            </pre>
          </div>
        )}

        {/* TAB 5: Clean JSON */}
        {activeTab === "cleanJson" && (
          <div className="relative">
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(formData, null, 2));
                setCopySuccess(true);
                setTimeout(() => setCopySuccess(false), 2000);
              }}
              className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs flex items-center gap-1.5 border border-slate-700 cursor-pointer"
            >
              {copySuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copySuccess ? "Copied" : "Copy JSON"}</span>
            </button>
            <pre className="p-4 rounded-xl bg-slate-950 font-mono text-xs text-emerald-300 overflow-auto max-h-[500px] border border-slate-800 leading-relaxed">
              {JSON.stringify(formData, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Rejection Reason Modal */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Reject Document"
        description="Provide reason for rejecting this document extraction"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">
              Rejection Reason
            </label>
            <textarea
              value={rejectionReason}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setRejectionReason(e.target.value)
              }
              placeholder="e.g. Blurry scan, illegible tax identification numbers, duplicate file..."
              className="w-full h-24 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsRejectModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleReject}
              isLoading={isSaving}
            >
              Confirm Rejection
            </Button>
          </div>
        </div>
      </Modal>

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        document={{ ...document, aiResult: { ...document.aiResult!, cleanedData: formData } }}
      />

      {/* Tally Export Preview Modal (Phase 13) */}
      {isTallyPreviewOpen && (
        <TallyExportPreviewModal
          isOpen={isTallyPreviewOpen}
          onClose={() => setIsTallyPreviewOpen(false)}
          documentId={document.id}
          document={{ ...document, aiResult: { ...document.aiResult!, cleanedData: formData } }}
          tallyInvoice={currentTallyInvoice}
          validation={currentTallyValidation}
          onExportComplete={(filename) => {
            setSheetsToast({
              type: "success",
              message: `✅ Exported ${filename} ready for Tally import.`,
            });
            setTimeout(() => setSheetsToast(null), 6000);
          }}
        />
      )}

      {/* Floating Google Sheets Toast Notification */}
      {sheetsToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200 max-w-md">
          <div
            className={`p-4 rounded-xl shadow-2xl border flex items-center justify-between gap-3 ${
              sheetsToast.type === "success"
                ? "bg-slate-900 border-emerald-500/50 text-emerald-200"
                : sheetsToast.type === "warning"
                ? "bg-slate-900 border-amber-500/50 text-amber-200"
                : "bg-slate-900 border-rose-500/50 text-rose-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {sheetsToast.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              )}
              <span className="text-xs font-medium">{sheetsToast.message}</span>
            </div>
            {sheetsToast.url && (
              <a
                href={sheetsToast.url}
                target="_blank"
                rel="noreferrer"
                className="underline font-semibold text-xs flex items-center gap-1 hover:text-white shrink-0 ml-2"
              >
                <span>Open Sheet</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
