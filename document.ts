export type DocumentType =
  | "Invoice"
  | "Purchase Order"
  | "Quotation"
  | "Delivery Challan"
  | "Gate Pass"
  | "Resume"
  | "Bank Statement"
  | "Passport"
  | "PAN"
  | "Aadhaar"
  | "Driving License"
  | "Unknown";

export type DocumentStatus =
  | "uploaded"
  | "ocr_processing"
  | "extracting"
  | "cleaning"
  | "ready_for_validation"
  | "approved"
  | "rejected";

export interface BoundingBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OCRWord {
  text: string;
  confidence: number;
  boundingBox?: BoundingBox;
}

export interface OCRLine {
  text: string;
  confidence: number;
  boundingBox?: BoundingBox;
  words?: OCRWord[];
}

export interface OCRTableCell {
  rowIndex: number;
  columnIndex: number;
  rowSpan?: number;
  columnSpan?: number;
  content: string;
  confidence?: number;
  boundingBox?: BoundingBox;
}

export interface OCRTable {
  rowCount: number;
  columnCount: number;
  cells: OCRTableCell[];
  boundingBox?: BoundingBox;
}

export interface OCRKeyValuePair {
  key: string;
  value: string;
  confidence: number;
  keyBoundingBox?: BoundingBox;
  valueBoundingBox?: BoundingBox;
}

export interface OCRResult {
  id: string;
  documentId: string;
  rawText: string;
  pageCount: number;
  tables: OCRTable[];
  keyValuePairs: OCRKeyValuePair[];
  lines: OCRLine[];
  provider: "gemini-vision" | "openai-vision" | "azure" | "tesseract" | "simulator";
  modelUsed: string;
  detectedType?: DocumentType;
  structuredData?: ExtractedInvoice; // Structured invoice data extracted directly by Vision engine
  fieldConfidences?: Record<string, number>; // Field-level confidence scores (0-100)
  rawAzureDocument?: Record<string, unknown>;
  createdAt: string;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  hsn: string;
  qty: number;
  rate: number;
  discount: number;
  gstRate: number; // in percentage e.g. 18
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  confidence?: number;
}

export interface ExtractedInvoice {
  vendorName: string;
  vendorGstin: string;
  vendorPan?: string;
  vendorEmail?: string;
  vendorPhone?: string;
  vendorAddress?: string;
  customerName: string;
  customerGstin?: string;
  customerAddress?: string;
  invoiceNumber?: string | null;
  invoiceDate: string; // ISO YYYY-MM-DD
  dueDate?: string;
  poNumber?: string;
  currency: string;
  items: InvoiceLineItem[];
  subTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  totalTax: number;
  grandTotal: number;
  notes?: string;
  deliveryNote?: string;
  deliveryNo?: string;
  dispatchNote?: string;
  challanNo?: string;
}

export interface ExtractedIdentityDoc {
  idNumber: string;
  holderName: string;
  fatherName?: string;
  dob?: string;
  gender?: "MALE" | "FEMALE" | "OTHER";
  address?: string;
  issueDate?: string;
  expiryDate?: string;
  nationality?: string;
}

export interface GenericExtractedData {
  title?: string;
  summary?: string;
  parties?: string[];
  referenceNumber?: string;
  date?: string;
  fields: Record<string, string | number | boolean | null>;
  tables?: Array<Record<string, unknown>[]>;
}

export type ExtractedDataPayload =
  | { type: "Invoice"; data: ExtractedInvoice }
  | { type: "PAN" | "Aadhaar" | "Passport" | "Driving License"; data: ExtractedIdentityDoc }
  | { type: DocumentType; data: GenericExtractedData };

export interface ValidationError {
  id: string;
  field: string;
  message: string;
  severity: "error" | "warning" | "info";
  code:
    | "INVALID_GSTIN"
    | "INVALID_PAN"
    | "INVALID_EMAIL"
    | "INVALID_PHONE"
    | "INVALID_DATE"
    | "CALCULATION_MISMATCH"
    | "MISSING_REQUIRED_FIELD"
    | "MISSING_INVOICE_NUMBER"
    | "DUPLICATE_INVOICE"
    | "DUPLICATE_VENDOR"
    | "DUPLICATE_ROW";
  originalValue?: string | number;
  suggestedValue?: string | number;
}

export interface AIResult {
  id: string;
  documentId: string;
  documentType: DocumentType;
  overallConfidence: number; // 0 to 100
  fieldConfidences: Record<string, number>;
  rawExtractedData: Record<string, unknown>;
  cleanedData: ExtractedInvoice; // Strongly typed default to Invoice or generic fields
  validationErrors: ValidationError[];
  flags: {
    isDuplicateInvoice: boolean;
    isDuplicateVendor: boolean;
    isGstinValid: boolean;
    isPanValid: boolean;
    isCalculationAccurate: boolean;
    hasMissingFields: boolean;
  };
  cleaningAudit: {
    trimmedSpacesCount: number;
    normalizedVendorName?: string;
    standardizedDatesCount: number;
    ocrCorrectionsCount: number;
    duplicateRowsRemoved: number;
  };
  status: "pending_validation" | "approved" | "rejected";
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRecord {
  id: string;
  userId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  thumbnailUrl?: string;
  status: DocumentStatus;
  documentType: DocumentType;
  confidenceScore: number;
  pageCount: number;
  uploadedAt: string;
  updatedAt: string;
  ocrResult?: OCRResult;
  aiResult?: AIResult;
  metadata?: Record<string, unknown>;
  tallyImportRows?: import("./tally").TallyImportRow[];
  isDuplicate?: boolean;
  duplicateInfo?: {
    originalDocumentId?: string;
    matchedInvoiceNumber?: string;
    matchedVendor?: string;
    matchedDate?: string;
    matchedTotal?: number;
    previouslyUploadedOn?: string;
    matchType?: "invoice_number" | "composite";
  };
}

export interface ActivityLog {
  id: string;
  documentId?: string;
  userId: string;
  action:
    | "DOCUMENT_UPLOADED"
    | "OCR_PROCESSED"
    | "AI_EXTRACTED"
    | "DATA_CLEANED"
    | "DATA_EDITED"
    | "DOCUMENT_APPROVED"
    | "DOCUMENT_REJECTED"
    | "DOCUMENT_EXPORTED"
    | "DOCUMENT_DELETED";
  details: string;
  createdAt: string;
}

export interface DashboardStats {
  totalDocuments: number;
  documentsToday: number;
  successfulOcr: number;
  failedOcr: number;
  averageConfidence: number;
  successRate: number;
  typeDistribution: Record<DocumentType, number>;
}

export interface GoogleSheetsInvoiceData {
  documentType: string;
  vendorName: string;
  vendorGstin: string;
  vendorPan: string;
  customerName: string;
  customerGstin: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  poNumber: string;
  currency: string;
  paymentTerms: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  grandTotal: number;
  itemsCount: number;
  confidenceScore: string;
  processedDate: string;
  items: Array<{
    invoiceNumber: string;
    description: string;
    hsn: string;
    qty: number;
    rate: number;
    discount: number;
    gstRate: number;
    total: number;
  }>;
}

