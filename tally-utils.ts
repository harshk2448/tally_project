import { ExtractedInvoice, DocumentRecord, InvoiceLineItem } from "@/types/document";
import {
  TallyInvoice,
  TallyVoucher,
  TallyItem,
  TallyTax,
  TallyVoucherType,
  TallyValidationResult,
  MissingMasterInfo,
  TallyLedgerEntry,
  TallyInventoryEntry,
  TallyParty,
  TallyTaxBreakdown,
  TallyAccountingBalance,
  TallyVoucherStatus,
  TallyProfile,
  TallyImportRow,
} from "@/types/tally";
import { determinePlaceOfSupply, getStateFromGstin, GST_STATE_CODES } from "./gst-state-codes";
import { DEFAULT_ABC_COMPANY_PROFILE } from "@/lib/tally-defaults";
import { tallyMappingService } from "@/services/tally-mapping.service";

export const DEFAULT_UNIT_MAPPINGS: Record<string, string> = {
  PCS: "PCS",
  PC: "PCS",
  PIECES: "PCS",
  UNT: "NOS",
  UNIT: "NOS",
  UNITS: "NOS",
  PKG: "BOX",
  PACK: "BOX",
  KG: "KGS",
  KGM: "KGS",
  MTR: "MTR",
  METER: "MTR",
  SET: "SET",
  NOS: "NOS",
  BOX: "BOX",
  BAG: "BAG",
  LTR: "LTR",
};

/**
 * Converts any parseable date string into TallyPrime's DD-MM-YYYY format.
 */
export function formatTallyDate(rawDate?: string | null): string {
  if (!rawDate || !rawDate.trim()) return "";
  const clean = rawDate.trim();

  // Already DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(clean)) return clean;

  // ISO YYYY-MM-DD
  const isoMatch = clean.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, "0");
    const day = isoMatch[3].padStart(2, "0");
    return `${day}-${month}-${year}`;
  }

  // DD/MM/YYYY or DD.MM.YYYY
  const ddmmyyyy = clean.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, "0");
    const month = ddmmyyyy[2].padStart(2, "0");
    const year = ddmmyyyy[3];
    return `${day}-${month}-${year}`;
  }

  // Fallback Date parser
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    const day = String(parsed.getDate()).padStart(2, "0");
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const year = parsed.getFullYear();
    return `${day}-${month}-${year}`;
  }

  return clean;
}

/**
 * Formats date strictly for the final Tally Excel format (e.g. 23-Jul-2025 or 04-Jun-2026).
 * Never uses current date or upload date. Leaves blank if missing.
 */
export function formatTallyExcelDate(rawDate?: string | null): string {
  if (!rawDate || !rawDate.trim()) return "";
  const trimmed = rawDate.trim();

  // If already in DD-Mon-YYYY or DD-Mon-YY (e.g. 23-Jul-2025 or 04-Jun-26)
  if (/^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/.test(trimmed)) {
    return trimmed;
  }

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ISO format: YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = String(parseInt(isoMatch[3], 10)).padStart(2, "0");
    if (month >= 0 && month < 12) {
      return `${day}-${months[month]}-${year}`;
    }
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const day = String(parseInt(dmyMatch[1], 10)).padStart(2, "0");
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = dmyMatch[3];
    if (month >= 0 && month < 12) {
      return `${day}-${months[month]}-${year}`;
    }
  }

  // Fallback: parse Date
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, "0");
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  return trimmed;
}

/**
 * Normalizes state name to proper Indian state name (e.g. Haryana, Gujarat, Maharashtra).
 */
export function normalizeStateName(stateOrGstin?: string | null): string {
  if (!stateOrGstin || !stateOrGstin.trim()) return "";
  const trimmed = stateOrGstin.trim();

  // If GSTIN (15 chars) or 2-digit code
  if (trimmed.length >= 2 && /^\d{2}/.test(trimmed)) {
    const code = trimmed.substring(0, 2);
    if (GST_STATE_CODES[code]) {
      return GST_STATE_CODES[code];
    }
  }

  // If contains "24-Gujarat" or "06-Haryana"
  const hyphenMatch = trimmed.match(/^\d{1,2}\s*-\s*(.+)$/);
  if (hyphenMatch) {
    return hyphenMatch[1].trim();
  }

  // Check case-insensitive match in GST_STATE_CODES
  const lower = trimmed.toLowerCase();
  for (const name of Object.values(GST_STATE_CODES)) {
    if (name.toLowerCase() === lower) {
      return name;
    }
  }

  return trimmed;
}

export function resolveUnit(rawUnit?: string): string {
  if (!rawUnit || !rawUnit.trim()) return "NOS";
  const clean = rawUnit.trim().toUpperCase();
  return DEFAULT_UNIT_MAPPINGS[clean] || clean;
}

export function resolveTaxLedgerName(
  voucherType: "Purchase" | "Sales",
  taxType: "CGST" | "SGST" | "IGST",
  rate: number,
  customMappings?: Record<string, string>
): string {
  const key = `${voucherType.toUpperCase()}_${taxType}_${rate}`;
  if (customMappings && customMappings[key]) return customMappings[key];

  const prefix = voucherType === "Purchase" ? "Input" : "Output";
  return rate > 0 ? `${prefix} ${taxType} @ ${rate}%` : `${prefix} ${taxType}`;
}

/**
 * Step 4: Purchase vs Sales Resolution
 * Determines transaction type from invoice context and active profile company identity.
 */
export function determineVoucherType(
  docOrInvoice: DocumentRecord | ExtractedInvoice,
  explicitUserType?: "Purchase" | "Sales" | "REQUIRES_VALIDATION",
  companyConfig?: { companyGstin?: string; companyName?: string }
): { voucherType: TallyVoucherType; isConfident: boolean; reason: string } {
  if (explicitUserType === "Purchase" || explicitUserType === "Sales") {
    return {
      voucherType: explicitUserType,
      isConfident: true,
      reason: "User explicitly confirmed Voucher Type",
    };
  }

  const docMeta = (docOrInvoice as DocumentRecord).metadata?.tallyVoucherType as
    | "Purchase"
    | "Sales"
    | undefined;
  if (docMeta === "Purchase" || docMeta === "Sales") {
    return {
      voucherType: docMeta,
      isConfident: true,
      reason: "Pre-saved document voucher type",
    };
  }

  const data: ExtractedInvoice =
    (docOrInvoice as DocumentRecord).aiResult?.cleanedData ||
    (docOrInvoice as ExtractedInvoice);

  const vendorGstin = (data?.vendorGstin || "").trim().toUpperCase();
  const customerGstin = (data?.customerGstin || "").trim().toUpperCase();
  const vendorName = (data?.vendorName || "").trim().toLowerCase();
  const customerName = (data?.customerName || "").trim().toLowerCase();
  const rawText = (
    ((docOrInvoice as DocumentRecord).ocrResult?.rawText || "") +
    " " +
    ((docOrInvoice as DocumentRecord).fileName || "")
  ).toLowerCase();

  // Company Profile Match
  const companyGstin = (companyConfig?.companyGstin || DEFAULT_ABC_COMPANY_PROFILE.companyGstin || "").trim().toUpperCase();
  const companyName = (companyConfig?.companyName || DEFAULT_ABC_COMPANY_PROFILE.companyName || "").trim().toLowerCase();

  if (companyGstin) {
    if (customerGstin && customerGstin === companyGstin) {
      return {
        voucherType: "Purchase",
        isConfident: true,
        reason: `Document billed to configured company GSTIN (${companyGstin})`,
      };
    }
    if (vendorGstin && vendorGstin === companyGstin) {
      return {
        voucherType: "Sales",
        isConfident: true,
        reason: `Document issued by configured company GSTIN (${companyGstin})`,
      };
    }
  }

  if (companyName && companyName.length > 3) {
    if (customerName && customerName.includes(companyName)) {
      return {
        voucherType: "Purchase",
        isConfident: true,
        reason: `Document billed to company name (${companyName})`,
      };
    }
    if (vendorName && vendorName.includes(companyName)) {
      return {
        voucherType: "Sales",
        isConfident: true,
        reason: `Document issued by company name (${companyName})`,
      };
    }
  }

  const docType = (docOrInvoice as DocumentRecord).documentType || "";
  if (
    docType === "Purchase Order" ||
    rawText.includes("purchase invoice") ||
    rawText.includes("vendor bill") ||
    rawText.includes("inward supply")
  ) {
    return {
      voucherType: "Purchase",
      isConfident: true,
      reason: "Document context explicitly identifies Purchase/Inward supply",
    };
  }

  if (
    rawText.includes("sales invoice") ||
    rawText.includes("sales bill") ||
    rawText.includes("outward supply")
  ) {
    return {
      voucherType: "Sales",
      isConfident: true,
      reason: "Document context explicitly identifies Sales/Outward supply",
    };
  }

  // If vendor present without customer, typically an inward vendor bill
  if (vendorName && !customerName) {
    return {
      voucherType: "Purchase",
      isConfident: true,
      reason: "Document contains vendor details (Inward Purchase)",
    };
  }

  if (customerName && !vendorName) {
    return {
      voucherType: "Sales",
      isConfident: true,
      reason: "Document contains customer details (Outward Sales)",
    };
  }

  return {
    voucherType: "REQUIRES_VALIDATION",
    isConfident: false,
    reason: "Unable to reliably determine Purchase vs Sales. Please select explicitly.",
  };
}

/**
 * Steps 4, 7, 8, 12: Pure Accounting Transformation Layer
 * Single Source of Truth: Converts validated invoice into canonical TallyInvoice / TallyVoucher.
 * - Enforces exact double-entry debits and credits from active Tally Profile.
 * - Strictly keeps Line Item Total separate from Voucher Grand Total (Fixes Step 8 Bug).
 */
export function transformValidatedInvoiceToTally(
  docOrInvoice: DocumentRecord | ExtractedInvoice | TallyInvoice,
  optionsOrVoucherType?:
    | "Purchase"
    | "Sales"
    | {
        explicitVoucherType?: "Purchase" | "Sales";
        voucherId?: string;
        customLedgerName?: string;
        profileId?: string;
        profile?: TallyProfile;
        companyConfig?: { companyGstin?: string; companyName?: string };
        autoMapUnmappedItems?: boolean;
        masterMappings?: {
          partyMappings?: Record<string, string>;
          stockItemMappings?: Record<string, string>;
          taxLedgerMappings?: Record<string, string>;
        };
      },
  optionalVoucherId?: string
): TallyInvoice {
  const options =
    typeof optionsOrVoucherType === "string"
      ? { explicitVoucherType: optionsOrVoucherType, voucherId: optionalVoucherId }
      : optionsOrVoucherType;

  // Resolve Profile
  const profile: TallyProfile = options?.profile || DEFAULT_ABC_COMPANY_PROFILE;

  // Step 1: Single Source of Truth - Robust extraction from AI Cleaned or OCR Structured data
  let data: ExtractedInvoice;
  if ("aiResult" in docOrInvoice && docOrInvoice.aiResult?.cleanedData) {
    const clean = docOrInvoice.aiResult.cleanedData;
    const ocr = (docOrInvoice as DocumentRecord).ocrResult?.structuredData;
    data = {
      vendorName: (clean.vendorName || ocr?.vendorName || "").trim(),
      vendorGstin: (clean.vendorGstin || ocr?.vendorGstin || "").trim(),
      vendorPan: clean.vendorPan || ocr?.vendorPan,
      vendorEmail: clean.vendorEmail || ocr?.vendorEmail,
      vendorPhone: clean.vendorPhone || ocr?.vendorPhone,
      vendorAddress: clean.vendorAddress || ocr?.vendorAddress,
      customerName: (clean.customerName || ocr?.customerName || "").trim(),
      customerGstin: (clean.customerGstin || ocr?.customerGstin || "").trim(),
      customerAddress: clean.customerAddress || ocr?.customerAddress,
      invoiceNumber: (clean.invoiceNumber || ocr?.invoiceNumber || "").trim(),
      invoiceDate: (clean.invoiceDate || ocr?.invoiceDate || "").trim(),
      dueDate: (clean.dueDate || ocr?.dueDate || "").trim(),
      poNumber: (clean.poNumber || ocr?.poNumber || "").trim(),
      currency: clean.currency || ocr?.currency || "INR",
      items: (clean.items && clean.items.length > 0 ? clean.items : ocr?.items) || [],
      subTotal: Number(clean.subTotal !== undefined ? clean.subTotal : ocr?.subTotal ?? 0),
      cgstTotal: Number(clean.cgstTotal !== undefined ? clean.cgstTotal : ocr?.cgstTotal ?? 0),
      sgstTotal: Number(clean.sgstTotal !== undefined ? clean.sgstTotal : ocr?.sgstTotal ?? 0),
      igstTotal: Number(clean.igstTotal !== undefined ? clean.igstTotal : ocr?.igstTotal ?? 0),
      totalTax: Number(clean.totalTax !== undefined ? clean.totalTax : ocr?.totalTax ?? 0),
      grandTotal: Number(clean.grandTotal !== undefined ? clean.grandTotal : ocr?.grandTotal ?? 0),
      notes: clean.notes || ocr?.notes || "",
      deliveryNote: clean.deliveryNote || (clean as any).dispatchNote || ocr?.deliveryNote || (ocr as any)?.dispatchNote || "",
      deliveryNo: clean.deliveryNo || (clean as any).challanNo || ocr?.deliveryNo || (ocr as any)?.challanNo || "",
    };
  } else if ("ocrResult" in docOrInvoice && (docOrInvoice as DocumentRecord).ocrResult?.structuredData) {
    data = { ...(docOrInvoice as DocumentRecord).ocrResult!.structuredData! };
  } else if ("inventoryEntries" in docOrInvoice && "party" in docOrInvoice) {
    const inv = docOrInvoice as TallyInvoice;
    data = {
      invoiceNumber: inv.voucherNumber,
      invoiceDate: inv.voucherDate,
      currency: "INR",
      vendorName: inv.party.name,
      customerName: inv.party.name,
      vendorGstin: inv.party.gstin,
      customerGstin: inv.party.gstin,
      subTotal: inv.totals.taxableAmount,
      cgstTotal: inv.tax.cgstAmount,
      sgstTotal: inv.tax.sgstAmount,
      igstTotal: inv.tax.igstAmount,
      totalTax: inv.totals.taxAmount,
      grandTotal: inv.totals.grandTotal,
      items: inv.inventoryEntries.map((it, idx) => ({
        id: `item_${idx + 1}`,
        description: it.itemName,
        qty: it.quantity,
        rate: it.rate,
        discount: it.discount || 0,
        taxableAmount: it.taxableAmount,
        gstRate: it.gstRate,
        cgst: it.cgst,
        sgst: it.sgst,
        igst: it.igst,
        total: it.total,
        unit: it.unit,
        hsn: it.hsnSac,
      })),
    };
  } else if ((docOrInvoice as any).cleanedData) {
    data = { ...(docOrInvoice as any).cleanedData };
  } else {
    data = { ...(docOrInvoice as ExtractedInvoice) };
  }

  const typeResolution = determineVoucherType(
    data,
    options?.explicitVoucherType,
    {
      companyGstin: options?.companyConfig?.companyGstin || profile.companyGstin,
      companyName: options?.companyConfig?.companyName || profile.companyName,
    }
  );
  const voucherType = typeResolution.voucherType === "REQUIRES_VALIDATION" ? "Purchase" : typeResolution.voucherType;
  const isSales = voucherType === "Sales";

  const voucherId = options?.voucherId || "V001";
  const voucherNumber = (data.invoiceNumber || "").trim();

  // Step 2: Fix Date Mapping - Strictly use extracted invoiceDate, NEVER fallback to today's date or uploadedAt
  const rawDate = (data.invoiceDate || "").trim();
  const voucherDate = rawDate ? formatTallyDate(rawDate) : "";

  // Step 3 & 4: Party Ledger Resolution via Profile - NEVER use "Unassigned Vendor" placeholder
  const rawPartyName = (
    isSales
      ? data.customerName || data.vendorName || ""
      : data.vendorName || data.customerName || ""
  ).trim();

  const partyGSTIN = (
    isSales
      ? data.customerGstin || data.vendorGstin || ""
      : data.vendorGstin || data.customerGstin || ""
  ).trim().toUpperCase();

  const partyResolution = tallyMappingService.resolvePartyLedger(rawPartyName, profile);
  // If mapped in profile use mapped ledger name; if unmapped use exact raw party name (never placeholder)
  const partyLedgerName = partyResolution.isMapped ? partyResolution.ledgerName : (rawPartyName || "");

  // Place of Supply & State derivation
  const posResolution = determinePlaceOfSupply({
    supplierGstin: isSales
      ? profile.companyGstin || data.vendorGstin
      : data.vendorGstin || partyGSTIN,
    customerGstin: isSales
      ? partyGSTIN || data.customerGstin
      : profile.companyGstin || data.customerGstin,
    companyGstin: profile.companyGstin,
    explicitPos: (data as any).placeOfSupply || null,
    isSales,
  });

  const partyStateInfo = getStateFromGstin(partyGSTIN);
  const party: TallyParty = {
    name: rawPartyName,
    ledgerName: partyLedgerName,
    gstin: partyGSTIN,
    pan: data.vendorPan || (partyGSTIN.length >= 12 ? partyGSTIN.substring(2, 12) : undefined),
    state: partyStateInfo.state || (isSales ? posResolution.customerState : posResolution.supplierState),
    stateCode: partyStateInfo.stateCode || (isSales ? posResolution.customerStateCode : posResolution.supplierStateCode),
    placeOfSupply: posResolution.placeOfSupply,
    supplyType: posResolution.supplyType,
    isMapped: partyResolution.isMapped || Boolean(options?.autoMapUnmappedItems),
  };

  // Step 4: Purchase / Sales Ledger mapping from Profile
  const defaultLedger = isSales ? profile.ledgers.salesLedger : profile.ledgers.purchaseLedger;
  const purchaseOrSalesLedger = options?.customLedgerName || defaultLedger || (isSales ? "Sales Accounts" : "Purchase Accounts");

  const poNumber = (data.poNumber || "").trim();
  const dueDate = data.dueDate ? formatTallyDate(data.dueDate) : voucherDate;
  const paymentTerms =
    (data as any).paymentTerms ||
    ((docOrInvoice as DocumentRecord).metadata?.paymentTerms as string) ||
    (data.notes || "").trim() ||
    "Due on receipt";

  const deliveryNote = (
    data.deliveryNote ||
    data.dispatchNote ||
    (docOrInvoice as any).metadata?.deliveryNote ||
    ""
  ).trim();

  const deliveryNo = (
    data.deliveryNo ||
    data.challanNo ||
    (docOrInvoice as any).metadata?.deliveryNo ||
    ""
  ).trim();

  const narration = `Being ${voucherType} ${
    isSales ? "to" : "from"
  } ${partyLedgerName || rawPartyName || "Party"} vide Inv No ${voucherNumber || "N/A"}${voucherDate ? ` dt ${voucherDate}` : ""}${
    poNumber ? `, PO: ${poNumber}` : ""
  }`.trim();

  // Step 8: Strict Tax Regime Segregation & Line Items with Item Total
  // Rule: NEVER combine CGST + SGST + IGST for the same tax base unless the original invoice explicitly contains all of them.
  // If an invoice has IGST only: CGST = 0, SGST = 0, IGST = actual IGST.
  // If an invoice has CGST + SGST: IGST = 0.
  const rawCgstTotal = Number(data.cgstTotal) || 0;
  const rawSgstTotal = Number(data.sgstTotal) || 0;
  const rawIgstTotal = Number(data.igstTotal) || 0;
  const expectedTax = Number(data.totalTax) || Math.max(0, Number(data.grandTotal) - Number(data.subTotal));

  const rawItems = data.items && data.items.length > 0 ? data.items : [];
  const itemsHaveCgst = rawItems.some((it: any) => (Number(it.cgst ?? it.cgstAmount) || 0) > 0);
  const itemsHaveSgst = rawItems.some((it: any) => (Number(it.sgst ?? it.sgstAmount) || 0) > 0);
  const itemsHaveIgst = rawItems.some((it: any) => (Number(it.igst ?? it.igstAmount) || 0) > 0);

  const hasCgstSgst = rawCgstTotal > 0 || rawSgstTotal > 0 || itemsHaveCgst || itemsHaveSgst;
  const hasIgst = rawIgstTotal > 0 || itemsHaveIgst;

  // Resolve Tax Regime: Under Indian GST, a supply is EITHER Interstate (IGST) OR Intrastate (CGST+SGST).
  // Never blend or combine CGST + SGST + IGST for the same tax base.
  let taxRegime: "IGST_ONLY" | "CGST_SGST_ONLY";
  if (hasIgst && !hasCgstSgst) {
    taxRegime = "IGST_ONLY";
  } else if (hasCgstSgst && !hasIgst) {
    taxRegime = "CGST_SGST_ONLY";
  } else if (party.supplyType === "Interstate") {
    // Interstate supply legally and strictly mandates IGST only
    taxRegime = "IGST_ONLY";
  } else if (party.supplyType === "Intrastate") {
    // Intrastate supply legally and strictly mandates CGST + SGST only
    taxRegime = "CGST_SGST_ONLY";
  } else {
    // Fallback if supplyType is undetermined: Compare extracted taxes with invoice totalTax
    const cgstSgstSum = rawCgstTotal + rawSgstTotal;
    if (expectedTax > 0 && Math.abs(expectedTax - cgstSgstSum) <= 0.05 && Math.abs(expectedTax - rawIgstTotal) > 0.05) {
      taxRegime = "CGST_SGST_ONLY";
    } else if (expectedTax > 0 && Math.abs(expectedTax - rawIgstTotal) <= 0.05 && Math.abs(expectedTax - cgstSgstSum) > 0.05) {
      taxRegime = "IGST_ONLY";
    } else {
      taxRegime = hasIgst ? "IGST_ONLY" : "CGST_SGST_ONLY";
    }
  }

  const inventoryEntries: TallyInventoryEntry[] = [];
  const items: TallyItem[] = [];

  if (rawItems.length > 0) {
    for (const it of rawItems) {
      const itAny = it as any;
      const qty = Number(it.qty ?? itAny.quantity) || 1;
      const rate = Number(it.rate ?? itAny.unitPrice ?? itAny.price) || 0;
      const discount = Number(it.discount) || 0;
      const taxableAmount =
        Number(itAny.taxableAmount) ||
        (rate > 0 ? Math.max(0, qty * rate - discount) : 0);
      const rawItemName = (itAny.itemName || it.description || "General Goods / Services").trim();
      const rawDesc = (it.description || itAny.itemName || "General Goods / Services").trim();

      const itemResolution = tallyMappingService.resolveStockItem(rawItemName, profile);
      const stockItemName = itemResolution.stockItemName;
      const unitResolution = tallyMappingService.resolveUnit(itAny.unit || itAny.uom, profile);

      const hsnSac = (it.hsn || itAny.hsnSac || itAny.hsnCode || "").trim();

      let itemCgst = Number(it.cgst ?? itAny.cgstAmount) || 0;
      let itemSgst = Number(it.sgst ?? itAny.sgstAmount) || 0;
      let itemIgst = Number(it.igst ?? itAny.igstAmount) || 0;
      let gstRate = Number(it.gstRate ?? itAny.taxRate) || 0;
      let cgstRate = Number(itAny.cgstRate) || 0;
      let sgstRate = Number(itAny.sgstRate) || 0;
      let igstRate = Number(itAny.igstRate) || 0;

      if (cgstRate > 0 && sgstRate > 0 && gstRate === 0) {
        gstRate = cgstRate + sgstRate;
      } else if (igstRate > 0 && gstRate === 0) {
        gstRate = igstRate;
      }

      // Enforce tax regime strictly on line item level
      if (taxRegime === "IGST_ONLY") {
        itemCgst = 0;
        itemSgst = 0;
        cgstRate = 0;
        sgstRate = 0;
        if (itemIgst === 0 && gstRate > 0) {
          itemIgst = Number(((taxableAmount * gstRate) / 100).toFixed(2));
          igstRate = gstRate;
        } else if (itemIgst === 0 && rawIgstTotal > 0 && Number(data.subTotal) > 0) {
          const ratio = taxableAmount / Number(data.subTotal);
          itemIgst = Number((rawIgstTotal * ratio).toFixed(2));
          igstRate = taxableAmount > 0 ? Number(((itemIgst / taxableAmount) * 100).toFixed(1)) : 18;
        } else if (itemIgst > 0 && igstRate === 0 && taxableAmount > 0) {
          igstRate = Number(((itemIgst / taxableAmount) * 100).toFixed(1));
        }
      } else if (taxRegime === "CGST_SGST_ONLY") {
        itemIgst = 0;
        igstRate = 0;
        if (itemCgst === 0 && itemSgst === 0 && gstRate > 0) {
          const halfRate = gstRate / 2;
          itemCgst = Number(((taxableAmount * halfRate) / 100).toFixed(2));
          itemSgst = Number(((taxableAmount * halfRate) / 100).toFixed(2));
          cgstRate = halfRate;
          sgstRate = halfRate;
        } else if (itemCgst === 0 && itemSgst === 0 && (rawCgstTotal > 0 || rawSgstTotal > 0) && Number(data.subTotal) > 0) {
          const ratio = taxableAmount / Number(data.subTotal);
          itemCgst = Number((rawCgstTotal * ratio).toFixed(2));
          itemSgst = Number((rawSgstTotal * ratio).toFixed(2));
          cgstRate = taxableAmount > 0 ? Number(((itemCgst / taxableAmount) * 100).toFixed(1)) : 9;
          sgstRate = taxableAmount > 0 ? Number(((itemSgst / taxableAmount) * 100).toFixed(1)) : 9;
        } else if (itemCgst > 0 && cgstRate === 0 && taxableAmount > 0) {
          cgstRate = Number(((itemCgst / taxableAmount) * 100).toFixed(1));
          sgstRate = Number(((itemSgst / taxableAmount) * 100).toFixed(1));
        }
      }

      const itemTax = Number((itemCgst + itemSgst + itemIgst).toFixed(2));
      // Step 8: Strictly Item Total = Taxable + Item Tax (NEVER Voucher Grand Total!)
      const itemTotal = Number((taxableAmount + itemTax).toFixed(2));

      const entry: TallyInventoryEntry = {
        itemName: rawItemName,
        description: rawDesc,
        stockItemName,
        hsnSac,
        quantity: qty,
        unit: unitResolution.unit,
        rate: rate || (qty > 0 ? Number((taxableAmount / qty).toFixed(2)) : taxableAmount),
        discount,
        taxableAmount: Number(taxableAmount.toFixed(2)),
        gstRate: gstRate || (cgstRate + sgstRate + igstRate),
        cgstRate,
        cgst: Number(itemCgst.toFixed(2)),
        sgstRate,
        sgst: Number(itemSgst.toFixed(2)),
        igstRate,
        igst: Number(itemIgst.toFixed(2)),
        total: itemTotal, // Strictly Item Total
        isMapped: itemResolution.isMapped || Boolean(options?.autoMapUnmappedItems),
      };

      inventoryEntries.push(entry);
      items.push({
        itemName: stockItemName,
        hsnSac,
        quantity: qty,
        unit: unitResolution.unit,
        rate,
        amount: Number(taxableAmount.toFixed(2)),
        cgst: Number(itemCgst.toFixed(2)),
        sgst: Number(itemSgst.toFixed(2)),
        igst: Number(itemIgst.toFixed(2)),
        totalTax: Number(itemTax.toFixed(2)),
        total: itemTotal, // Strictly Item Total
        isMapped: itemResolution.isMapped || Boolean(options?.autoMapUnmappedItems),
      });
    }
  } else {
    // Lump-sum / single-line fallback
    const subtotal = Number(data.subTotal) || 0;
    let cgst = Number(data.cgstTotal) || 0;
    let sgst = Number(data.sgstTotal) || 0;
    let igst = Number(data.igstTotal) || 0;

    if (taxRegime === "IGST_ONLY") {
      cgst = 0;
      sgst = 0;
      if (igst === 0 && Number(data.totalTax) > 0) igst = Number(data.totalTax);
    } else if (taxRegime === "CGST_SGST_ONLY") {
      igst = 0;
      if (cgst === 0 && sgst === 0 && Number(data.totalTax) > 0) {
        cgst = Number((Number(data.totalTax) / 2).toFixed(2));
        sgst = Number((Number(data.totalTax) / 2).toFixed(2));
      }
    }

    const totalTax = Number((cgst + sgst + igst).toFixed(2));
    const grandTotal = Number(data.grandTotal) || (subtotal + totalTax);

    const gstRate = subtotal > 0 ? Number(((totalTax / subtotal) * 100).toFixed(1)) : 18;
    const cgstRate = cgst > 0 && subtotal > 0 ? Number(((cgst / subtotal) * 100).toFixed(1)) : (taxRegime === "IGST_ONLY" ? 0 : 9);
    const sgstRate = sgst > 0 && subtotal > 0 ? Number(((sgst / subtotal) * 100).toFixed(1)) : (taxRegime === "IGST_ONLY" ? 0 : 9);
    const igstRate = igst > 0 && subtotal > 0 ? Number(((igst / subtotal) * 100).toFixed(1)) : (taxRegime === "IGST_ONLY" ? 18 : 0);

    const desc = "General Supplies / Services";
    const itemRes = tallyMappingService.resolveStockItem(desc, profile);

    const entry: TallyInventoryEntry = {
      itemName: desc,
      description: desc,
      stockItemName: itemRes.stockItemName,
      hsnSac: "",
      quantity: 1,
      unit: "NOS",
      rate: subtotal,
      taxableAmount: Number(subtotal.toFixed(2)),
      gstRate,
      cgstRate,
      cgst: Number(cgst.toFixed(2)),
      sgstRate,
      sgst: Number(sgst.toFixed(2)),
      igstRate,
      igst: Number(igst.toFixed(2)),
      total: Number(grandTotal.toFixed(2)),
      isMapped: itemRes.isMapped || Boolean(options?.autoMapUnmappedItems),
    };

    inventoryEntries.push(entry);
    items.push({
      itemName: itemRes.stockItemName,
      hsnSac: "",
      quantity: 1,
      unit: "NOS",
      rate: subtotal,
      amount: Number(subtotal.toFixed(2)),
      cgst: Number(cgst.toFixed(2)),
      sgst: Number(sgst.toFixed(2)),
      igst: Number(igst.toFixed(2)),
      totalTax: Number(totalTax.toFixed(2)),
      total: Number(grandTotal.toFixed(2)),
      isMapped: itemRes.isMapped || Boolean(options?.autoMapUnmappedItems),
    });
  }

  // Calculate Voucher Totals
  const taxableSubtotal = Number(
    inventoryEntries.reduce((sum, it) => sum + it.taxableAmount, 0).toFixed(2)
  ) || Number(data.subTotal) || 0;

  let cgstTotal = Number(
    inventoryEntries.reduce((sum, it) => sum + it.cgst, 0).toFixed(2)
  );
  let sgstTotal = Number(
    inventoryEntries.reduce((sum, it) => sum + it.sgst, 0).toFixed(2)
  );
  let igstTotal = Number(
    inventoryEntries.reduce((sum, it) => sum + it.igst, 0).toFixed(2)
  );

  if (taxRegime === "IGST_ONLY") {
    cgstTotal = 0;
    sgstTotal = 0;
    if (igstTotal === 0 && rawIgstTotal > 0) igstTotal = rawIgstTotal;
    else if (igstTotal === 0 && Number(data.totalTax) > 0) igstTotal = Number(data.totalTax);
  } else if (taxRegime === "CGST_SGST_ONLY") {
    igstTotal = 0;
    if (cgstTotal === 0 && rawCgstTotal > 0) cgstTotal = rawCgstTotal;
    if (sgstTotal === 0 && rawSgstTotal > 0) sgstTotal = rawSgstTotal;
    if (cgstTotal === 0 && sgstTotal === 0 && Number(data.totalTax) > 0) {
      cgstTotal = Number((Number(data.totalTax) / 2).toFixed(2));
      sgstTotal = Number((Number(data.totalTax) / 2).toFixed(2));
    }
  }

  const totalTax = Number((cgstTotal + sgstTotal + igstTotal).toFixed(2));
  const calculatedGrandTotal = Number((taxableSubtotal + totalTax).toFixed(2));
  const printedGrandTotal = Number(data.grandTotal) || calculatedGrandTotal;

  // Genuine Round Off Evaluation
  // Rule: Do not use Round Off to hide tax/accounting calculation errors.
  // Round Off must only represent a genuine rounding difference from the invoice.
  const rawDiff = Number((printedGrandTotal - calculatedGrandTotal).toFixed(2));
  const absDiff = Math.abs(rawDiff);

  const explicitRoundOff = Number(
    (data as any).roundOff ?? (data as any).roundOffAmount ?? (data as any).round_off ?? (data as any).rounding
  );
  const hasExplicitRoundOff = !isNaN(explicitRoundOff) && Math.abs(explicitRoundOff) > 0.001;

  let roundOffDiff = 0;
  let hasMathDiscrepancy = false;
  let discrepancy = 0;

  if (hasExplicitRoundOff) {
    roundOffDiff = explicitRoundOff;
    const expectedTotal = Number((calculatedGrandTotal + roundOffDiff).toFixed(2));
    const remDiff = Math.abs(expectedTotal - printedGrandTotal);
    if (remDiff > 0.05) {
      hasMathDiscrepancy = true;
      discrepancy = remDiff;
    }
  } else if (absDiff <= 1.00 && absDiff > 0.001) {
    // Genuine fractional paise rounding difference (e.g. +0.20, -0.40)
    roundOffDiff = rawDiff;
    discrepancy = 0;
  } else if (absDiff > 1.00) {
    // THIS IS NOT ROUND OFF! It is an accounting calculation error or amount mismatch.
    // Do NOT create a fake round off to force balance.
    roundOffDiff = 0;
    hasMathDiscrepancy = true;
    discrepancy = absDiff;
  }

  const isTotalMatched = !hasMathDiscrepancy && discrepancy <= 0.05;
  const finalGrandTotal = printedGrandTotal;

  // Derive tax breakdown
  const overallCgstRate = taxableSubtotal > 0 && cgstTotal > 0
    ? Number(((cgstTotal / taxableSubtotal) * 100).toFixed(1))
    : (taxRegime === "IGST_ONLY" ? 0 : 9);

  const overallSgstRate = taxableSubtotal > 0 && sgstTotal > 0
    ? Number(((sgstTotal / taxableSubtotal) * 100).toFixed(1))
    : (taxRegime === "IGST_ONLY" ? 0 : 9);

  const overallIgstRate = taxableSubtotal > 0 && igstTotal > 0
    ? Number(((igstTotal / taxableSubtotal) * 100).toFixed(1))
    : (taxRegime === "IGST_ONLY" ? 18 : 0);

  const tax: TallyTaxBreakdown = {
    taxableAmount: taxableSubtotal,
    cgstRate: overallCgstRate,
    cgstAmount: cgstTotal,
    sgstRate: overallSgstRate,
    sgstAmount: sgstTotal,
    igstRate: overallIgstRate,
    igstAmount: igstTotal,
    totalTax,
  };

  // Build Tax Ledgers from Profile
  const taxLedgers: TallyTax[] = [];
  const effectiveVoucherTypeForTax = isSales ? "Sales" : "Purchase";

  if (cgstTotal > 0) {
    const res = tallyMappingService.resolveTaxLedger(effectiveVoucherTypeForTax, "CGST", overallCgstRate, profile);
    taxLedgers.push({
      ledgerName: res.ledgerName,
      taxType: "CGST",
      rate: overallCgstRate,
      amount: cgstTotal,
      isMapped: res.isMapped,
    });
  }

  if (sgstTotal > 0) {
    const res = tallyMappingService.resolveTaxLedger(effectiveVoucherTypeForTax, "SGST", overallSgstRate, profile);
    taxLedgers.push({
      ledgerName: res.ledgerName,
      taxType: "SGST",
      rate: overallSgstRate,
      amount: sgstTotal,
      isMapped: res.isMapped,
    });
  }

  if (igstTotal > 0) {
    const res = tallyMappingService.resolveTaxLedger(effectiveVoucherTypeForTax, "IGST", overallIgstRate, profile);
    taxLedgers.push({
      ledgerName: res.ledgerName,
      taxType: "IGST",
      rate: overallIgstRate,
      amount: igstTotal,
      isMapped: res.isMapped,
    });
  }

  // Step 7: Build Double-Entry Ledger Entries (Debits & Credits)
  const ledgerEntries: TallyLedgerEntry[] = [];
  const roundOffLedger = profile.ledgers.roundOffLedger || "Round Off";

  if (!isSales) {
    // PURCHASE VOUCHER:
    // Debit: Purchase Accounts (Taxable Subtotal)
    // Debit: Input CGST, Input SGST, Input IGST
    // Debit / Credit: Round Off (if any)
    // Credit: Supplier / Party Ledger (Grand Total)
    ledgerEntries.push({
      ledgerName: purchaseOrSalesLedger,
      amount: taxableSubtotal,
      isDebit: true,
      narration: `Taxable Purchase: ${voucherNumber}`,
    });

    for (const tl of taxLedgers) {
      if (tl.amount > 0) {
        ledgerEntries.push({
          ledgerName: tl.ledgerName,
          amount: tl.amount,
          isDebit: true,
          narration: `Input Tax Credit: ${tl.ledgerName}`,
        });
      }
    }

    if (Math.abs(roundOffDiff) > 0.001) {
      ledgerEntries.push({
        ledgerName: roundOffLedger,
        amount: Math.abs(roundOffDiff),
        isDebit: roundOffDiff > 0, // positive roundoff increases debit to match credit
        narration: "Invoice Round Off",
      });
    }

    ledgerEntries.push({
      ledgerName: partyLedgerName,
      amount: finalGrandTotal,
      isDebit: false,
      narration: `Credit to Vendor: ${partyLedgerName}`,
    });
  } else {
    // SALES VOUCHER:
    // Debit: Customer / Party Ledger (Grand Total)
    // Credit: Sales Accounts (Taxable Subtotal)
    // Credit: Output CGST, Output SGST, Output IGST
    // Debit / Credit: Round Off (if any)
    ledgerEntries.push({
      ledgerName: partyLedgerName,
      amount: finalGrandTotal,
      isDebit: true,
      narration: `Debit to Customer: ${partyLedgerName}`,
    });

    ledgerEntries.push({
      ledgerName: purchaseOrSalesLedger,
      amount: taxableSubtotal,
      isDebit: false,
      narration: `Taxable Sales: ${voucherNumber}`,
    });

    for (const tl of taxLedgers) {
      if (tl.amount > 0) {
        ledgerEntries.push({
          ledgerName: tl.ledgerName,
          amount: tl.amount,
          isDebit: false,
          narration: `Output Tax Liability: ${tl.ledgerName}`,
        });
      }
    }

    if (Math.abs(roundOffDiff) > 0.001) {
      ledgerEntries.push({
        ledgerName: roundOffLedger,
        amount: Math.abs(roundOffDiff),
        isDebit: roundOffDiff < 0, // negative roundoff increases debit
        narration: "Invoice Round Off",
      });
    }
  }

  // Strict Accounting Balance Check
  const totalDebit = Number(
    ledgerEntries.filter((e) => e.isDebit).reduce((s, e) => s + e.amount, 0).toFixed(2)
  );
  const totalCredit = Number(
    ledgerEntries.filter((e) => !e.isDebit).reduce((s, e) => s + e.amount, 0).toFixed(2)
  );
  const balanceDiff = Number(Math.abs(totalDebit - totalCredit).toFixed(2));
  const isBalanced = balanceDiff <= 0.01 && totalDebit > 0;

  const accountingBalance: TallyAccountingBalance = {
    totalDebit,
    totalCredit,
    difference: balanceDiff,
    isBalanced,
  };

  const validationErrors: string[] = [];
  const warnings: string[] = [];

  if (!voucherDate) {
    validationErrors.push("Missing mandatory field: Invoice Date is required.");
  }
  if (!rawPartyName) {
    validationErrors.push("Missing mandatory field: Party Name (Vendor/Customer) is required.");
  }
  if (!voucherNumber) {
    validationErrors.push("Missing mandatory field: Invoice Number is required.");
  }

  if (!isTotalMatched) {
    validationErrors.push(`Total Mismatch: Calculated ₹${calculatedGrandTotal} vs Printed ₹${printedGrandTotal} (Discrepancy: ₹${discrepancy}).`);
  }
  if (!isBalanced) {
    validationErrors.push(`Accounting mismatch — Total Debit (₹${totalDebit}) does not equal Total Credit (₹${totalCredit}) (Diff: ₹${balanceDiff}).`);
  }

  // Master readiness check
  const missingMasters = options?.autoMapUnmappedItems
    ? []
    : tallyMappingService.checkMissingMasters(data, voucherType, profile);

  let status: TallyVoucherStatus = "READY";
  if (!isBalanced || !isTotalMatched) {
    status = "INVALID";
  } else if (!voucherDate || !voucherNumber || !rawPartyName) {
    status = "NEEDS_REVIEW";
  } else if (missingMasters.length > 0 || !party.isMapped) {
    status = "NEEDS_MAPPING";
  }

  return {
    voucherId,
    voucherType,
    voucherDate,
    voucherNumber,
    referenceNumber: poNumber || voucherNumber,
    referenceDate: voucherDate,
    party,
    ledgerEntries,
    inventoryEntries,
    tax,
    totals: {
      taxableAmount: taxableSubtotal,
      taxAmount: totalTax,
      roundOff: roundOffDiff,
      grandTotal: finalGrandTotal,
      calculatedTotal: calculatedGrandTotal,
      isTotalMatched,
      discrepancy,
    },
    accountingBalance,
    status,
    narration,
    placeOfSupply: posResolution.placeOfSupply,
    supplyType: posResolution.supplyType,
    poNumber,
    dueDate,
    paymentTerms,
    deliveryNote,
    deliveryNo,
    validationErrors,
    warnings,
    profileId: profile.id,
    profileName: profile.name,
    // Backwards compatibility fields
    partyName: partyLedgerName,
    partyGSTIN,
    purchaseLedger: isSales ? undefined : purchaseOrSalesLedger,
    salesLedger: isSales ? purchaseOrSalesLedger : undefined,
    items,
    taxLedgers,
    subtotal: taxableSubtotal,
    totalTax,
    grandTotal: finalGrandTotal,
    validationMessage: validationErrors[0] || warnings[0],
  };
}

/**
 * Step 6, 7 & 13: Strict Accounting & Master Validation Rules
 */
export function validateTallyInvoice(
  tallyInvoice: TallyInvoice,
  options?: {
    existingInvoiceNumbers?: string[];
    profile?: TallyProfile;
  }
): TallyValidationResult {
  const profile = options?.profile || DEFAULT_ABC_COMPANY_PROFILE;
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Voucher Type
  const isVoucherTypeConfident =
    tallyInvoice.voucherType === "Purchase" || tallyInvoice.voucherType === "Sales";
  if (!isVoucherTypeConfident) {
    errors.push("Voucher Type is uncertain. Manual selection is required.");
  }

  // 2. Voucher Date
  if (!tallyInvoice.voucherDate || !/^\d{2}-\d{2}-\d{4}$/.test(tallyInvoice.voucherDate)) {
    errors.push("Missing or invalid Voucher Date. Expected DD-MM-YYYY format.");
  }

  // 3. Voucher Number
  const rawInvNum = (tallyInvoice.voucherNumber || "").trim();
  const isFakeNumber =
    !rawInvNum ||
    rawInvNum.toLowerCase() === "unknown" ||
    rawInvNum.toLowerCase() === "missing invoice number" ||
    rawInvNum.toLowerCase() === "n/a" ||
    rawInvNum.toLowerCase().startsWith("invoice x");

  if (isFakeNumber) {
    errors.push("Missing mandatory field: Invoice Number does not exist or contains placeholder value.");
  }

  if (rawInvNum && !isFakeNumber && options?.existingInvoiceNumbers) {
    const cleanUpper = rawInvNum.toUpperCase();
    const isDup = options.existingInvoiceNumbers.some(
      (n) => n && n.trim().toUpperCase() === cleanUpper
    );
    if (isDup) {
      errors.push(`Duplicate Invoice Number: '${rawInvNum}' already exists in Tally export.`);
    }
  }

  // 4 & 5. Master Data Check (Party & Line Items)
  const missingMasters: MissingMasterInfo[] = [];

  // Check Party
  const isPartyMapped = Boolean(tallyInvoice.party?.isMapped);
  if (!tallyInvoice.party?.name || tallyInvoice.party.name === "Unassigned Vendor" || tallyInvoice.party.name === "Unassigned Customer") {
    errors.push("Party Name is required.");
    missingMasters.push({
      type: "party",
      sourceName: "Party Name",
      suggestedName: "",
      reason: "Party name is missing on invoice.",
    });
  } else if (!isPartyMapped) {
    missingMasters.push({
      type: "party",
      sourceName: tallyInvoice.party.name,
      suggestedName: tallyInvoice.party.name,
      reason: `Party '${tallyInvoice.party.name}' requires Tally ledger mapping in '${profile.name}'.`,
    });
  }

  // Check Items
  let areItemsMapped = true;
  if (!tallyInvoice.inventoryEntries || tallyInvoice.inventoryEntries.length === 0) {
    errors.push("Voucher contains no line items.");
    areItemsMapped = false;
  } else {
    tallyInvoice.inventoryEntries.forEach((it, idx) => {
      if (!it.isMapped) {
        areItemsMapped = false;
        missingMasters.push({
          type: "item",
          sourceName: it.itemName,
          suggestedName: it.itemName,
          reason: `Item '${it.itemName}' is not mapped to a Tally Stock Item in '${profile.name}'.`,
        });
      }
    });
  }

  // Check Ledgers
  const ledgerName = tallyInvoice.voucherType === "Purchase" ? tallyInvoice.purchaseLedger : tallyInvoice.salesLedger;
  const areLedgersMapped = Boolean(ledgerName && ledgerName.trim());
  if (!areLedgersMapped) {
    missingMasters.push({
      type: "ledger",
      sourceName: tallyInvoice.voucherType === "Purchase" ? "Purchase Ledger" : "Sales Ledger",
      reason: "Accounting ledger is unassigned.",
    });
  }

  const areTaxLedgersMapped = tallyInvoice.taxLedgers.every((tl) => tl.isMapped !== false);

  // Arithmetic Validation
  const subtotal = tallyInvoice.totals?.taxableAmount ?? tallyInvoice.subtotal ?? 0;
  const cgst = tallyInvoice.tax?.cgstAmount ?? 0;
  const sgst = tallyInvoice.tax?.sgstAmount ?? 0;
  const igst = tallyInvoice.tax?.igstAmount ?? 0;
  const totalTax = tallyInvoice.totals?.taxAmount ?? tallyInvoice.totalTax ?? (cgst + sgst + igst);
  const roundOff = tallyInvoice.totals?.roundOff ?? 0;

  // Strict Tax Segregation Check:
  // NEVER combine CGST + SGST + IGST for the same tax base.
  // If an invoice has IGST only: CGST = 0, SGST = 0.
  // If an invoice has CGST + SGST: IGST = 0.
  const hasTaxMixingError = (cgst > 0 || sgst > 0) && igst > 0;
  if (hasTaxMixingError) {
    errors.push(
      `Tax Segregation Error: Voucher incorrectly combines CGST/SGST (₹${(cgst + sgst).toFixed(2)}) and IGST (₹${igst.toFixed(2)}) on the same tax base. An invoice must be either Intrastate (CGST+SGST) or Interstate (IGST), never both.`
    );
  }

  // If caller overrides tallyInvoice.grandTotal directly (e.g. in test), respect it
  const grandTotal =
    tallyInvoice.grandTotal !== undefined && tallyInvoice.totals?.grandTotal !== undefined && tallyInvoice.grandTotal !== tallyInvoice.totals.grandTotal
      ? tallyInvoice.grandTotal
      : (tallyInvoice.totals?.grandTotal ?? tallyInvoice.grandTotal ?? 0);

  // Pre-export Item Level Total Validation:
  // For each invoice:
  // SUM(TAXABLE AMOUNT) + SUM(IGST VALUE) + SUM(CGST VALUE) + SUM(SGST VALUE)
  // must match the original invoice grand total, allowing only legitimate rounding differences (<= 1.00).
  let isItemTotalValid = true;
  if (tallyInvoice.inventoryEntries && tallyInvoice.inventoryEntries.length > 0) {
    const sumItemTaxable = tallyInvoice.inventoryEntries.reduce((s, it) => s + (Number(it.taxableAmount) || 0), 0);
    const sumItemIgst = tallyInvoice.inventoryEntries.reduce((s, it) => s + (Number(it.igst) || 0), 0);
    const sumItemCgst = tallyInvoice.inventoryEntries.reduce((s, it) => s + (Number(it.cgst) || 0), 0);
    const sumItemSgst = tallyInvoice.inventoryEntries.reduce((s, it) => s + (Number(it.sgst) || 0), 0);
    const itemLevelCalculatedTotal = Number((sumItemTaxable + sumItemIgst + sumItemCgst + sumItemSgst).toFixed(2));
    const itemDiffFromGrandTotal = Number(Math.abs(itemLevelCalculatedTotal - grandTotal).toFixed(2));

    // Legitimate rounding difference is <= 1.05
    if (itemDiffFromGrandTotal > 1.05) {
      isItemTotalValid = false;
      errors.push(
        `Item Total Discrepancy: SUM(Taxable: ₹${sumItemTaxable.toFixed(2)} + GST: ₹${(sumItemIgst + sumItemCgst + sumItemSgst).toFixed(2)}) = ₹${itemLevelCalculatedTotal.toFixed(2)}, which does not match invoice Grand Total (₹${grandTotal.toFixed(2)}) by ₹${itemDiffFromGrandTotal.toFixed(2)}. Needs Review.`
      );
    }
  }

  // Accounting math: Subtotal + Taxes + Genuine Round Off must equal Grand Total
  const computedTotal = Number((subtotal + totalTax).toFixed(2));
  const computedTotalWithRound = Number((subtotal + totalTax + roundOff).toFixed(2));
  const discrepancy = Number(Math.abs(computedTotalWithRound - grandTotal).toFixed(2));
  const isRoundOffGenuine = Math.abs(roundOff) <= 1.00 || (tallyInvoice.totals?.isTotalMatched && discrepancy <= 0.05);
  const isMathBalanced = discrepancy <= 0.05 && isRoundOffGenuine && !hasTaxMixingError && isItemTotalValid;

  if (!isMathBalanced) {
    errors.push("Amount mismatch — manual validation required.");
    warnings.push(
      `Accounting math discrepancy: Subtotal (${subtotal}) + Taxes (${totalTax}) + Round Off (${roundOff}) = ${computedTotalWithRound}, but Grand Total is ${grandTotal} (Diff: ₹${discrepancy}).`
    );
  }

  // Double-Entry Balance: Total Debit MUST equal Total Credit
  const totalDebit = tallyInvoice.accountingBalance?.totalDebit ?? 0;
  const totalCredit = tallyInvoice.accountingBalance?.totalCredit ?? 0;
  const isDebitCreditBalanced = tallyInvoice.accountingBalance?.isBalanced ?? (Math.abs(totalDebit - totalCredit) <= 0.01);

  if (!isDebitCreditBalanced) {
    errors.push(`Double-Entry Mismatch: Total Debit (₹${totalDebit}) does not equal Total Credit (₹${totalCredit}).`);
  }

  const checks = {
    isVoucherTypeValid: isVoucherTypeConfident,
    isPartyMapped,
    areItemsMapped,
    areUnitsMapped: true,
    areLedgersMapped,
    areTaxLedgersMapped: areTaxLedgersMapped && !hasTaxMixingError,
    isDebitCreditBalanced,
    isMathBalanced,
  };

  let status: TallyValidationResult["status"] = "READY";
  if (!isDebitCreditBalanced || !isMathBalanced || hasTaxMixingError) {
    status = "AMOUNT_MISMATCH";
  } else if (missingMasters.length > 0) {
    status = "NEEDS_MAPPING";
  } else if (!isVoucherTypeConfident || isFakeNumber) {
    status = "REQUIRES_VALIDATION";
  }

  const isValid = errors.length === 0 && missingMasters.length === 0 && isDebitCreditBalanced && isMathBalanced && !hasTaxMixingError;

  return {
    isValid,
    status,
    errors,
    warnings,
    voucherType: tallyInvoice.voucherType,
    isVoucherTypeConfident,
    missingMasters,
    checks,
    mathDetails: {
      subtotal,
      cgst,
      sgst,
      igst,
      totalTax,
      grandTotal,
      computedTotal: computedTotalWithRound,
      discrepancy,
      isBalanced: isMathBalanced && isDebitCreditBalanced,
    },
    accountingBalance: tallyInvoice.accountingBalance,
  };
}

/**
 * Creates canonical 21-column Tally Import rows from a validated document or invoice.
 * Single source of truth for UI display, storage, and Excel export.
 *
 * EXACT 21 COLUMNS:
 * 1. Voucher Date
 * 2. Voucher Number
 * 3. Voucher Ref. No
 * 4. Party Name
 * 5. State
 * 6. GST Number
 * 7. ITEM GST RATE
 * 8. ITEM HSN
 * 9. Item Name
 * 10. Units
 * 11. Quantity
 * 12. Rate
 * 13. TAXABLE AMOUNT
 * 14. SALES LEDGER
 * 15. IGST VALUE
 * 16. CGST VALUE
 * 17. SGST VALUE
 * 18. ITEM DESCRIPTION
 * 19. NARRATION
 * 20. Delivery Note
 * 21. Delivery No.
 */
export function createTallyImportRows(
  docOrInvoice: DocumentRecord | DocumentRecord[] | ExtractedInvoice | ExtractedInvoice[] | any,
  options?: {
    profile?: TallyProfile;
    explicitVoucherType?: "Purchase" | "Sales";
  }
): TallyImportRow[] {
  if (!docOrInvoice) return [];

  // If array, process all and combine
  if (Array.isArray(docOrInvoice)) {
    return docOrInvoice.flatMap((d) => createTallyImportRows(d, options));
  }

  // Extract underlying data
  let data: ExtractedInvoice;
  let docId = "";
  if (docOrInvoice.aiResult?.cleanedData) {
    data = docOrInvoice.aiResult.cleanedData;
    docId = docOrInvoice.id || "";
  } else if (docOrInvoice.ocrResult?.structuredData) {
    data = docOrInvoice.ocrResult.structuredData;
    docId = docOrInvoice.id || "";
  } else if (docOrInvoice.items !== undefined || docOrInvoice.invoiceNumber !== undefined) {
    data = docOrInvoice;
    docId = docOrInvoice.id || "";
  } else {
    data = (docOrInvoice.cleanedData || docOrInvoice) as ExtractedInvoice;
    docId = docOrInvoice.id || "";
  }

  const profile = options?.profile || DEFAULT_ABC_COMPANY_PROFILE;

  // 1. Voucher Date: Strictly from invoice date. Never use current date. Blank if missing.
  const rawDate = data.invoiceDate || "";
  const voucherDate = formatTallyExcelDate(rawDate);

  // 2. Voucher Number
  const voucherNumber = (data.invoiceNumber || "").trim();

  // 3. Voucher Ref. No
  const voucherRefNo = voucherNumber;

  // Voucher type determination
  const explicitType = options?.explicitVoucherType;
  const isSales = explicitType === "Sales" || (!explicitType && Boolean(
    profile.companyGstin &&
    data.vendorGstin &&
    profile.companyGstin.trim().toUpperCase() === data.vendorGstin.trim().toUpperCase()
  ));

  // 4. Party Name: Never use fake names or "Unassigned"
  const rawPartyName = isSales ? data.customerName : data.vendorName;
  const partyName = (rawPartyName || "").trim();

  // 6. GST Number
  const rawGstin = (isSales ? (data.customerGstin || data.vendorGstin) : (data.vendorGstin || data.customerGstin)) || "";
  const gstNumber = (rawGstin || "").trim();

  // 5. State: normalized state name
  const rawState = isSales ? (data.customerAddress || "") : (data.vendorAddress || "");
  const state = normalizeStateName(gstNumber || rawState);

  // 14. SALES LEDGER: Sales ledger from profile or invoice
  const salesLedger = (
    isSales
      ? (profile.ledgers?.salesLedger || "Sales Accounts")
      : (profile.ledgers?.purchaseLedger || "Purchase Accounts")
  ).trim();

  // 19. NARRATION
  const narration = (data.notes || "").trim();

  // 20. Delivery Note
  const deliveryNote = (
    data.deliveryNote ||
    data.dispatchNote ||
    (docOrInvoice as any).metadata?.deliveryNote ||
    ""
  ).trim();

  // 21. Delivery No.
  const deliveryNo = (
    data.deliveryNo ||
    data.challanNo ||
    (docOrInvoice as any).metadata?.deliveryNo ||
    ""
  ).trim();

  // Tax regime detection:
  // Under Indian GST:
  // If invoice has IGST: IGST VALUE = actual IGST, CGST = 0, SGST = 0
  // If invoice has CGST + SGST: CGST = actual CGST, SGST = actual SGST, IGST = 0
  // Do NOT double count GST.
  const rawCgstTotal = Number(data.cgstTotal) || 0;
  const rawSgstTotal = Number(data.sgstTotal) || 0;
  const rawIgstTotal = Number(data.igstTotal) || 0;

  const rawItems = data.items && data.items.length > 0 ? data.items : [];
  const itemsHaveCgst = rawItems.some((it: any) => (Number(it.cgst) || 0) > 0);
  const itemsHaveSgst = rawItems.some((it: any) => (Number(it.sgst) || 0) > 0);
  const itemsHaveIgst = rawItems.some((it: any) => (Number(it.igst) || 0) > 0);

  const hasIgst = rawIgstTotal > 0 || itemsHaveIgst;
  const hasCgstSgst = rawCgstTotal > 0 || rawSgstTotal > 0 || itemsHaveCgst || itemsHaveSgst;

  let isInterstate = false;
  if (hasIgst && !hasCgstSgst) {
    isInterstate = true;
  } else if (hasCgstSgst && !hasIgst) {
    isInterstate = false;
  } else if (profile.companyGstin && gstNumber && gstNumber.length >= 2 && profile.companyGstin.length >= 2) {
    isInterstate = gstNumber.substring(0, 2) !== profile.companyGstin.substring(0, 2);
  } else {
    isInterstate = hasIgst;
  }

  // If no items are present, emit at least one row
  if (rawItems.length === 0) {
    const singleTaxable = Number(data.subTotal) || Number(data.grandTotal) || 0;
    const singleIgst = isInterstate ? (rawIgstTotal || (Number(data.totalTax) || 0)) : 0;
    const singleCgst = !isInterstate ? (rawCgstTotal || ((Number(data.totalTax) || 0) / 2)) : 0;
    const singleSgst = !isInterstate ? (rawSgstTotal || ((Number(data.totalTax) || 0) / 2)) : 0;
    const singleGstRate = singleTaxable > 0 && (singleIgst + singleCgst + singleSgst) > 0
      ? Number((((singleIgst + singleCgst + singleSgst) / singleTaxable) * 100).toFixed(0))
      : 0;

    return [
      {
        id: `${docId || voucherNumber}-1`,
        documentId: docId,
        voucherDate,
        voucherNumber,
        voucherRefNo,
        partyName,
        state,
        gstNumber,
        itemGstRate: singleGstRate,
        itemHsn: "",
        itemName: "",
        units: "PCS",
        quantity: 1,
        rate: singleTaxable,
        taxableAmount: singleTaxable,
        salesLedger,
        igstValue: Number(singleIgst.toFixed(2)),
        cgstValue: Number(singleCgst.toFixed(2)),
        sgstValue: Number(singleSgst.toFixed(2)),
        itemDescription: "",
        narration,
        deliveryNote,
        deliveryNo,
      },
    ];
  }

  // Iterate each item to produce exactly one row per item
  return rawItems.map((it: any, idx: number) => {
    // 7. ITEM GST RATE: Number (e.g. 5, 18)
    const itemGstRate = Number(it.gstRate || (Number(it.cgstRate || 0) + Number(it.sgstRate || 0) + Number(it.igstRate || 0)) || 0);

    // 8. ITEM HSN: string
    const itemHsn = (it.hsn || it.hsnSac || it.hsnCode || "").trim();

    // 9. Item Name: string
    const itemName = (it.itemName || it.description || "").trim();

    // 10. Units: string (e.g. PCS)
    let units = (it.unit || it.units || it.uom || "PCS").trim();
    if (/^pc(s)?$/i.test(units)) units = "PCS";

    // 11. Quantity: Number
    const quantity = Number(it.qty ?? it.quantity ?? 1);

    // 12. Rate: Number
    const rate = Number(it.rate ?? it.unitPrice ?? 0);

    // 13. TAXABLE AMOUNT: Number
    let taxableAmount = Number(it.taxableAmount);
    if (isNaN(taxableAmount) || taxableAmount === 0) {
      taxableAmount = rate > 0 ? Math.max(0, quantity * rate - Number(it.discount || 0)) : Number(it.total || 0);
    }
    taxableAmount = Number(taxableAmount.toFixed(2));

    // 15. IGST VALUE: Number
    let igstValue = 0;
    // 16. CGST VALUE: Number
    let cgstValue = 0;
    // 17. SGST VALUE: Number
    let sgstValue = 0;

    if (isInterstate) {
      igstValue = Number(it.igst ?? it.igstAmount ?? 0);
      if (igstValue === 0 && itemGstRate > 0) {
        igstValue = Number(((taxableAmount * itemGstRate) / 100).toFixed(2));
      }
      cgstValue = 0;
      sgstValue = 0;
    } else {
      igstValue = 0;
      cgstValue = Number(it.cgst ?? it.cgstAmount ?? 0);
      sgstValue = Number(it.sgst ?? it.sgstAmount ?? 0);
      if (cgstValue === 0 && sgstValue === 0 && itemGstRate > 0) {
        const half = itemGstRate / 2;
        cgstValue = Number(((taxableAmount * half) / 100).toFixed(2));
        sgstValue = Number(((taxableAmount * half) / 100).toFixed(2));
      }
    }

    // 18. ITEM DESCRIPTION: string
    const itemDescription = (it.description || it.itemName || "").trim();

    return {
      id: `${docId || voucherNumber}-${idx + 1}`,
      documentId: docId,
      voucherDate,
      voucherNumber,
      voucherRefNo,
      partyName,
      state,
      gstNumber,
      itemGstRate,
      itemHsn,
      itemName,
      units,
      quantity,
      rate,
      taxableAmount,
      salesLedger,
      igstValue,
      cgstValue,
      sgstValue,
      itemDescription,
      narration,
      deliveryNote,
      deliveryNo,
    };
  });
}

