import { DocumentRecord, DocumentType, DocumentStatus, AIResult, OCRResult, ExtractedInvoice } from "./document";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface UploadResponseData {
  document: DocumentRecord;
}

export interface OcrRequestPayload {
  documentId: string;
}

export interface OcrResponseData {
  ocrResult: OCRResult;
  document: DocumentRecord;
}

export interface ExtractRequestPayload {
  documentId: string;
  forceType?: DocumentType;
}

export interface ExtractResponseData {
  aiResult: AIResult;
  document: DocumentRecord;
}

export interface CleanRequestPayload {
  documentId: string;
  data?: Partial<ExtractedInvoice>;
}

export interface CleanResponseData {
  cleanedData: ExtractedInvoice;
  validationErrors: AIResult["validationErrors"];
  flags: AIResult["flags"];
  audit: AIResult["cleaningAudit"];
}

export interface ExportRequestPayload {
  documentId: string;
  format: "xlsx" | "csv" | "json";
}

export interface HistoryQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: DocumentType | "ALL";
  status?: DocumentStatus | "ALL";
  minConfidence?: number;
  sortBy?: "uploadedAt" | "fileName" | "confidenceScore" | "status";
  sortOrder?: "asc" | "desc";
}

export interface HistoryResponseData {
  documents: DocumentRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UpdateDocumentPayload {
  cleanedData?: Partial<ExtractedInvoice>;
  status?: "approved" | "rejected" | "ready_for_validation";
  documentType?: DocumentType;
  rejectionReason?: string;
}
