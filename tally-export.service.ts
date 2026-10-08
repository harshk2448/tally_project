import * as XLSX from "xlsx";
import JSZip from "jszip";
import { DocumentRecord, ExtractedInvoice, InvoiceLineItem, GoogleSheetsInvoiceData } from "@/types/document";
import {
  TallyInvoice,
  TallyVoucher,
  TallyItem,
  TallyTax,
  TallyVoucherType,
  TallyValidationResult,
  TallyExportCheckSummary,
  MissingMasterInfo,
  TallyLedgerEntry,
  TallyInventoryEntry,
  TallyParty,
  TallyTaxBreakdown,
  TallyAccountingBalance,
  TallyVoucherStatus,
  TallyProfile,
  TallyStandardFieldKey,
  TallyImportRow,
} from "@/types/tally";
import { tallyProfileService } from "./tally-profile.service";
import { tallyMappingService } from "./tally-mapping.service";
import { googleSheetsConfigService } from "./google-sheets-config.service";
import { determinePlaceOfSupply, getStateFromGstin } from "@/lib/gst-state-codes";
import {
  DEFAULT_UNIT_MAPPINGS,
  resolveUnit,
  resolveTaxLedgerName,
  formatTallyDate,
  formatTallyExcelDate,
  normalizeStateName,
  determineVoucherType,
  transformValidatedInvoiceToTally as coreTransform,
  validateTallyInvoice as coreValidate,
} from "@/lib/tally-utils";

/**
 * FINAL TALLY EXCEL 21-COLUMN FORMAT
 * Exactly one sheet: "Tally Import"
 * Exactly 21 columns in this exact order.
 */
export const FINAL_TALLY_IMPORT_HEADERS = [
  "Voucher Date",
  "Voucher Number",
  "Voucher Ref. No",
  "Party Name",
  "State",
  "GST Number",
  "ITEM GST RATE",
  "ITEM HSN",
  "Item Name",
  "Units",
  "Quantity",
  "Rate",
  "TAXABLE AMOUNT",
  "SALES LEDGER",
  "IGST VALUE",
  "CGST VALUE",
  "SGST VALUE",
  "ITEM DESCRIPTION",
  "NARRATION",
  "Delivery Note",
  "Delivery No.",
] as const;

export interface TallyTransactionRow {
  voucherType: string;
  voucherDate: string; // DD-MM-YYYY
  invoiceNumber: string;
  referenceNumber: string;
  partyName: string;
  partyGstin: string;
  ledgerName: string;
  itemName: string;
  hsnSac: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number; // Basic amount strictly excluding tax
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  grandTotal: number; // Item total on item rows, or voucher total on header rows
  godown: string;
  poNumber: string;
  dueDate: string;
  paymentTerms: string;
  narration: string;
}

export interface TallyValidationRow {
  invoiceNumber: string;
  invoiceDate: string;
  partyName: string;
  partyGstin: string;
  voucherType: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  grandTotal: number;
  validationStatus: string;
  validationErrors: string;
  processedDate: string;
}

export const TALLY_EXPORT_HEADERS = [
  "Voucher Type",
  "Voucher Date",
  "Invoice Number",
  "Reference Number",
  "Party Name",
  "Party GSTIN",
  "Ledger Name",
  "Item Name",
  "HSN/SAC",
  "Quantity",
  "Unit",
  "Rate",
  "Amount",
  "CGST",
  "SGST",
  "IGST",
  "Total Tax",
  "Item Total",
  "Godown",
  "PO Number",
  "Due Date",
  "Payment Terms",
  "Narration",
];

export const TALLY_VALIDATION_HEADERS = [
  "Invoice Number",
  "Invoice Date",
  "Party Name",
  "Party GSTIN",
  "Voucher Type",
  "Subtotal",
  "CGST",
  "SGST",
  "IGST",
  "Total Tax",
  "Grand Total",
  "Validation Status",
  "Validation Errors",
  "Processed Date",
];

/**
 * Sanitizes an invoice number to produce a safe Windows/cross-platform filename.
 * e.g., "INV/2024/001" -> "INV_2024_001"
 * Replaces invalid characters: \ / : * ? " < > | and whitespace/control characters.
 */
export function sanitizeTallyFilename(invoiceNumber?: string | null, fallback = "Invoice"): string {
  if (!invoiceNumber || !invoiceNumber.trim()) {
    return fallback;
  }
  const sanitized = invoiceNumber
    .trim()
    .replace(/[/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+|[._]+$/g, "");

  return sanitized || fallback;
}

/**
 * Generates unique, sanitized filenames for an array of Tally invoices.
 * Format: Tally_<SanitizedInvoiceNumber>.xlsx
 * If duplicate invoice numbers exist, appends _1, _2, etc.
 */
export function generateUniqueTallyFilenames(vouchers: Array<{ voucherNumber?: string; id?: string }>): string[] {
  const counts = new Map<string, number>();
  const results: string[] = [];

  vouchers.forEach((v, index) => {
    const rawNumber = v.voucherNumber || `INV_${index + 1}`;
    const baseSafe = sanitizeTallyFilename(rawNumber, `INV_${index + 1}`);
    const baseName = `Tally_${baseSafe}`;

    const currentCount = counts.get(baseName) || 0;
    counts.set(baseName, currentCount + 1);

    if (currentCount === 0) {
      results.push(`${baseName}.xlsx`);
    } else {
      results.push(`${baseName}_${currentCount}.xlsx`);
    }
  });

  return results;
}

function createWorksheetWithTypes(
  headers: string[],
  dataRows: any[][],
  colWidths?: number[]
): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const range = { s: { c: 0, r: 0 }, e: { c: headers.length - 1, r: dataRows.length } };

  headers.forEach((h, c) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c });
    ws[cellRef] = { t: "s", v: h };
  });

  dataRows.forEach((row, rIdx) => {
    const r = rIdx + 1;
    row.forEach((val, c) => {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      if (val === null || val === undefined || val === "") {
        ws[cellRef] = { t: "s", v: "" };
      } else if (typeof val === "number") {
        ws[cellRef] = { t: "n", v: val };
      } else {
        ws[cellRef] = { t: "s", v: String(val).trim() };
      }
    });
  });

  ws["!ref"] = XLSX.utils.encode_range(range);
  if (colWidths) {
    ws["!cols"] = colWidths.map((w) => ({ wch: w }));
  }
  return ws;
}

export class TallyExportService {
  public static formatTallyDate(rawDate?: string | null): string {
    return formatTallyDate(rawDate);
  }

  public static determineVoucherType(
    docOrInvoice: DocumentRecord | ExtractedInvoice,
    explicitUserType?: "Purchase" | "Sales" | "REQUIRES_VALIDATION",
    profileId?: string
  ): { voucherType: TallyVoucherType; isConfident: boolean; reason: string } {
    const profile = tallyProfileService.getProfileById(profileId);
    return determineVoucherType(docOrInvoice, explicitUserType, {
      companyGstin: profile.companyGstin,
      companyName: profile.companyName,
    });
  }

  /**
   * Step 12: Single Source of Truth
   * Transforms validated invoice data into a structured TallyVoucher / TallyInvoice.
   */
  public static transformValidatedInvoiceToTally(
    docOrInvoice: DocumentRecord | ExtractedInvoice,
    options?: {
      explicitVoucherType?: "Purchase" | "Sales";
      voucherId?: string;
      customLedgerName?: string;
      profileId?: string;
      profile?: TallyProfile;
    }
  ): TallyInvoice {
    const profile = options?.profile || tallyProfileService.getProfileById(options?.profileId);

    return coreTransform(docOrInvoice, {
      explicitVoucherType: options?.explicitVoucherType,
      voucherId: options?.voucherId || "V001",
      customLedgerName: options?.customLedgerName,
      profile,
      companyConfig: {
        companyGstin: profile.companyGstin,
        companyName: profile.companyName,
      },
    });
  }

  /**
   * Step 6 & 7: Strict Accounting Validation
   */
  public static validateTallyInvoice(
    tallyInvoice: TallyInvoice,
    options?: {
      existingInvoiceNumbers?: string[];
      profileId?: string;
    }
  ): TallyValidationResult {
    const profile = tallyProfileService.getProfileById(options?.profileId || tallyInvoice.profileId);
    return coreValidate(tallyInvoice, {
      existingInvoiceNumbers: options?.existingInvoiceNumbers,
      profile,
    });
  }

  /**
   * Backwards compatible bridge for Google Sheets and legacy validators
   */
  public static validateForTally(
    doc: DocumentRecord,
    options?: {
      existingInvoiceNumbers?: string[];
      explicitVoucherType?: "Purchase" | "Sales";
      profileId?: string;
    }
  ): TallyValidationResult {
    const tallyInvoice = this.transformValidatedInvoiceToTally(doc, {
      explicitVoucherType: options?.explicitVoucherType,
      profileId: options?.profileId,
    });
    return this.validateTallyInvoice(tallyInvoice, {
      existingInvoiceNumbers: options?.existingInvoiceNumbers,
      profileId: options?.profileId,
    });
  }

  /**
   * Maps a document to transaction rows for Google Sheets / legacy exports
   */
  public static mapToTallyTransactions(
    doc: DocumentRecord,
    validation?: any,
    options?: { profileId?: string }
  ): TallyTransactionRow[] {
    const tallyInvoice = this.transformValidatedInvoiceToTally(doc, {
      explicitVoucherType: validation?.voucherType || (doc.metadata?.tallyVoucherType as "Purchase" | "Sales"),
      profileId: options?.profileId,
    });

    return tallyInvoice.inventoryEntries.map((it) => ({
      voucherType: tallyInvoice.voucherType,
      voucherDate: tallyInvoice.voucherDate,
      invoiceNumber: tallyInvoice.voucherNumber,
      referenceNumber: tallyInvoice.referenceNumber,
      partyName: tallyInvoice.party.ledgerName,
      partyGstin: tallyInvoice.party.gstin,
      ledgerName: tallyInvoice.purchaseLedger || tallyInvoice.salesLedger || "Purchase Accounts",
      itemName: it.stockItemName,
      hsnSac: it.hsnSac,
      quantity: it.quantity,
      unit: it.unit,
      rate: it.rate,
      amount: it.taxableAmount,
      cgst: it.cgst,
      sgst: it.sgst,
      igst: it.igst,
      totalTax: it.cgst + it.sgst + it.igst,
      grandTotal: it.total, // Item total on item rows
      godown: "Main Location",
      poNumber: tallyInvoice.poNumber || "",
      dueDate: tallyInvoice.dueDate || tallyInvoice.voucherDate,
      paymentTerms: tallyInvoice.paymentTerms || "Due on receipt",
      narration: tallyInvoice.narration,
    }));
  }

  /**
   * Maps a document to a validation row for Google Sheets Tally Validation tab
   */
  public static mapToTallyValidationRow(
    doc: DocumentRecord,
    validation?: any
  ): TallyValidationRow {
    const inv: any = (doc as any).extractedData || doc.aiResult?.cleanedData || {};
    const invoiceNumber = inv.invoiceNumber || doc.metadata?.originalFilename || "UNKNOWN";
    const invoiceDate = formatTallyDate(inv.invoiceDate);
    const partyName = inv.vendorName || inv.vendor?.name || inv.customerName || inv.customer?.name || "Unknown Party";
    const partyGstin = inv.vendorGstin || inv.vendor?.gstin || inv.customerGstin || inv.customer?.gstin || "";
    const voucherType = validation?.voucherType || "Purchase";

    const subtotal = inv.subTotal || inv.subtotal || 0;
    const cgst = inv.cgstTotal || inv.taxBreakdown?.cgst || 0;
    const sgst = inv.sgstTotal || inv.taxBreakdown?.sgst || 0;
    const igst = inv.igstTotal || inv.taxBreakdown?.igst || 0;
    const totalTax = inv.totalTax || (cgst + sgst + igst);
    const grandTotal = inv.grandTotal || inv.total || 0;

    return {
      invoiceNumber,
      invoiceDate,
      partyName,
      partyGstin,
      voucherType,
      subtotal,
      cgst,
      sgst,
      igst,
      totalTax,
      grandTotal,
      validationStatus: validation?.isValid ? "PASSED" : "FAILED",
      validationErrors: validation?.errors?.join("; ") || (validation?.missingMasters ? validation.missingMasters.map((m: any) => m.reason).join("; ") : "Validation failed"),
      processedDate: new Date().toISOString().split("T")[0],
    };
  }

  /**
   * Helper to normalize a list of invoices or documents to TallyInvoice objects
   */
  private static resolveVouchersList(
    invoices: TallyInvoice | TallyInvoice[] | DocumentRecord | DocumentRecord[],
    options?: {
      explicitVoucherType?: "Purchase" | "Sales";
      voucherTypes?: Record<string, "Purchase" | "Sales">;
      profileId?: string;
      profile?: TallyProfile;
    }
  ): TallyInvoice[] {
    const list = Array.isArray(invoices) ? invoices : [invoices];
    const profile = options?.profile || tallyProfileService.getProfileById(options?.profileId);
    const vouchers: TallyInvoice[] = [];

    const effectiveVoucherTypes: Record<string, "Purchase" | "Sales"> =
      options?.voucherTypes ||
      (options && !("voucherTypes" in options) && !("explicitVoucherType" in options)
        ? (options as any)
        : {});

    list.forEach((item, index) => {
      const voucherId = `V${String(index + 1).padStart(3, "0")}`;
      let tallyInv: TallyInvoice;

      if ("voucherType" in item && "inventoryEntries" in item && "ledgerEntries" in item) {
        tallyInv = item as TallyInvoice;
      } else {
        const doc = item as DocumentRecord;
        const explicitType = effectiveVoucherTypes[doc.id] || options?.explicitVoucherType;
        tallyInv = this.transformValidatedInvoiceToTally(doc, {
          explicitVoucherType: explicitType,
          voucherId,
          profile,
        });
      }

      vouchers.push(tallyInv);
    });

    return vouchers;
  }

  // -------------------------------------------------------------
  // EXPORT TYPE 1: Internal Complete Diagnostic Excel Workbook (Step 9)
  // -------------------------------------------------------------
  /**
   * Generates a 9-Sheet Relational Diagnostic Workbook.
   * Clearly labeled as "Internal Application Transformation / Diagnostic Preview".
   * NOT labeled as "Tally Ready".
   */
  public static generateInternalPreviewExcel(
    invoices: TallyInvoice | TallyInvoice[] | DocumentRecord | DocumentRecord[],
    options?: {
      explicitVoucherType?: "Purchase" | "Sales";
      voucherTypes?: Record<string, "Purchase" | "Sales">;
      profileId?: string;
    }
  ): Uint8Array {
    return this.generateTallyImportExcel(invoices, options);
  }

  public static generateTallyImportExcel(
    invoices: TallyInvoice | TallyInvoice[] | DocumentRecord | DocumentRecord[],
    options?: {
      explicitVoucherType?: "Purchase" | "Sales";
      voucherTypes?: Record<string, "Purchase" | "Sales">;
      profileId?: string;
      includeUnready?: boolean;
    }
  ): Uint8Array {
    let vouchers = this.resolveVouchersList(invoices, options);
    const profile = tallyProfileService.getProfileById(options?.profileId || vouchers[0]?.profileId);

    // Validate each voucher independently.
    // Follow the explicit rule: Validate taxes -> Validate totals -> Validate debit/credit -> Mark READY.
    // Only genuinely INVALID invoices (math/balance errors) are excluded unless includeUnready is explicitly true.
    if (!options?.includeUnready) {
      const { classified, readyCount, needsReviewCount, invalidCount } = this.classifyVouchers(vouchers, options);
      // Prefer READY vouchers; fallback to NEEDS_REVIEW if none strictly marked READY; block only INVALID
      let exportableVouchers = classified.filter((c) => c.status === "READY").map((c) => c.voucher);
      if (exportableVouchers.length === 0) {
        exportableVouchers = classified.filter((c) => c.status === "NEEDS_REVIEW").map((c) => c.voucher);
      }
      if (exportableVouchers.length === 0) {
        const errorDetails = classified
          .filter((c) => c.status === "INVALID")
          .map((c) => `${c.voucher.voucherNumber || "Invoice"}: ${c.validation.errors.join("; ") || c.status}`)
          .join(" | ");
        throw new Error(
          `No invoices could be exported (${invalidCount} invalid). Details: ${errorDetails}. Please fix the math/total errors to export.`
        );
      }
      vouchers = exportableVouchers;
    }

    const rows: any[][] = [];

    vouchers.forEach((v) => {
      // 1. Voucher Date: strictly from actual invoice date, never today's date or upload date
      const voucherDate = formatTallyExcelDate(v.voucherDate);

      // 2. Voucher Number: original invoice number (repeated for all item lines of this voucher)
      const voucherNumber = (v.voucherNumber || "").trim();

      // 3. Voucher Ref. No: PO number or reference number
      const voucherRefNo = (v.referenceNumber || v.poNumber || voucherNumber).trim();

      // 4. Party Name: from invoice or mapped ledger, never "Unassigned Vendor"
      const partyName = (
        v.party.ledgerName && v.party.ledgerName !== "Unassigned Vendor"
          ? v.party.ledgerName
          : v.party.name && v.party.name !== "Unassigned Vendor"
          ? v.party.name
          : ""
      ).trim();

      // 5. State: normalized state spelling (e.g. Haryana, Gujarat, Maharashtra)
      const state = normalizeStateName(v.party.state || v.party.gstin);

      // 6. GST Number: from invoice party GSTIN
      const gstNumber = (v.party.gstin || "").trim();

      // 14. SALES LEDGER: configured Tally sales/purchase ledger
      const salesLedger = (
        profile.ledgers.salesLedger ||
        v.salesLedger ||
        v.purchaseLedger ||
        (v.voucherType === "Sales" ? "Sales Accounts" : "Purchase Accounts")
      ).trim();

      // 19. NARRATION: actual invoice narration, never invent
      const narration = (v.narration || "").trim();

      // 20. Delivery Note: from invoice if present, else blank
      const deliveryNote = ((v as any).deliveryNote || "").trim();

      // 21. Delivery No.: from invoice if present, else blank
      const deliveryNo = ((v as any).deliveryNo || "").trim();

      // Interstate check for tax segregation:
      // If invoice has IGST: IGST VALUE = actual IGST, CGST = 0, SGST = 0
      // If invoice has CGST+SGST: CGST = actual CGST, SGST = actual SGST, IGST = 0
      const hasVoucherIgst = (v.tax.igstAmount || 0) > 0 || v.inventoryEntries.some((it) => (it.igst || 0) > 0);
      const isInterstate = hasVoucherIgst;

      // Each row represents ONE invoice ITEM LINE
      v.inventoryEntries.forEach((it) => {
        // 7. ITEM GST RATE: actual numeric GST rate applicable to that item (e.g. 5, 18)
        const itemGstRate = Number(it.gstRate || (it.cgstRate || 0) + (it.sgstRate || 0) + (it.igstRate || 0) || 0);

        // 8. ITEM HSN: actual HSN from invoice, leave blank if missing
        const itemHsn = (it.hsnSac || "").trim();

        // 9. Item Name
        const itemName = (it.stockItemName || it.itemName || "").trim();

        // 10. Units (separate from quantity, e.g. "PCS")
        const units = (it.unit || "PCS").trim();

        // 11. Quantity (numeric)
        const quantity = Number(it.quantity) || 0;

        // 12. Rate (numeric)
        const rate = Number(it.rate) || 0;

        // 13. TAXABLE AMOUNT: taxable value of THAT PARTICULAR ITEM (numeric)
        const taxableAmount = Number(it.taxableAmount) || 0;

        // 15. IGST VALUE: item tax amount (numeric)
        const igstValue = isInterstate ? (Number(it.igst) || 0) : 0;

        // 16. CGST VALUE: item tax amount (numeric)
        const cgstValue = !isInterstate ? (Number(it.cgst) || 0) : 0;

        // 17. SGST VALUE: item tax amount (numeric)
        const sgstValue = !isInterstate ? (Number(it.sgst) || 0) : 0;

        // 18. ITEM DESCRIPTION
        const itemDescription = (it.description || it.itemName || "").trim();

        rows.push([
          voucherDate,     // 1. Voucher Date
          voucherNumber,   // 2. Voucher Number
          voucherRefNo,    // 3. Voucher Ref. No
          partyName,       // 4. Party Name
          state,           // 5. State
          gstNumber,       // 6. GST Number
          itemGstRate,     // 7. ITEM GST RATE
          itemHsn,         // 8. ITEM HSN
          itemName,        // 9. Item Name
          units,           // 10. Units
          quantity,        // 11. Quantity
          rate,            // 12. Rate
          taxableAmount,   // 13. TAXABLE AMOUNT
          salesLedger,     // 14. SALES LEDGER
          igstValue,       // 15. IGST VALUE
          cgstValue,       // 16. CGST VALUE
          sgstValue,       // 17. SGST VALUE
          itemDescription, // 18. ITEM DESCRIPTION
          narration,       // 19. NARRATION
          deliveryNote,    // 20. Delivery Note
          deliveryNo,      // 21. Delivery No.
        ]);
      });
    });

    const wb = XLSX.utils.book_new();

    // Create single worksheet with typed cells
    const ws: XLSX.WorkSheet = {};
    const range = { s: { c: 0, r: 0 }, e: { c: FINAL_TALLY_IMPORT_HEADERS.length - 1, r: rows.length } };

    // Column indexes that are strictly numeric:
    // 6: ITEM GST RATE, 10: Quantity, 11: Rate, 12: TAXABLE AMOUNT, 14: IGST VALUE, 15: CGST VALUE, 16: SGST VALUE
    const numericIndices = new Set([6, 10, 11, 12, 14, 15, 16]);

    FINAL_TALLY_IMPORT_HEADERS.forEach((h, c) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c });
      ws[cellRef] = { t: "s", v: h };
    });

    rows.forEach((row, rIdx) => {
      const r = rIdx + 1;
      row.forEach((val, c) => {
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
      { wch: 35 }, // 19. NARRATION
      { wch: 18 }, // 20. Delivery Note
      { wch: 18 }, // 21. Delivery No.
    ];

    // EXACTLY ONE SHEET: Tally Data
    XLSX.utils.book_append_sheet(wb, ws, "Tally Data");

    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
  }

  /**
   * Generates a 21-column Excel buffer directly from an array of TallyImportRow objects.
   * Produces exactly ONE sheet: "Tally Import" with typed numbers and exact 21 columns.
   */
  public static generateExcelFromTallyImportRows(rows: TallyImportRow[]): Uint8Array {
    const wb = XLSX.utils.book_new();
    const ws: XLSX.WorkSheet = {};
    const range = {
      s: { c: 0, r: 0 },
      e: { c: FINAL_TALLY_IMPORT_HEADERS.length - 1, r: rows.length },
    };

    FINAL_TALLY_IMPORT_HEADERS.forEach((h, c) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c });
      ws[cellRef] = { t: "s", v: h };
    });

    const numericIndices = new Set([6, 10, 11, 12, 14, 15, 16]);

    rows.forEach((row, rIdx) => {
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
      { wch: 35 }, // 19. NARRATION
      { wch: 18 }, // 20. Delivery Note
      { wch: 18 }, // 21. Delivery No.
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Tally Data");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
  }

  /**
   * Generates a Master Data Excel export containing Party Masters, Stock Items, Ledgers, and Units.
   */
  public static generateMasterExportExcel(
    invoices: TallyInvoice | TallyInvoice[] | DocumentRecord | DocumentRecord[],
    options?: {
      explicitVoucherType?: "Purchase" | "Sales";
      voucherTypes?: Record<string, "Purchase" | "Sales">;
      profileId?: string;
    }
  ): Uint8Array {
    return this.generateTallyImportExcel(invoices, options);
  }

  /**
   * Sanitizes an invoice number to produce a safe Windows/cross-platform filename.
   */
  public static sanitizeTallyFilename(invoiceNumber?: string | null, fallback = "Invoice"): string {
    return sanitizeTallyFilename(invoiceNumber, fallback);
  }

  public static classifyVouchers(
    invoices: TallyInvoice | TallyInvoice[] | DocumentRecord | DocumentRecord[],
    options?: {
      explicitVoucherType?: "Purchase" | "Sales";
      voucherTypes?: Record<string, "Purchase" | "Sales">;
      profileId?: string;
    }
  ): {
    classified: Array<{
      voucher: TallyInvoice;
      validation: TallyValidationResult;
      isReady: boolean;
      status: "READY" | "NEEDS_REVIEW" | "INVALID";
    }>;
    readyCount: number;
    needsReviewCount: number;
    invalidCount: number;
    totalCount: number;
  } {
    const vouchers = this.resolveVouchersList(invoices, options);
    const profile = tallyProfileService.getProfileById(options?.profileId || vouchers[0]?.profileId);

    const classified = vouchers.map((v) => {
      const val = this.validateTallyInvoice(v, { profileId: profile.id });
      const isDebitCreditBalanced = v.accountingBalance.isBalanced;
      const isMathBalanced = val.mathDetails.isBalanced;
      const hasParty = Boolean(
        (v.party.name && v.party.name !== "Unassigned Vendor" && v.party.name !== "Unassigned Customer") ||
        (v.party.ledgerName && v.party.ledgerName !== "Unassigned Vendor" && v.party.ledgerName !== "Unassigned Customer")
      );
      const hasItems = v.inventoryEntries.length > 0;
      const hasVoucherNo = Boolean(v.voucherNumber && !v.voucherNumber.toLowerCase().includes("unknown"));
      const isTaxValid = !val.errors.some((e) => e.toLowerCase().includes("tax"));

      // Invoice A -> Validate taxes -> Validate totals -> Validate debit/credit -> Mark READY
      const isAccountingValid = isDebitCreditBalanced && isMathBalanced && isTaxValid;
      const isReady =
        isAccountingValid &&
        hasParty &&
        hasItems &&
        hasVoucherNo &&
        val.errors.length === 0;

      let status: "READY" | "NEEDS_REVIEW" | "INVALID" = "READY";
      if (!isDebitCreditBalanced || !isMathBalanced || val.status === "AMOUNT_MISMATCH" || !hasParty || !hasItems) {
        status = "INVALID";
      } else if (!isReady || val.errors.length > 0 || val.status === "REQUIRES_VALIDATION") {
        status = "NEEDS_REVIEW";
      } else {
        status = "READY";
      }

      return {
        voucher: v,
        validation: val,
        isReady,
        status,
      };
    });

    const readyCount = classified.filter((c) => c.status === "READY").length;
    const needsReviewCount = classified.filter((c) => c.status === "NEEDS_REVIEW").length;
    const invalidCount = classified.filter((c) => c.status === "INVALID").length;

    return {
      classified,
      readyCount,
      needsReviewCount,
      invalidCount,
      totalCount: vouchers.length,
    };
  }

  /**
   * MODE 2 — SEPARATE: Generates one Tally-compatible Excel file per invoice,
   * packaged into a single ZIP archive: Tally_Export_YYYY-MM-DD.zip.
   *
   * Each separate Excel contains ONLY one invoice/voucher.
   * Only includes invoices with STATUS = READY unless includeUnready is explicitly true.
   */
  public static async generateSeparateTallyImportZip(
    invoices: TallyInvoice | TallyInvoice[] | DocumentRecord | DocumentRecord[],
    options?: {
      explicitVoucherType?: "Purchase" | "Sales";
      voucherTypes?: Record<string, "Purchase" | "Sales">;
      profileId?: string;
      includeUnready?: boolean;
    }
  ): Promise<{
    buffer: Uint8Array;
    filename: string;
    exportedCount: number;
    totalCount: number;
    readyCount: number;
    needsReviewCount: number;
    invalidCount: number;
    files: Array<{ filename: string; invoiceNumber: string; grandTotal: number; status: string }>;
  }> {
    const { classified, readyCount, needsReviewCount, invalidCount, totalCount } = this.classifyVouchers(invoices, options);
    const profile = tallyProfileService.getProfileById(options?.profileId || classified[0]?.voucher?.profileId);

    // Filter which invoices to export: only READY unless includeUnready is true
    const toExport = options?.includeUnready
      ? classified
      : classified.filter((c) => c.status === "READY");

    if (toExport.length === 0) {
      throw new Error(
        `No invoices ready for export (Ready: 0, Needs Review: ${needsReviewCount}, Invalid: ${invalidCount}). Enable 'Include unready invoices' to export anyway.`
      );
    }

    const uniqueFilenames = generateUniqueTallyFilenames(toExport.map((x) => x.voucher));
    const zip = new JSZip();
    const fileMetadata: Array<{ filename: string; invoiceNumber: string; grandTotal: number; status: string }> = [];

    toExport.forEach((item, index) => {
      const filename = uniqueFilenames[index];
      // Generate genuine Tally import Excel for this single voucher strictly
      const singleExcel = this.generateTallyImportExcel(item.voucher, {
        explicitVoucherType: item.voucher.voucherType,
        profileId: profile.id,
        includeUnready: true, // Already filtered
      });

      zip.file(filename, singleExcel);
      fileMetadata.push({
        filename,
        invoiceNumber: item.voucher.voucherNumber,
        grandTotal: item.voucher.totals.grandTotal,
        status: item.status,
      });
    });

    const zipBuffer = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const today = new Date().toISOString().split("T")[0];
    const zipFilename = `Tally_Export_${today}.zip`;

    return {
      buffer: zipBuffer,
      filename: zipFilename,
      exportedCount: toExport.length,
      totalCount,
      readyCount,
      needsReviewCount,
      invalidCount,
      files: fileMetadata,
    };
  }

  // -------------------------------------------------------------
  // UNIVERSAL TALLY XML IMPORT (Accepted by all Tally versions)
  // -------------------------------------------------------------
  public static generateTallyUniversalXml(
    invoices: TallyInvoice | TallyInvoice[] | DocumentRecord | DocumentRecord[],
    options?: {
      explicitVoucherType?: "Purchase" | "Sales";
      voucherTypes?: Record<string, "Purchase" | "Sales">;
      profileId?: string;
    }
  ): string {
    const vouchers = this.resolveVouchersList(invoices, options);
    const profile = tallyProfileService.getProfileById(options?.profileId || vouchers[0]?.profileId);

    const escapeXml = (unsafe: string = "") => {
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    };

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<ENVELOPE>\n`;
    xml += `  <HEADER>\n`;
    xml += `    <TALLYREQUEST>Import Data</TALLYREQUEST>\n`;
    xml += `  </HEADER>\n`;
    xml += `  <BODY>\n`;
    xml += `    <IMPORTDATA>\n`;
    xml += `      <REQUESTDESC>\n`;
    xml += `        <REPORTNAME>Vouchers</REPORTNAME>\n`;
    xml += `        <STATICVARIABLES>\n`;
    xml += `          <SVCURRENTCOMPANY>${escapeXml(profile.companyName || "Company")}</SVCURRENTCOMPANY>\n`;
    xml += `        </STATICVARIABLES>\n`;
    xml += `      </REQUESTDESC>\n`;
    xml += `      <REQUESTDATA>\n`;

    vouchers.forEach((v) => {
      const tallyDate = v.voucherDate.split("-").reverse().join(""); // YYYYMMDD
      xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
      xml += `          <VOUCHER VCHTYPE="${escapeXml(v.voucherType)}" ACTION="Create">\n`;
      xml += `            <DATE>${tallyDate}</DATE>\n`;
      xml += `            <VOUCHERTYPENAME>${escapeXml(v.voucherType)}</VOUCHERTYPENAME>\n`;
      xml += `            <VOUCHERNUMBER>${escapeXml(v.voucherNumber)}</VOUCHERNUMBER>\n`;
      xml += `            <REFERENCE>${escapeXml(v.referenceNumber)}</REFERENCE>\n`;
      xml += `            <PARTYLEDGERNAME>${escapeXml(v.party.ledgerName)}</PARTYLEDGERNAME>\n`;
      xml += `            <PARTYNAME>${escapeXml(v.party.name)}</PARTYNAME>\n`;
      xml += `            <PLACEOFSUPPLY>${escapeXml(v.placeOfSupply || "")}</PLACEOFSUPPLY>\n`;
      xml += `            <NARRATION>${escapeXml(v.narration)}</NARRATION>\n`;

      // Ledger entries
      v.ledgerEntries.forEach((entry) => {
        const isDeemedPositive = entry.isDebit ? "Yes" : "No";
        const signedAmount = entry.isDebit ? -Math.abs(entry.amount) : Math.abs(entry.amount);

        xml += `            <ALLLEDGERENTRIES.LIST>\n`;
        xml += `              <LEDGERNAME>${escapeXml(entry.ledgerName)}</LEDGERNAME>\n`;
        xml += `              <ISDEEMEDPOSITIVE>${isDeemedPositive}</ISDEEMEDPOSITIVE>\n`;
        xml += `              <AMOUNT>${signedAmount.toFixed(2)}</AMOUNT>\n`;
        xml += `            </ALLLEDGERENTRIES.LIST>\n`;
      });

      // Inventory entries
      v.inventoryEntries.forEach((it) => {
        const itemSignedAmount = v.voucherType === "Purchase" ? -Math.abs(it.taxableAmount) : Math.abs(it.taxableAmount);

        xml += `            <ALLINVENTORYENTRIES.LIST>\n`;
        xml += `              <STOCKITEMNAME>${escapeXml(it.stockItemName)}</STOCKITEMNAME>\n`;
        xml += `              <RATE>${it.rate.toFixed(2)}/${escapeXml(it.unit)}</RATE>\n`;
        xml += `              <ACTUALQTY>${it.quantity} ${escapeXml(it.unit)}</ACTUALQTY>\n`;
        xml += `              <BILLEDQTY>${it.quantity} ${escapeXml(it.unit)}</BILLEDQTY>\n`;
        xml += `              <AMOUNT>${itemSignedAmount.toFixed(2)}</AMOUNT>\n`;
        xml += `            </ALLINVENTORYENTRIES.LIST>\n`;
      });

      xml += `          </VOUCHER>\n`;
      xml += `        </TALLYMESSAGE>\n`;
    });

    xml += `      </REQUESTDATA>\n`;
    xml += `    </IMPORTDATA>\n`;
    xml += `  </BODY>\n`;
    xml += `</ENVELOPE>\n`;

    return xml;
  }

  /**
   * JSON Export derived strictly from canonical TallyVoucher (Single Source of Truth)
   */
  public static generateTallyJson(
    invoices: TallyInvoice | TallyInvoice[] | DocumentRecord | DocumentRecord[],
    options?: {
      explicitVoucherType?: "Purchase" | "Sales";
      voucherTypes?: Record<string, "Purchase" | "Sales">;
      profileId?: string;
    }
  ): string {
    const vouchers = this.resolveVouchersList(invoices, options);
    const profile = tallyProfileService.getProfileById(options?.profileId || vouchers[0]?.profileId);

    return JSON.stringify(
      {
        totalVouchers: vouchers.length,
        exportedAt: new Date().toISOString(),
        system: "OCR Studio Tally Accounting Engine",
        profile: {
          id: profile.id,
          name: profile.name,
          companyName: profile.companyName,
          companyGstin: profile.companyGstin,
        },
        tallyVouchers: vouchers,
      },
      null,
      2
    );
  }

  /**
   * Backwards compatible bridge
   */
  public static generateTallyExcelWorkbook(
    invoices: TallyInvoice | TallyInvoice[] | DocumentRecord | DocumentRecord[],
    options?: {
      explicitVoucherType?: "Purchase" | "Sales";
      voucherTypes?: Record<string, "Purchase" | "Sales">;
      isImportReady?: boolean;
      profileId?: string;
      includeUnready?: boolean;
    }
  ): Uint8Array {
    return this.generateTallyImportExcel(invoices, options);
  }

  /**
   * Verified Single Invoice Export with TALLY EXPORT CHECK
   */
  public static async exportToTally(
    documentOrId: DocumentRecord | string,
    options?: {
      explicitVoucherType?: "Purchase" | "Sales";
      outputPath?: string;
      customInvoice?: TallyInvoice;
      profileId?: string;
      exportType?: "internal-preview" | "tally-import-excel" | "tally-xml" | "tally-json";
    }
  ): Promise<{
    buffer: Uint8Array;
    filename: string;
    invoiceNumber: string;
    fileSizeKb: number;
    excelRowsWritten: number;
    checkSummary: TallyExportCheckSummary;
  }> {
    const { documentService } = await import("./document.service");
    let doc: DocumentRecord | null = null;

    if (typeof documentOrId === "string") {
      if (documentOrId === "latest" || !documentOrId.trim()) {
        doc = await documentService.getLatestDocument();
      } else {
        doc =
          (await documentService.getDocumentById(documentOrId)) ||
          (await documentService.getDocumentByInvoiceNumber(documentOrId));
      }
    } else {
      doc = documentOrId;
    }

    if (!doc) {
      throw new Error("Export failed: No valid invoice document found.");
    }

    const tallyInvoice =
      options?.customInvoice ||
      this.transformValidatedInvoiceToTally(doc, {
        explicitVoucherType: options?.explicitVoucherType,
        profileId: options?.profileId,
      });

    const validation = this.validateTallyInvoice(tallyInvoice, {
      profileId: options?.profileId,
    });

    const exportType = options?.exportType || "tally-import-excel";

    // If exporting for actual Tally import, strictly enforce missing masters
    if (exportType === "tally-import-excel" || exportType === "tally-xml") {
      if (validation.missingMasters.length > 0) {
        const unmappedList = validation.missingMasters.map((m) => m.reason).join("; ");
        throw new Error(`Export blocked: Required masters are unmapped (${unmappedList}). STATUS = NEEDS MAPPING.`);
      }
      if (!validation.checks.isDebitCreditBalanced) {
        throw new Error("Export blocked: Total Debit does not equal Total Credit.");
      }
    }

    let buffer: Uint8Array;
    let filename: string;
    const cleanInv = tallyInvoice.voucherNumber.replace(/[^a-zA-Z0-9-_]/g, "_") || "INVOICE";

    if (exportType === "internal-preview") {
      buffer = this.generateInternalPreviewExcel(tallyInvoice, {
        explicitVoucherType: options?.explicitVoucherType,
        profileId: options?.profileId,
      });
      filename = `${cleanInv}_Internal_Tally_Preview.xlsx`;
    } else if (exportType === "tally-xml") {
      const xmlStr = this.generateTallyUniversalXml(tallyInvoice, {
        explicitVoucherType: options?.explicitVoucherType,
        profileId: options?.profileId,
      });
      buffer = new TextEncoder().encode(xmlStr);
      filename = `${cleanInv}_TallyPrime_Import.xml`;
    } else {
      buffer = this.generateTallyImportExcel(tallyInvoice, {
        explicitVoucherType: options?.explicitVoucherType,
        profileId: options?.profileId,
      });
      filename = `${cleanInv}_TallyPrime_Import.xlsx`;
    }

    const fileSizeKb = Number((buffer.length / 1024).toFixed(2));
    const checkSummary: TallyExportCheckSummary = {
      invoiceId: doc.id,
      invoiceNumber: tallyInvoice.voucherNumber,
      voucherType: tallyInvoice.voucherType,
      party: tallyInvoice.party.name,
      itemCount: tallyInvoice.inventoryEntries.length,
      taxCount: tallyInvoice.taxLedgers.length,
      grandTotal: tallyInvoice.totals.grandTotal,
      excelRowsGenerated: tallyInvoice.inventoryEntries.length,
      excelFileSizeKb: fileSizeKb,
      status: validation.isValid ? "READY" : "NEEDS_MAPPING",
      message: validation.isValid ? "Tally export ready." : "Requires master mapping.",
    };

    return {
      buffer,
      filename,
      invoiceNumber: tallyInvoice.voucherNumber,
      fileSizeKb,
      excelRowsWritten: tallyInvoice.inventoryEntries.length,
      checkSummary,
    };
  }

  /**
   * Bridge for single-invoice UI inspection
   */
  public static getTallyData(
    doc: DocumentRecord,
    options?: {
      explicitVoucherType?: "Purchase" | "Sales";
      profileId?: string;
    }
  ): {
    invoiceId: string;
    invoiceNumber: string;
    numberOfInvoices: number;
    numberOfItems: number;
    tallyInvoice: TallyInvoice;
    validation: TallyValidationResult;
  } {
    const tallyInvoice = this.transformValidatedInvoiceToTally(doc, {
      explicitVoucherType: options?.explicitVoucherType,
      profileId: options?.profileId,
    });
    const validation = this.validateTallyInvoice(tallyInvoice, {
      profileId: options?.profileId,
    });

    return {
      invoiceId: doc.id,
      invoiceNumber: tallyInvoice.voucherNumber,
      numberOfInvoices: 1,
      numberOfItems: tallyInvoice.inventoryEntries.length,
      tallyInvoice,
      validation,
    };
  }
}

export const tallyExportService = new TallyExportService();
