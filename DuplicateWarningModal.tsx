"use client";

import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { AlertTriangle, Calendar, FileText, Building2, DollarSign, XCircle, ArrowRight } from "lucide-react";

export interface DuplicateWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinueAnyway: () => void;
  onCancelUpload: () => void;
  invoiceNumber?: string;
  previouslyUploadedOn?: string;
  vendorName?: string;
  grandTotal?: number;
  fileName?: string;
  matchType?: "invoice_number" | "composite";
}

export function DuplicateWarningModal({
  isOpen,
  onClose,
  onContinueAnyway,
  onCancelUpload,
  invoiceNumber,
  previouslyUploadedOn,
  vendorName,
  grandTotal,
  fileName,
  matchType = "invoice_number",
}: DuplicateWarningModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
    >
      <div className="space-y-6">
        {/* Warning Header */}
        <div className="flex items-start gap-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-amber-300">
              ⚠ Duplicate Invoice Detected
            </h3>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              {matchType === "invoice_number"
                ? "This invoice number already exists in your workspace records."
                : "An invoice with the same vendor, date, and grand total already exists."}
            </p>
          </div>
        </div>

        {/* Invoice Match Details */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3 font-mono text-xs">
          {invoiceNumber ? (
            <div className="flex items-center justify-between py-1.5 border-b border-slate-800/80">
              <span className="text-slate-400 font-sans flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-sky-400" />
                Invoice Number:
              </span>
              <span className="font-bold text-slate-100 text-sm">
                {invoiceNumber}
              </span>
            </div>
          ) : null}

          {vendorName && (
            <div className="flex items-center justify-between py-1.5 border-b border-slate-800/80">
              <span className="text-slate-400 font-sans flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                Vendor Name:
              </span>
              <span className="font-medium text-slate-200 truncate max-w-[200px]">
                {vendorName}
              </span>
            </div>
          )}

          {grandTotal !== undefined && grandTotal !== null && (
            <div className="flex items-center justify-between py-1.5 border-b border-slate-800/80">
              <span className="text-slate-400 font-sans flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                Grand Total:
              </span>
              <span className="font-bold text-emerald-400">
                ₹{grandTotal}
              </span>
            </div>
          )}

          {fileName && (
            <div className="flex items-center justify-between py-1.5 border-b border-slate-800/80">
              <span className="text-slate-400 font-sans">Current Upload:</span>
              <span className="text-slate-300 truncate max-w-[200px]">{fileName}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-slate-400 font-sans flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              Previously uploaded on:
            </span>
            <span className="font-semibold text-amber-300">
              {previouslyUploadedOn || "Earlier session"}
            </span>
          </div>
        </div>

        {/* Options Description */}
        <div className="text-xs text-slate-400 space-y-1">
          <p className="font-medium text-slate-300">Options:</p>
          <ul className="list-disc list-inside space-y-0.5 text-slate-400">
            <li><strong className="text-slate-200">Continue Anyway</strong>: Keeps the invoice in your documents list and flags it with a Duplicate badge.</li>
            <li><strong className="text-slate-200">Cancel Upload</strong>: Discards this duplicate document and removes it from the queue.</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
          <Button
            variant="destructive"
            onClick={onCancelUpload}
            className="gap-1.5 text-xs h-9 cursor-pointer"
          >
            <XCircle className="w-4 h-4" />
            <span>Cancel Upload</span>
          </Button>

          <Button
            variant="glow"
            onClick={onContinueAnyway}
            className="gap-1.5 text-xs h-9 cursor-pointer"
          >
            <span>Continue Anyway</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Modal>
  );
}
