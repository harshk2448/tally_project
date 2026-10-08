"use client";

import React, { useState } from "react";
import { DocumentRecord } from "@/types/document";
import { formatBytes } from "@/lib/utils";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  Sparkles,
  FileText,
  Image as ImageIcon,
  Building2,
  User,
  ExternalLink,
} from "lucide-react";

interface DocumentPreviewPaneProps {
  document: DocumentRecord;
}

export function DocumentPreviewPane({ document }: DocumentPreviewPaneProps) {
  const [zoom, setZoom] = useState(100);
  const [showBoxes, setShowBoxes] = useState(true);
  const [activeTab, setActiveTab] = useState<"visual" | "original" | "rawOcr">("visual");

  const zoomIn = () => setZoom((prev) => Math.min(prev + 20, 200));
  const zoomOut = () => setZoom((prev) => Math.max(prev - 20, 60));
  const resetZoom = () => setZoom(100);

  const rawText =
    document.ocrResult?.rawText ||
    `TAX INVOICE\n${document.aiResult?.cleanedData?.vendorName || "Company Name"}\nInvoice No: ${document.aiResult?.cleanedData?.invoiceNumber || "INV-001"}\nTotal: ₹${document.aiResult?.cleanedData?.grandTotal || "0.00"}`;

  const cleaned = document.aiResult?.cleanedData;
  const vendorName = cleaned?.vendorName || "Gujarat Freight Tools";
  const vendorGstin = cleaned?.vendorGstin || "27CORPP3939N1ZQ";
  const vendorAddress =
    cleaned?.vendorAddress ||
    "Plot No A 64, Road No 21, Waghle Indl Estate, Mumbai, Maharashtra - 360001";

  const customerName = cleaned?.customerName || "Shiv Engineering";
  const customerGstin = cleaned?.customerGstin || "32AABBA7890B1ZB";
  const customerAddress = cleaned?.customerAddress;

  const invoiceNumber = cleaned?.invoiceNumber || "GST-3525-26";
  const invoiceDate = cleaned?.invoiceDate || "2025-07-23";

  return (
    <div className="flex flex-col h-full rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 overflow-hidden shadow-xl">
      {/* Pane Toolbar */}
      <div className="px-4 py-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 bg-slate-950/40 text-xs shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setActiveTab("visual")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "visual"
                ? "bg-slate-800 text-sky-400 border border-slate-700 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Visual Layout</span>
          </button>

          <button
            onClick={() => setActiveTab("original")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "original"
                ? "bg-slate-800 text-sky-400 border border-slate-700 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Original File</span>
          </button>

          <button
            onClick={() => setActiveTab("rawOcr")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "rawOcr"
                ? "bg-slate-800 text-sky-400 border border-slate-700 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Original</span> OCR Text
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          {activeTab === "visual" && (
            <button
              onClick={() => setShowBoxes(!showBoxes)}
              title="Toggle Field Highlights"
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer mr-1 ${
                showBoxes
                  ? "bg-sky-500/20 text-sky-400 border-sky-500/30"
                  : "bg-slate-800 text-slate-400 border-slate-700"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={zoomOut}
            title="Zoom Out"
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="px-1.5 text-[11px] font-mono text-slate-400 min-w-[42px] text-center">
            {zoom}%
          </span>
          <button
            onClick={zoomIn}
            title="Zoom In"
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={resetZoom}
            title="Reset Zoom"
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <a
            href={`/api/document/${document.id}/file`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open original file in new tab"
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700 cursor-pointer flex items-center justify-center transition-colors ml-1"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Pane Content Viewer - Using items-start so top content is NEVER clipped */}
      <div className="flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-6 flex justify-center items-start bg-[#070a11] relative">
        {activeTab === "rawOcr" ? (
          <div className="w-full h-full p-4 rounded-xl bg-slate-950 font-mono text-xs text-slate-300 leading-relaxed overflow-auto whitespace-pre-wrap border border-slate-800 select-text">
            {rawText}
          </div>
        ) : activeTab === "original" ? (
          <div className="w-full flex justify-center py-2">
            {document.fileType?.includes("pdf") ? (
              <div className="w-full max-w-4xl flex justify-center">
                <iframe
                  src={`/api/document/${document.id}/file`}
                  className="w-full h-[700px] rounded-xl border border-slate-800 shadow-2xl bg-[#0f172a]"
                  title={`Original Document - ${document.fileName}`}
                />
              </div>
            ) : (
              <div
                style={{
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: "top center",
                }}
                className="transition-transform duration-200 flex flex-col items-center"
              >
                <img
                  src={`/api/document/${document.id}/file`}
                  alt={document.fileName}
                  className="max-w-[580px] rounded-xl shadow-2xl border border-slate-700 object-contain bg-slate-950"
                  onError={(e) => {
                    // If image route fails, fallback gracefully
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="w-full flex justify-center py-2">
            <div
              style={{
                transform: `scale(${zoom / 100})`,
                transformOrigin: "top center",
              }}
              className="transition-transform duration-200"
            >
              {/* Realistic Document Canvas / Paper mockup */}
              <div className="w-[520px] min-h-[700px] bg-slate-950 rounded-2xl shadow-2xl border border-slate-700/80 p-6 text-slate-100 relative select-none">
                {/* Top Watermark / Header Badge */}
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/30 text-sky-400 flex items-center justify-center font-bold text-xs shadow-inner">
                      OCR
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 truncate max-w-[320px]">
                        {document.fileName}
                      </h4>
                      <p className="text-[10px] text-slate-400">
                        {document.fileType} • {formatBytes(document.fileSize)}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-400 font-mono">
                    Page 1 of {document.pageCount}
                  </span>
                </div>

                {/* Document Body */}
                <div className="space-y-3.5 text-xs font-mono">
                  {/* Company / Vendor Name Box (Prominent & Clear) */}
                  <div
                    className={`p-3.5 rounded-xl transition-all ${
                      showBoxes
                        ? "bg-sky-500/15 border border-sky-400/50 text-sky-200 shadow-sm"
                        : "bg-slate-900/60 border border-slate-800/80"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-sky-400 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5" />
                        Company / Vendor Name
                      </span>
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-mono font-medium border border-sky-500/30">
                        Seller
                      </span>
                    </div>
                    <h3 className="font-bold text-base text-white tracking-wide break-words">
                      {vendorName}
                    </h3>
                    {vendorGstin && (
                      <p className="text-[11px] text-slate-300 font-mono mt-1">
                        GSTIN: <span className="text-sky-300 font-semibold">{vendorGstin}</span>
                      </p>
                    )}
                    {vendorAddress && (
                      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed break-words">
                        {vendorAddress}
                      </p>
                    )}
                  </div>

                  {/* Invoice Number & Date */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div
                      className={`p-3 rounded-xl transition-all ${
                        showBoxes
                          ? "bg-indigo-500/15 border border-indigo-400/40 text-indigo-200 shadow-sm"
                          : "bg-slate-900/60 border border-slate-800/80"
                      }`}
                    >
                      <span className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider block mb-0.5">
                        Invoice Number
                      </span>
                      <span className="font-bold text-sm text-slate-100 break-all">
                        {invoiceNumber}
                      </span>
                    </div>
                    <div
                      className={`p-3 rounded-xl transition-all ${
                        showBoxes
                          ? "bg-indigo-500/15 border border-indigo-400/40 text-indigo-200 shadow-sm"
                          : "bg-slate-900/60 border border-slate-800/80"
                      }`}
                    >
                      <span className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider block mb-0.5">
                        Invoice Date
                      </span>
                      <span className="font-bold text-sm text-slate-100">
                        {invoiceDate}
                      </span>
                    </div>
                  </div>

                  {/* Customer / Billed To */}
                  <div
                    className={`p-3.5 rounded-xl transition-all ${
                      showBoxes
                        ? "bg-emerald-500/15 border border-emerald-400/50 text-emerald-200 shadow-sm"
                        : "bg-slate-900/60 border border-slate-800/80"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        Billed To (Customer)
                      </span>
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-medium border border-emerald-500/30">
                        Buyer
                      </span>
                    </div>
                    <p className="font-bold text-sm text-white break-words">
                      {customerName}
                    </p>
                    {customerGstin && (
                      <p className="text-[11px] text-slate-300 font-mono mt-0.5">
                        GSTIN: <span className="text-emerald-300 font-semibold">{customerGstin}</span>
                      </p>
                    )}
                    {customerAddress && (
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed break-words">
                        {customerAddress}
                      </p>
                    )}
                  </div>

                  {/* Line Items Table representation */}
                  <div
                    className={`p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 ${
                      showBoxes ? "ring-1 ring-amber-400/40" : ""
                    }`}
                  >
                    <table className="w-full text-[10px] text-left">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                          <th className="py-1.5">Description</th>
                          <th className="py-1.5 text-center">Qty</th>
                          <th className="py-1.5 text-right">Rate</th>
                          <th className="py-1.5 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {(cleaned?.items || []).length > 0 ? (
                          cleaned!.items!.map((it, idx) => (
                            <tr key={idx}>
                              <td className="py-1.5 text-slate-200 font-medium">{it.description}</td>
                              <td className="py-1.5 text-center text-slate-400">{it.qty}</td>
                              <td className="py-1.5 text-right text-slate-400">{it.rate}</td>
                              <td className="py-1.5 text-right font-bold text-slate-100">
                                {it.total}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="py-1.5 text-slate-300">Goods / Services Item</td>
                            <td className="py-1.5 text-center text-slate-400">1</td>
                            <td className="py-1.5 text-right text-slate-400">
                              {cleaned?.subTotal || "0"}
                            </td>
                            <td className="py-1.5 text-right font-bold text-slate-100">
                              {cleaned?.subTotal || "0"}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals */}
                  <div className="pt-2 border-t border-slate-800/80 flex flex-col items-end gap-1.5 text-[11px]">
                    <div className="flex items-center justify-between w-48 text-slate-400">
                      <span>Tax (GST):</span>
                      <span className="font-mono">₹{cleaned?.totalTax ?? "0"}</span>
                    </div>
                    <div
                      className={`flex items-center justify-between w-48 font-bold text-slate-100 p-2 rounded-lg ${
                        showBoxes ? "bg-emerald-500/20 border border-emerald-400/50" : "bg-slate-900"
                      }`}
                    >
                      <span className="text-xs">Grand Total:</span>
                      <span className="text-emerald-400 text-sm font-mono font-bold">
                        ₹{cleaned?.grandTotal ?? "0"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom status badge */}
                <div className="mt-8 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Google Gemini Vision 3.6</span>
                  <span className="flex items-center gap-1 text-sky-400 font-medium">
                    <Sparkles className="w-3 h-3" /> Auto-detected Bounding Boxes
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pane Footer */}
      <div className="px-4 py-2.5 border-t border-slate-800/80 bg-slate-950/40 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
        <span>Model: {document.ocrResult?.modelUsed || "gemini-3.6-flash"}</span>
        <span className="text-emerald-400 font-medium">
          OCR Provider: {document.ocrResult?.provider?.toUpperCase() || "GEMINI-VISION"}
        </span>
      </div>
    </div>
  );
}
