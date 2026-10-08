import { DocumentRecord } from "@/types/document";

export interface DuplicateCheckInput {
  invoiceNumber?: string | null;
  vendorName?: string | null;
  invoiceDate?: string | null;
  grandTotal?: number | null;
  currentDocumentId?: string;
}

export interface DuplicateMatchDetails {
  originalDocumentId: string;
  matchedInvoiceNumber?: string;
  matchedVendor?: string;
  matchedDate?: string;
  matchedTotal?: number;
  previouslyUploadedOn: string;
  matchType: "invoice_number" | "composite";
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchType: "invoice_number" | "composite" | "none";
  warningMessage?: string;
  matchedDocument?: DocumentRecord;
  details?: DuplicateMatchDetails;
}

/**
 * Normalizes strings for robust, fault-tolerant matching (stripping extra spaces, case-insensitive).
 */
export function normalizeText(value?: string | null): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9]/gi, "");
}

/**
 * Normalizes invoice number specifically (trims whitespace, removes non-alphanumeric separators if desired, case-insensitive).
 */
export function normalizeInvoiceNumber(val?: string | null): string {
  if (!val) return "";
  return val.trim().toLowerCase();
}

/**
 * Normalizes dates to YYYY-MM-DD format if parseable.
 */
export function normalizeDate(val?: string | null): string {
  if (!val) return "";
  const cleaned = val.trim();
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }
  return cleaned.toLowerCase();
}

/**
 * Compares two numeric amounts with floating point precision tolerance.
 */
export function compareAmounts(a?: number | null, b?: number | null, epsilon = 0.05): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return Math.abs(Number(a) - Number(b)) <= epsilon;
}

/**
 * Core Duplicate Invoice Detection Service:
 * 1. Checks if Invoice Number already exists in previous records.
 * 2. Also compares Vendor Name, Invoice Date, and Grand Total.
 * 3. If Invoice Number is empty, compares using composite key: Vendor + Date + Grand Total.
 * 4. Generates standard warning message without blocking uploads.
 */
export function checkDuplicateInvoice(
  candidate: DuplicateCheckInput,
  existingDocuments: DocumentRecord[]
): DuplicateCheckResult {
  const candInvNum = candidate.invoiceNumber ? normalizeInvoiceNumber(candidate.invoiceNumber) : "";
  const candVendor = normalizeText(candidate.vendorName);
  const candDate = normalizeDate(candidate.invoiceDate);
  const candTotal = candidate.grandTotal !== null && candidate.grandTotal !== undefined
    ? Number(candidate.grandTotal)
    : null;

  // Filter out the current document being processed
  const candidatesToCompare = existingDocuments.filter((doc) => {
    if (candidate.currentDocumentId && doc.id === candidate.currentDocumentId) {
      return false;
    }
    // Only check against documents that have extracted or cleaned data
    return !!(doc.aiResult?.cleanedData || doc.ocrResult?.structuredData);
  });

  // RULE 1: If Invoice Number exists and is non-empty, check for duplicate invoice number
  if (candInvNum && candInvNum.length > 0) {
    for (const doc of candidatesToCompare) {
      const existingData = doc.aiResult?.cleanedData || (doc.ocrResult?.structuredData as any);
      const existingInvNum = existingData?.invoiceNumber
        ? normalizeInvoiceNumber(existingData.invoiceNumber)
        : "";

      if (existingInvNum && existingInvNum === candInvNum) {
        // Also compare Vendor, Date, and Grand Total to provide rich audit details
        const existingVendor = normalizeText(existingData.vendorName);
        const existingDate = normalizeDate(existingData.invoiceDate);
        const existingTotal = existingData.grandTotal !== undefined ? Number(existingData.grandTotal) : null;

        const dateStr = doc.uploadedAt
          ? new Date(doc.uploadedAt).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : "Earlier";

        const originalNumber = existingData.invoiceNumber || candidate.invoiceNumber || "";
        const warningMessage = `⚠ Duplicate Invoice Detected\nInvoice Number: ${originalNumber}\nPreviously uploaded on:\n${dateStr}`;

        return {
          isDuplicate: true,
          matchType: "invoice_number",
          warningMessage,
          matchedDocument: doc,
          details: {
            originalDocumentId: doc.id,
            matchedInvoiceNumber: originalNumber,
            matchedVendor: existingData.vendorName,
            matchedDate: existingData.invoiceDate,
            matchedTotal: existingTotal ?? undefined,
            previouslyUploadedOn: dateStr,
            matchType: "invoice_number",
          },
        };
      }
    }
  }

  // RULE 2: If Invoice Number is empty, compare using: Vendor + Date + Grand Total
  if (!candInvNum && candVendor && candDate && candTotal !== null && candTotal > 0) {
    for (const doc of candidatesToCompare) {
      const existingData = doc.aiResult?.cleanedData || (doc.ocrResult?.structuredData as any);
      if (!existingData) continue;

      const existingVendor = normalizeText(existingData.vendorName);
      const existingDate = normalizeDate(existingData.invoiceDate);
      const existingTotal = existingData.grandTotal !== undefined ? Number(existingData.grandTotal) : null;

      const vendorMatches = existingVendor && existingVendor === candVendor;
      const dateMatches = existingDate && existingDate === candDate;
      const totalMatches = compareAmounts(candTotal, existingTotal);

      if (vendorMatches && dateMatches && totalMatches) {
        const dateStr = doc.uploadedAt
          ? new Date(doc.uploadedAt).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : "Earlier";

        const warningMessage = `⚠ Duplicate Invoice Detected\nMatched: Vendor (${existingData.vendorName}), Date (${existingData.invoiceDate}), Total (₹${existingTotal})\nPreviously uploaded on:\n${dateStr}`;

        return {
          isDuplicate: true,
          matchType: "composite",
          warningMessage,
          matchedDocument: doc,
          details: {
            originalDocumentId: doc.id,
            matchedInvoiceNumber: existingData.invoiceNumber || undefined,
            matchedVendor: existingData.vendorName,
            matchedDate: existingData.invoiceDate,
            matchedTotal: existingTotal ?? undefined,
            previouslyUploadedOn: dateStr,
            matchType: "composite",
          },
        };
      }
    }
  }

  return {
    isDuplicate: false,
    matchType: "none",
  };
}
