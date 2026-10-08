import {
  ExtractedInvoice,
  InvoiceLineItem,
  ValidationError,
  AIResult,
} from "@/types/document";

/**
 * Validates Indian 15-character GSTIN using official check-digit algorithm
 * Format: 2 digits (state) + 10 chars (PAN) + 1 char (entity code) + 'Z' + 1 checksum char
 */
export function validateGstin(gstin: string): { isValid: boolean; message?: string } {
  if (!gstin) {
    return { isValid: false, message: "GSTIN is missing" };
  }

  const cleanGstin = gstin.trim().toUpperCase();
  const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

  if (!regex.test(cleanGstin)) {
    return {
      isValid: false,
      message: `Invalid GSTIN structure '${cleanGstin}'. Expected format: 22AAAAA0000A1Z5`,
    };
  }

  // Official Modulo 36 checksum calculation
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let factor = 1;
  let sum = 0;

  for (let i = 0; i < 14; i++) {
    const codePoint = chars.indexOf(cleanGstin[i]);
    let addend = factor * codePoint;
    factor = factor === 2 ? 1 : 2;
    addend = Math.floor(addend / 36) + (addend % 36);
    sum += addend;
  }

  const remainder = sum % 36;
  const checkCodePoint = (36 - remainder) % 36;
  const expectedChar = chars[checkCodePoint];
  const actualChar = cleanGstin[14];

  if (actualChar !== expectedChar) {
    // Note: Some legacy/custom GSTINs in invoices might have slight checksum differences,
    // so we return false but keep warning rather than fatal crash.
    return {
      isValid: false,
      message: `GSTIN checksum mismatch. Check character is '${actualChar}', expected '${expectedChar}'`,
    };
  }

  return { isValid: true };
}

/**
 * Validates Indian 10-character PAN
 * Format: 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F)
 */
export function validatePan(pan: string): { isValid: boolean; message?: string } {
  if (!pan) {
    return { isValid: false, message: "PAN is missing" };
  }
  const cleanPan = pan.trim().toUpperCase();
  const regex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  if (!regex.test(cleanPan)) {
    return {
      isValid: false,
      message: `Invalid PAN structure '${cleanPan}'. Expected 5 letters, 4 numbers, 1 letter.`,
    };
  }
  return { isValid: true };
}

/**
 * Validates RFC-compliant Email address
 */
export function validateEmail(email?: string): boolean {
  if (!email) return false;
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(email.trim());
}

/**
 * Validates mobile number (standard 10-12 digits with optional +91)
 */
export function validateMobile(phone?: string): boolean {
  if (!phone) return false;
  const digits = phone.replace(/[^0-9]/g, "");
  return digits.length >= 10 && digits.length <= 13;
}

/**
 * Standardizes multiple date formats to ISO YYYY-MM-DD
 * Handles formats: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-MMM-YYYY (e.g. 15-Sep-2026)
 */
export function standardizeDate(rawDate: string): { standardized: string; corrected: boolean } {
  if (!rawDate) return { standardized: "", corrected: false };

  const trimmed = rawDate.trim();

  // Already standard ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { standardized: trimmed, corrected: false };
  }

  // Handle DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyy = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, "0");
    const month = ddmmyyyy[2].padStart(2, "0");
    const year = ddmmyyyy[3];
    return { standardized: `${year}-${month}-${day}`, corrected: true };
  }

  // Handle textual month (e.g. 15 Sep 2026, September 15, 2026)
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return { standardized: `${y}-${m}-${d}`, corrected: true };
  }

  return { standardized: trimmed, corrected: false };
}

/**
 * Normalizes vendor name by removing noisy legal abbreviations and standardizing title case
 */
export function normalizeVendorName(rawName: string): { normalized: string; changed: boolean } {
  if (!rawName) return { normalized: "", changed: false };

  let name = rawName.trim().replace(/\s+/g, " ");
  const original = name;

  // Fix common OCR capitalizations and suffix standardizations
  const replacements: [RegExp, string][] = [
    [/\bPVT\.?\s*LTD\.?\b/gi, "Private Limited"],
    [/\bPVT\s*LIMITED\b/gi, "Private Limited"],
    [/\bLLP\b/gi, "LLP"],
    [/\bLTD\.?\b/gi, "Limited"],
    [/\bINC\.?\b/gi, "Inc."],
    [/\bCORP\.?\b/gi, "Corporation"],
    [/\bCO\.?\b/gi, "Company"],
  ];

  for (const [pattern, replacement] of replacements) {
    name = name.replace(pattern, replacement);
  }

  // Convert ALL CAPS to Title Case (if text is > 4 chars and all caps)
  if (name.length > 4 && name === name.toUpperCase()) {
    name = name
      .toLowerCase()
      .split(" ")
      .map((w) => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w.toUpperCase()))
      .join(" ");
  }

  return { normalized: name, changed: name !== original };
}

/**
 * Fixes common OCR misreadings in alphanumeric fields
 */
export function fixOcrMistakes(text: string, type: "alphanumeric" | "number"): string {
  if (!text) return "";
  let result = text.trim();

  if (type === "number") {
    // Replace 'O'/'o' with '0', 'l'/'I' with '1', 'S'/'s' with '5' in pure numerical contexts
    result = result
      .replace(/[oO]/g, "0")
      .replace(/[lI]/g, "1")
      .replace(/[,]/g, ""); // strip thousands separator for clean float
  }

  return result;
}

export interface CleanDataResult {
  cleaned: ExtractedInvoice;
  validationErrors: ValidationError[];
  flags: AIResult["flags"];
  audit: AIResult["cleaningAudit"];
  overallConfidence: number;
}

/**
 * Master Data Cleaner & Validator Service
 */
export function cleanAndValidateInvoice(
  raw: ExtractedInvoice,
  existingInvoices: Array<{ invoiceNumber: string; vendorName: string }> = []
): CleanDataResult {
  const errors: ValidationError[] = [];
  let spacesTrimmed = 0;
  let datesStandardized = 0;
  let ocrCorrections = 0;
  let duplicatesRemoved = 0;

  // 1. Clean Vendor Name
  const rawVendor = (raw.vendorName || "").trim();
  if (rawVendor.length !== (raw.vendorName || "").length) spacesTrimmed++;
  const { normalized: normVendor, changed: vendorChanged } = normalizeVendorName(rawVendor);
  if (vendorChanged) ocrCorrections++;

  // 2. Validate GSTIN
  const gstinResult = validateGstin(raw.vendorGstin || "");
  if (!gstinResult.isValid) {
    errors.push({
      id: "err_gstin",
      field: "vendorGstin",
      message: gstinResult.message || "Invalid Vendor GSTIN",
      severity: "error",
      code: "INVALID_GSTIN",
      originalValue: raw.vendorGstin,
    });
  }

  // 3. Extract PAN from GSTIN if missing
  let vendorPan = raw.vendorPan?.trim() || "";
  if (!vendorPan && raw.vendorGstin && raw.vendorGstin.length >= 12) {
    const derivedPan = raw.vendorGstin.substring(2, 12);
    const panCheck = validatePan(derivedPan);
    if (panCheck.isValid) {
      vendorPan = derivedPan;
      ocrCorrections++;
    }
  }

  if (vendorPan) {
    const panResult = validatePan(vendorPan);
    if (!panResult.isValid) {
      errors.push({
        id: "err_pan",
        field: "vendorPan",
        message: panResult.message || "Invalid PAN",
        severity: "warning",
        code: "INVALID_PAN",
        originalValue: vendorPan,
      });
    }
  }

  // 4. Validate Email & Phone
  if (raw.vendorEmail && !validateEmail(raw.vendorEmail)) {
    errors.push({
      id: "err_email",
      field: "vendorEmail",
      message: `Invalid email address format '${raw.vendorEmail}'`,
      severity: "warning",
      code: "INVALID_EMAIL",
      originalValue: raw.vendorEmail,
    });
  }

  if (raw.vendorPhone && !validateMobile(raw.vendorPhone)) {
    errors.push({
      id: "err_phone",
      field: "vendorPhone",
      message: `Invalid telephone number format '${raw.vendorPhone}'`,
      severity: "info",
      code: "INVALID_PHONE",
      originalValue: raw.vendorPhone,
    });
  }

  // 5. Standardize Dates
  const { standardized: normInvoiceDate, corrected: dateCorrected } = standardizeDate(
    raw.invoiceDate || ""
  );
  if (dateCorrected) datesStandardized++;

  let normDueDate: string | undefined = undefined;
  if (raw.dueDate) {
    const dueRes = standardizeDate(raw.dueDate);
    normDueDate = dueRes.standardized;
    if (dueRes.corrected) datesStandardized++;
  }

  // 6. Deduplicate & Clean Line Items
  const cleanedItems: InvoiceLineItem[] = [];
  const seenItems = new Set<string>();

  for (const item of raw.items || []) {
    const cleanDesc = (item.description || "").trim().replace(/\s+/g, " ");
    const key = `${cleanDesc.toLowerCase()}_${item.qty}_${item.rate}`;

    if (seenItems.has(key)) {
      duplicatesRemoved++;
      continue;
    }
    seenItems.add(key);

    const qty = Number(item.qty) || 0;
    const rate = Number(item.rate) || 0;
    const discount = Number(item.discount) || 0;
    const gstRate = Number(item.gstRate) || 0;

    const baseAmount = Math.max(0, qty * rate - discount);
    const taxAmount = (baseAmount * gstRate) / 100;
    const calculatedTotal = Number((baseAmount + taxAmount).toFixed(2));

    // Calculate CGST, SGST, IGST breakdown if missing
    let cgst = Number(item.cgst) || 0;
    let sgst = Number(item.sgst) || 0;
    let igst = Number(item.igst) || 0;

    if (cgst === 0 && sgst === 0 && igst === 0 && gstRate > 0) {
      cgst = Number((taxAmount / 2).toFixed(2));
      sgst = Number((taxAmount / 2).toFixed(2));
    }

    const rowTotal = item.total !== undefined ? Number(item.total) : calculatedTotal;

    // Check row math mismatch
    if (Math.abs(rowTotal - calculatedTotal) > 1.0) {
      errors.push({
        id: `err_calc_${item.id || Math.random()}`,
        field: `items[${cleanDesc}].total`,
        message: `Line item '${cleanDesc}' total (${rowTotal}) differs from Qty*Rate+Tax calculation (${calculatedTotal})`,
        severity: "warning",
        code: "CALCULATION_MISMATCH",
        originalValue: rowTotal,
        suggestedValue: calculatedTotal,
      });
    }

    cleanedItems.push({
      id: item.id || `item_${cleanedItems.length + 1}`,
      description: cleanDesc,
      hsn: (item.hsn || "").trim(),
      qty,
      rate,
      discount,
      gstRate,
      cgst,
      sgst,
      igst,
      total: rowTotal,
      confidence: item.confidence ?? 95,
    });
  }

  // 7. Calculate Grand Totals and Cross-check
  const subTotal = cleanedItems.reduce((sum, item) => sum + item.qty * item.rate - item.discount, 0);
  const totalCgst = cleanedItems.reduce((sum, item) => sum + item.cgst, 0);
  const totalSgst = cleanedItems.reduce((sum, item) => sum + item.sgst, 0);
  const totalIgst = cleanedItems.reduce((sum, item) => sum + item.igst, 0);
  const totalTax = totalCgst + totalSgst + totalIgst;
  const computedGrandTotal = Number((subTotal + totalTax).toFixed(2));
  const rawGrandTotal = Number(raw.grandTotal) || computedGrandTotal;

  if (Math.abs(rawGrandTotal - computedGrandTotal) > 2.0 && cleanedItems.length > 0) {
    errors.push({
      id: "err_grand_total",
      field: "grandTotal",
      message: `Extracted Grand Total (${rawGrandTotal}) doesn't match sum of items + taxes (${computedGrandTotal})`,
      severity: "warning",
      code: "CALCULATION_MISMATCH",
      originalValue: rawGrandTotal,
      suggestedValue: computedGrandTotal,
    });
  }

  // 8. Duplicate Detection (Only when candidate invoice number is non-empty)
  const invoiceNum = (raw.invoiceNumber || "").trim();
  const isDuplicateInvoice = invoiceNum.length > 0
    ? existingInvoices.some(
        (inv) => inv.invoiceNumber && inv.invoiceNumber.trim().toLowerCase() === invoiceNum.toLowerCase()
      )
    : false;

  if (isDuplicateInvoice && invoiceNum) {
    errors.push({
      id: "err_dup_inv",
      field: "invoiceNumber",
      message: `Warning: An invoice with number '${invoiceNum}' already exists in your workspace.`,
      severity: "warning",
      code: "DUPLICATE_INVOICE",
      originalValue: invoiceNum,
    });
  }

  const isDuplicateVendor = normVendor
    ? existingInvoices.some(
        (inv) => inv.vendorName && inv.vendorName.trim().toLowerCase() === normVendor.toLowerCase()
      )
    : false;

  // Missing critical fields
  let hasMissingFields = false;
  if (!normVendor) {
    hasMissingFields = true;
    errors.push({
      id: "err_miss_vendor",
      field: "vendorName",
      message: "Vendor name is required",
      severity: "error",
      code: "MISSING_REQUIRED_FIELD",
    });
  }
  if (!invoiceNum) {
    hasMissingFields = true;
    errors.push({
      id: "err_miss_inv_num",
      field: "invoiceNumber",
      message: "Invoice number was not detected from document. Marked for manual validation.",
      severity: "warning",
      code: "MISSING_INVOICE_NUMBER",
    });
  }
  if (!normInvoiceDate) {
    hasMissingFields = true;
    errors.push({
      id: "err_miss_date",
      field: "invoiceDate",
      message: "Invoice date is required",
      severity: "error",
      code: "MISSING_REQUIRED_FIELD",
    });
  }

  // Calculate Overall Confidence Score
  let confidence = 100;
  for (const err of errors) {
    if (err.severity === "error") confidence -= 15;
    else if (err.severity === "warning") confidence -= 6;
    else confidence -= 2;
  }
  confidence = Math.max(20, Math.min(100, confidence));

  const cleanedInvoice: ExtractedInvoice = {
    vendorName: normVendor,
    vendorGstin: (raw.vendorGstin || "").trim().toUpperCase(),
    vendorPan,
    vendorEmail: raw.vendorEmail?.trim(),
    vendorPhone: raw.vendorPhone?.trim(),
    vendorAddress: raw.vendorAddress?.trim(),
    customerName: (raw.customerName || "").trim(),
    customerGstin: raw.customerGstin?.trim().toUpperCase(),
    customerAddress: raw.customerAddress?.trim(),
    invoiceNumber: invoiceNum || null,
    invoiceDate: normInvoiceDate,
    dueDate: normDueDate,
    poNumber: raw.poNumber?.trim(),
    currency: raw.currency || "INR",
    items: cleanedItems,
    subTotal: raw.subTotal !== undefined && raw.subTotal !== 0 ? raw.subTotal : Number(subTotal.toFixed(2)),
    cgstTotal: raw.cgstTotal !== undefined && raw.cgstTotal !== 0 ? raw.cgstTotal : Number(totalCgst.toFixed(2)),
    sgstTotal: raw.sgstTotal !== undefined && raw.sgstTotal !== 0 ? raw.sgstTotal : Number(totalSgst.toFixed(2)),
    igstTotal: raw.igstTotal !== undefined ? raw.igstTotal : Number(totalIgst.toFixed(2)),
    totalTax: raw.totalTax !== undefined && raw.totalTax !== 0 ? raw.totalTax : Number(totalTax.toFixed(2)),
    grandTotal: raw.grandTotal !== undefined && raw.grandTotal !== 0 ? raw.grandTotal : rawGrandTotal,
    notes: raw.notes?.trim(),
  };

  return {
    cleaned: cleanedInvoice,
    validationErrors: errors,
    flags: {
      isDuplicateInvoice,
      isDuplicateVendor,
      isGstinValid: gstinResult.isValid,
      isPanValid: vendorPan ? validatePan(vendorPan).isValid : false,
      isCalculationAccurate: errors.every((e) => e.code !== "CALCULATION_MISMATCH"),
      hasMissingFields,
    },
    audit: {
      trimmedSpacesCount: spacesTrimmed,
      normalizedVendorName: vendorChanged ? normVendor : undefined,
      standardizedDatesCount: datesStandardized,
      ocrCorrectionsCount: ocrCorrections,
      duplicateRowsRemoved: duplicatesRemoved,
    },
    overallConfidence: Number(confidence.toFixed(1)),
  };
}
