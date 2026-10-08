import { DocumentType, DocumentStatus } from "@/types/document";

export const APP_NAME = "AI OCR Studio";
export const APP_DESCRIPTION = "Production-Ready Intelligent Document Processing & AI Extraction";

export const SUPPORTED_DOC_TYPES: DocumentType[] = [
  "Invoice",
  "Purchase Order",
  "Quotation",
  "Delivery Challan",
  "Gate Pass",
  "Resume",
  "Bank Statement",
  "Passport",
  "PAN",
  "Aadhaar",
  "Driving License",
  "Unknown",
];

export const SUPPORTED_FILE_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const STATUS_CONFIG: Record<
  DocumentStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  uploaded: {
    label: "Uploaded",
    color: "text-slate-400",
    bg: "bg-slate-500/10",
    border: "border-slate-500/20",
  },
  ocr_processing: {
    label: "OCR Processing",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  extracting: {
    label: "AI Extracting",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
  },
  cleaning: {
    label: "AI Cleaning",
    color: "text-indigo-400",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/20",
  },
  ready_for_validation: {
    label: "Needs Review",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  approved: {
    label: "Approved",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  rejected: {
    label: "Rejected",
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
  },
};

export const GEMINI_MODELS = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (Flagship Speed & Vision)", provider: "Google" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro (Deep Multimodal Reasoning)", provider: "Google" },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash (Next-Gen Multimodal)", provider: "Google" },
];

export const OPENAI_MODELS = GEMINI_MODELS;

export const DEMO_DOCUMENTS = [
  {
    id: "doc-demo-inv-1",
    fileName: "TechCorp_Tax_Invoice_2026_09.pdf",
    vendorName: "TechCorp Solutions Private Limited",
    invoiceNumber: "INV-2026-8891",
    invoiceDate: "2026-09-01",
    grandTotal: 148680.0,
    confidence: 96.8,
    status: "ready_for_validation" as DocumentStatus,
    documentType: "Invoice" as DocumentType,
  },
  {
    id: "doc-demo-pan-2",
    fileName: "Identity_PAN_Card_KAPIL.jpg",
    vendorName: "Income Tax Department of India",
    invoiceNumber: "ABCDE1234F",
    invoiceDate: "2024-03-15",
    grandTotal: 0.0,
    confidence: 98.2,
    status: "approved" as DocumentStatus,
    documentType: "PAN" as DocumentType,
  },
  {
    id: "doc-demo-po-3",
    fileName: "GlobalLogistics_PurchaseOrder_PO-5512.pdf",
    vendorName: "Apex Hardware Systems Ltd",
    invoiceNumber: "PO-5512",
    invoiceDate: "2026-08-28",
    grandTotal: 425000.0,
    confidence: 92.5,
    status: "approved" as DocumentStatus,
    documentType: "Purchase Order" as DocumentType,
  },
  {
    id: "doc-demo-inv-4",
    fileName: "Scanned_Vendor_Challan_Blur.png",
    vendorName: "Sunrise Agro Enterprises",
    invoiceNumber: "CH-0044",
    invoiceDate: "2026-09-02",
    grandTotal: 18450.0,
    confidence: 68.4,
    status: "ready_for_validation" as DocumentStatus,
    documentType: "Delivery Challan" as DocumentType,
  },
];
