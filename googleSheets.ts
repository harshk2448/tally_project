import { google, sheets_v4 } from "googleapis";
import { DocumentRecord, ExtractedInvoice, InvoiceLineItem, GoogleSheetsInvoiceData } from "@/types/document";
import { googleSheetsConfigService, GoogleSheetsConfig } from "@/services/google-sheets-config.service";
import { TALLY_IMPORT_COLUMNS, TallyImportRow } from "@/types/tally";
import { createTallyImportRows } from "@/lib/tally-utils";
import {
  TallyExportService,
  TallyTransactionRow,
  TallyValidationRow,
  TALLY_EXPORT_HEADERS,
  TALLY_VALIDATION_HEADERS,
} from "@/services/tally-export.service";

export const TALLY_DATA_HEADERS = [...TALLY_IMPORT_COLUMNS];
export { TALLY_EXPORT_HEADERS, TALLY_VALIDATION_HEADERS };
export type { GoogleSheetsInvoiceData };

export const INVOICE_SHEET_HEADERS = [
  "Document Type",
  "Vendor Name",
  "Vendor GSTIN",
  "Vendor PAN",
  "Customer Name",
  "Customer GSTIN",
  "Invoice Number",
  "Invoice Date",
  "Due Date",
  "PO Number",
  "Currency",
  "Payment Terms",
  "Subtotal",
  "CGST",
  "SGST",
  "IGST",
  "Total Tax",
  "Grand Total",
  "Items Count",
  "Confidence Score",
  "Processed Date",
];

export const ITEMS_SHEET_HEADERS = [
  "Invoice Number",
  "Item Description",
  "HSN/SAC",
  "Quantity",
  "Rate",
  "Discount",
  "GST %",
  "Line Total",
];

/**
 * 1. connectGoogleSheets: Authenticates with Google Sheets API using Service Account
 */
export async function connectGoogleSheets(
  overrideConfig?: Partial<GoogleSheetsConfig>
): Promise<{ sheets: sheets_v4.Sheets; auth: any; clientEmail: string }> {
  const cfg = overrideConfig
    ? { ...googleSheetsConfigService.getConfig(), ...overrideConfig }
    : googleSheetsConfigService.getConfig();

  const creds = cfg.serviceAccountKey;

  if (!creds || !creds.client_email || !creds.private_key) {
    console.error("[Google Sheets Error] Service account credentials missing or incomplete.");
    throw new Error("❌ Google Sheets authentication failed: Service Account JSON credentials are not configured.");
  }

  try {
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    await auth.authorize();
    console.log(`[Google Sheets Connected] Authenticated successfully as Service Account: ${creds.client_email}`);

    const sheets = google.sheets({ version: "v4", auth });
    return { sheets, auth, clientEmail: creds.client_email };
  } catch (err: any) {
    console.error("[Google Sheets Error] Authentication failed:", err);
    throw new Error(`❌ Google Sheets authentication failed: ${err.message || String(err)}`);
  }
}

/**
 * Helper: Ensures a worksheet exists in the spreadsheet. If not, adds it with headers.
 */
async function ensureWorksheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  headers: string[]
): Promise<void> {
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties.title",
    });

    const existingSheets = (meta.data.sheets || []).map((s) => s.properties?.title);
    const sheetExists = existingSheets.includes(sheetName);

    if (!sheetExists) {
      console.log(`[Google Sheets Setup] Sheet "${sheetName}" not found. Creating worksheet...`);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        },
      });

      // Add header row
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheetName}'!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [headers],
        },
      });
      console.log(`[Google Sheets Setup] Created worksheet "${sheetName}" with ${headers.length} headers.`);
      return;
    }

    // Worksheet exists: check if header row exists
    const headerCheck = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A1:Z1`,
    });

    const hasHeaders = headerCheck.data.values && headerCheck.data.values.length > 0;
    if (!hasHeaders) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheetName}'!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [headers],
        },
      });
      console.log(`[Google Sheets Setup] Initialized headers for existing sheet "${sheetName}".`);
    }
  } catch (err: any) {
    handleGoogleApiError(err, spreadsheetId, sheetName);
  }
}

/**
 * 2. checkDuplicateInvoice: Checks if an invoice is a true duplicate in the sheet.
 * Only true duplicates (matching invoice number + vendor or total) are skipped.
 * Invoices with missing/empty numbers are NEVER skipped.
 */
export async function checkDuplicateInvoice(
  spreadsheetId: string,
  sheetName: string,
  invoiceIdentifier: string | { invoiceNumber: string; vendorName?: string; grandTotal?: number },
  sheetsClient?: sheets_v4.Sheets
): Promise<boolean> {
  const invNumber = typeof invoiceIdentifier === "string" ? invoiceIdentifier : invoiceIdentifier.invoiceNumber;
  const vendorName = typeof invoiceIdentifier === "string" ? undefined : invoiceIdentifier.vendorName;
  const grandTotal = typeof invoiceIdentifier === "string" ? undefined : invoiceIdentifier.grandTotal;

  // Requirement 7 & 6: Never deduplicate empty, placeholder, or "Missing Invoice Number"
  if (
    !invNumber ||
    !invNumber.trim() ||
    invNumber.trim().toLowerCase() === "missing invoice number" ||
    invNumber.trim().toLowerCase() === "unknown" ||
    invNumber.trim().toLowerCase() === "n/a"
  ) {
    console.log(`[Google Sheets Duplicate Check] Invoice number is "${invNumber || "empty"}". Skipping duplicate check - row will be inserted.`);
    return false;
  }

  const cleanInv = invNumber.trim().toLowerCase();
  const cleanVendor = (vendorName || "").trim().toLowerCase();
  const sheets = sheetsClient || (await connectGoogleSheets({ spreadsheetId, sheetName })).sheets;

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A:U`,
    });

    const rows = res.data.values || [];
    if (rows.length <= 1) return false;

    const headerRow = rows[0] || [];
    let invColIdx = headerRow.findIndex(
      (h: any) => String(h).trim().toLowerCase() === "invoice number"
    );
    if (invColIdx === -1) invColIdx = 6; // Default to Column G (0-indexed: 6)

    let vendorColIdx = headerRow.findIndex(
      (h: any) => String(h).trim().toLowerCase() === "vendor name"
    );
    if (vendorColIdx === -1) vendorColIdx = 1; // Default to Column B (0-indexed: 1)

    let totalColIdx = headerRow.findIndex(
      (h: any) => String(h).trim().toLowerCase() === "grand total"
    );
    if (totalColIdx === -1) totalColIdx = 17; // Default to Column R (0-indexed: 17)

    for (let i = 1; i < rows.length; i++) {
      const rowVal = rows[i]?.[invColIdx];
      if (rowVal && String(rowVal).trim().toLowerCase() === cleanInv) {
        // True duplicate check: only skip if vendor name or grand total ALSO matches
        const existingVendor = String(rows[i]?.[vendorColIdx] || "").trim().toLowerCase();
        const existingTotalStr = String(rows[i]?.[totalColIdx] || "").replace(/[^0-9.]/g, "");
        const existingTotal = existingTotalStr ? parseFloat(existingTotalStr) : null;

        const vendorMatches = cleanVendor && existingVendor && (existingVendor.includes(cleanVendor) || cleanVendor.includes(existingVendor));
        const totalMatches = grandTotal !== undefined && existingTotal !== null && Math.abs(grandTotal - existingTotal) < 1;

        if ((cleanVendor && vendorMatches) || (grandTotal !== undefined && totalMatches)) {
          console.log(
            `[Google Sheets Duplicate] True duplicate invoice detected at row ${i + 1}: Invoice "${invNumber}", Vendor: "${existingVendor || "N/A"}", Total: "${existingTotal || "N/A"}". Skipping duplicate.`
          );
          return true;
        } else if (!cleanVendor && grandTotal === undefined) {
          console.log(
            `[Google Sheets Duplicate] Duplicate invoice number "${invNumber}" found at row ${i + 1}. Skipping duplicate.`
          );
          return true;
        } else {
          console.log(
            `[Google Sheets Duplicate] Invoice number "${invNumber}" found at row ${i + 1}, but vendor/total differs (Current Vendor: "${cleanVendor}", Existing: "${existingVendor}"). Treating as new invoice.`
          );
        }
      }
    }

    return false;
  } catch (err: any) {
    if (err.message && err.message.includes("Unable to parse range")) {
      return false;
    }
    console.error("[Google Sheets Duplicate Check Error]:", err.message || err);
    return false;
  }
}

/**
 * 3. appendInvoice: Appends a single invoice row to Google Sheets
 */
export async function appendInvoice(
  spreadsheetId: string,
  sheetName: string,
  invoiceData: {
    documentType: string;
    vendorName?: string;
    vendorGstin?: string;
    vendorPan?: string;
    customerName?: string;
    customerGstin?: string;
    invoiceNumber: string;
    invoiceDate?: string;
    dueDate?: string;
    poNumber?: string;
    currency?: string;
    paymentTerms?: string;
    subtotal?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    totalTax?: number;
    grandTotal?: number;
    itemsCount?: number;
    confidenceScore?: number;
    processedDate?: string;
  },
  sheetsClient?: sheets_v4.Sheets
): Promise<{ updatedRange?: string; updatedRows?: number }> {
  const { sheets, clientEmail } = sheetsClient
    ? { sheets: sheetsClient, clientEmail: "Pre-authenticated client" }
    : await connectGoogleSheets({ spreadsheetId, sheetName });

  console.log("\n=================== GOOGLE SHEETS WRITE: appendInvoice ===================");
  console.log(`[Google Sheets Connection] Authenticated Service Account: ${clientEmail}`);
  console.log(`[Google Sheets Target] Spreadsheet ID: "${spreadsheetId}" | Sheet Name: "${sheetName}"`);

  // Make sure sheet and headers exist
  await ensureWorksheet(sheets, spreadsheetId, sheetName, INVOICE_SHEET_HEADERS);

  // If invoice number is missing or empty, ensure "Missing Invoice Number" is saved
  const finalInvoiceNumber = (invoiceData.invoiceNumber && invoiceData.invoiceNumber.trim())
    ? invoiceData.invoiceNumber.trim()
    : "Missing Invoice Number";

  const row = [
    invoiceData.documentType || "Invoice",
    invoiceData.vendorName || "",
    invoiceData.vendorGstin || "",
    invoiceData.vendorPan || "",
    invoiceData.customerName || "",
    invoiceData.customerGstin || "",
    finalInvoiceNumber,
    invoiceData.invoiceDate || "",
    invoiceData.dueDate || "",
    invoiceData.poNumber || "",
    invoiceData.currency || "INR",
    invoiceData.paymentTerms || "",
    invoiceData.subtotal ?? 0,
    invoiceData.cgst ?? 0,
    invoiceData.sgst ?? 0,
    invoiceData.igst ?? 0,
    invoiceData.totalTax ?? 0,
    invoiceData.grandTotal ?? 0,
    invoiceData.itemsCount ?? 0,
    invoiceData.confidenceScore ? `${Math.round(invoiceData.confidenceScore)}%` : "95%",
    invoiceData.processedDate || new Date().toISOString().replace("T", " ").substring(0, 19),
  ];

  // Requirement 10: Debug Log - Google Sheets Row Data
  console.log("\n=================== PIPELINE STAGE: GOOGLE SHEETS ROW DATA ===================");
  console.log(`[Google Sheets Row Data] (21 columns matching INVOICE_SHEET_HEADERS):`);
  console.log(JSON.stringify({
    "0 [Document Type]": row[0],
    "1 [Vendor Name]": row[1],
    "2 [Vendor GSTIN]": row[2],
    "3 [Vendor PAN]": row[3],
    "4 [Customer Name]": row[4],
    "5 [Customer GSTIN]": row[5],
    "6 [Invoice Number]": row[6],
    "7 [Invoice Date]": row[7],
    "8 [Due Date]": row[8],
    "9 [PO Number]": row[9],
    "10 [Currency]": row[10],
    "11 [Payment Terms]": row[11],
    "12 [Subtotal]": row[12],
    "13 [CGST]": row[13],
    "14 [SGST]": row[14],
    "15 [IGST]": row[15],
    "16 [Total Tax]": row[16],
    "17 [Grand Total]": row[17],
    "18 [Items Count]": row[18],
    "19 [Confidence Score]": row[19],
    "20 [Processed Date]": row[20],
  }, null, 2));
  console.log("===============================================================================\n");

  try {
    console.log(`[Google Sheets API] Calling sheets.spreadsheets.values.append()...`);
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${sheetName}'!A:U`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [row],
      },
    });

    console.log(`[Google Sheets API Response] HTTP ${res.status} ${res.statusText || "OK"}`);
    console.log(`[Google Sheets API Response Updates]: Range=${res.data.updates?.updatedRange}, Rows=${res.data.updates?.updatedRows || 1}, Cells=${res.data.updates?.updatedCells}`);
    console.log("=========================================================================\n");

    return {
      updatedRange: res.data.updates?.updatedRange || "",
      updatedRows: res.data.updates?.updatedRows || 1,
    };
  } catch (err: any) {
    console.error("\n=================== GOOGLE SHEETS API ERROR ===================");
    console.error(`[Google Sheets Error] spreadsheets.values.append failed for sheet "${sheetName}":`);
    console.error(`[Google Sheets Error Message]:`, err.message || String(err));
    if (err.errors) {
      console.error(`[Google Sheets Error Details]:`, JSON.stringify(err.errors, null, 2));
    }
    console.error("===============================================================\n");
    handleGoogleApiError(err, spreadsheetId, sheetName);
    throw err;
  }
}

/**
 * 4. appendInvoiceItems: Appends line items to "Invoice Items" sheet
 */
export async function appendInvoiceItems(
  spreadsheetId: string,
  itemsSheetName: string,
  invoiceNumber: string,
  items: InvoiceLineItem[],
  sheetsClient?: sheets_v4.Sheets
): Promise<{ updatedRows: number }> {
  if (!items || items.length === 0) {
    return { updatedRows: 0 };
  }

  const sheets = sheetsClient || (await connectGoogleSheets({ spreadsheetId, itemsSheetName })).sheets;

  // Make sure sheet and headers exist
  await ensureWorksheet(sheets, spreadsheetId, itemsSheetName, ITEMS_SHEET_HEADERS);

  const rows = items.map((it) => [
    invoiceNumber || "",
    it.description || "",
    it.hsn || "",
    it.qty ?? 1,
    it.rate ?? 0,
    it.discount ?? 0,
    it.gstRate ?? 0,
    it.total ?? (it.qty * it.rate),
  ]);

  try {
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${itemsSheetName}'!A:H`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: rows,
      },
    });

    console.log(`[Google Sheets Append Items] Appended ${rows.length} item(s) for invoice "${invoiceNumber}" to sheet "${itemsSheetName}".`);
    return {
      updatedRows: res.data.updates?.updatedRows || rows.length,
    };
  } catch (err: any) {
    handleGoogleApiError(err, spreadsheetId, itemsSheetName);
    throw err;
  }
}

/**
 * Helper: Reads existing voucher numbers from the 21-column "Tally Data" sheet (Column B)
 */
export async function getExistingTallyDataVoucherNumbers(
  spreadsheetId: string,
  sheetName: string = "Tally Data",
  sheetsClient?: sheets_v4.Sheets
): Promise<string[]> {
  try {
    const sheets = sheetsClient || (await connectGoogleSheets({ spreadsheetId })).sheets;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!B:B`,
    });
    const rows = res.data.values || [];
    if (rows.length <= 1) return [];
    return rows.slice(1).map((r) => String(r[0] || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * 4. appendTallyDataRows: Appends 21-column item rows to the "Tally Data" Google Sheet tab.
 * EXACTLY 21 columns in EXACT order:
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
 *
 * NO OTHER COLUMNS. NO technical/internal columns.
 */
export async function appendTallyDataRows(
  spreadsheetId: string,
  sheetName: string = "Tally Data",
  rows: TallyImportRow[],
  sheetsClient?: sheets_v4.Sheets
): Promise<{ updatedRows: number }> {
  if (!rows || rows.length === 0) return { updatedRows: 0 };
  const sheets = sheetsClient || (await connectGoogleSheets({ spreadsheetId })).sheets;

  await ensureWorksheet(sheets, spreadsheetId, sheetName, TALLY_DATA_HEADERS);

  const formattedRows = rows.map((r) => [
    r.voucherDate || "",
    r.voucherNumber || "",
    r.voucherRefNo || "",
    r.partyName || "",
    r.state || "",
    r.gstNumber || "",
    typeof r.itemGstRate === "number" ? r.itemGstRate : (Number(r.itemGstRate) || 0),
    r.itemHsn || "",
    r.itemName || "",
    r.units || "",
    typeof r.quantity === "number" ? r.quantity : (Number(r.quantity) || 0),
    typeof r.rate === "number" ? r.rate : (Number(r.rate) || 0),
    typeof r.taxableAmount === "number" ? r.taxableAmount : (Number(r.taxableAmount) || 0),
    r.salesLedger || "",
    typeof r.igstValue === "number" ? r.igstValue : (Number(r.igstValue) || 0),
    typeof r.cgstValue === "number" ? r.cgstValue : (Number(r.cgstValue) || 0),
    typeof r.sgstValue === "number" ? r.sgstValue : (Number(r.sgstValue) || 0),
    r.itemDescription || "",
    r.narration || "",
    r.deliveryNote || "",
    r.deliveryNo || "",
  ]);

  try {
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${sheetName}'!A:U`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: formattedRows,
      },
    });

    console.log(`[Google Sheets Tally Data] Appended ${formattedRows.length} 21-column row(s) to "${sheetName}".`);
    return {
      updatedRows: res.data.updates?.updatedRows || formattedRows.length,
    };
  } catch (err: any) {
    handleGoogleApiError(err, spreadsheetId, sheetName);
    throw err;
  }
}

/**
 * Top-level function to export multiple documents or rows directly to "Tally Data" Google Sheet.
 */
export async function exportTallyDataToGoogleSheets(
  docsOrRows: DocumentRecord[] | TallyImportRow[],
  overrideConfig?: Partial<GoogleSheetsConfig>
): Promise<{ success: boolean; rowsCount: number; message: string }> {
  const cfg = { ...googleSheetsConfigService.getConfig(), ...overrideConfig };
  if (!cfg.spreadsheetId) {
    throw new Error("Google Spreadsheet ID is not configured.");
  }

  const { sheets } = await connectGoogleSheets(overrideConfig);
  const targetSheet = cfg.tallyDataSheetName || "Tally Data";

  let rowsToAppend: TallyImportRow[] = [];
  if (docsOrRows.length > 0 && "voucherDate" in docsOrRows[0] && "voucherNumber" in docsOrRows[0]) {
    rowsToAppend = docsOrRows as TallyImportRow[];
  } else {
    rowsToAppend = createTallyImportRows(docsOrRows as DocumentRecord[]);
  }

  if (rowsToAppend.length === 0) {
    return { success: true, rowsCount: 0, message: "No Tally Data rows to export." };
  }

  const result = await appendTallyDataRows(cfg.spreadsheetId, targetSheet, rowsToAppend, sheets);
  return {
    success: true,
    rowsCount: result.updatedRows,
    message: `Successfully saved ${result.updatedRows} row(s) to Google Sheets "${targetSheet}".`,
  };
}

/**
 * Legacy aliases for backwards compatibility
 */
export async function getExistingTallyInvoiceNumbers(
  spreadsheetId: string,
  sheetName: string = "Tally Data",
  sheetsClient?: sheets_v4.Sheets
): Promise<string[]> {
  return getExistingTallyDataVoucherNumbers(spreadsheetId, sheetName, sheetsClient);
}

export async function appendTallyExportRows(
  spreadsheetId: string,
  sheetName: string,
  rows: any[],
  sheetsClient?: sheets_v4.Sheets
): Promise<{ updatedRows: number }> {
  console.warn(`[Deprecated] appendTallyExportRows called for "${sheetName}". Please use appendTallyDataRows.`);
  return { updatedRows: 0 };
}

export async function appendTallyValidationRow(
  spreadsheetId: string,
  sheetName: string,
  vRow: any,
  sheetsClient?: sheets_v4.Sheets
): Promise<{ updatedRows: number }> {
  console.warn(`[Deprecated] appendTallyValidationRow called for "${sheetName}". Validation rows are not stored in separate Tally tabs.`);
  return { updatedRows: 0 };
}

/**
 * Reads the actual saved invoice row and its items from Google Sheets.
 */
export async function fetchInvoiceAndItemsFromGoogleSheets(
  invoiceNumber: string,
  overrideConfig?: Partial<GoogleSheetsConfig>,
  sheetsClient?: sheets_v4.Sheets
): Promise<{
  found: boolean;
  invoiceData?: GoogleSheetsInvoiceData;
  error?: string;
}> {
  if (!invoiceNumber || !invoiceNumber.trim()) {
    return { found: false, error: "Invoice number is required to search Google Sheets." };
  }

  const cleanInv = invoiceNumber.trim().toLowerCase();
  const cfg = overrideConfig
    ? { ...googleSheetsConfigService.getConfig(), ...overrideConfig }
    : googleSheetsConfigService.getConfig();

  if (!cfg.spreadsheetId) {
    return { found: false, error: "Google Spreadsheet ID is not configured." };
  }

  try {
    const sheets = sheetsClient || (await connectGoogleSheets(overrideConfig)).sheets;
    const sheetName = cfg.sheetName || "Invoices";
    const itemsSheetName = cfg.itemsSheetName || "Invoice Items";

    // 1. Fetch Invoices sheet rows
    const resInvoices = await sheets.spreadsheets.values.get({
      spreadsheetId: cfg.spreadsheetId,
      range: `'${sheetName}'!A:U`,
    });

    const rows = resInvoices.data.values || [];
    if (rows.length <= 1) {
      return { found: false, error: `No data found in sheet "${sheetName}".` };
    }

    const headerRow = rows[0] || [];
    let invColIdx = headerRow.findIndex(
      (h: any) => String(h).trim().toLowerCase() === "invoice number"
    );
    if (invColIdx === -1) invColIdx = 6; // Default to Column G

    let matchingRowIndex = -1;
    // Search backwards to get the most recently saved entry
    for (let i = rows.length - 1; i >= 1; i--) {
      const rowVal = String(rows[i]?.[invColIdx] || "").trim().toLowerCase();
      if (rowVal === cleanInv) {
        matchingRowIndex = i;
        break;
      }
    }

    if (matchingRowIndex === -1) {
      return { found: false, error: `Invoice "${invoiceNumber}" not found in Google Sheets "${sheetName}".` };
    }

    const r = rows[matchingRowIndex];
    const parseNum = (val: any) => {
      if (typeof val === "number") return val;
      const clean = String(val || "").replace(/[^0-9.-]/g, "");
      return clean ? parseFloat(clean) : 0;
    };

    // 2. Fetch Invoice Items sheet rows
    const itemRows: Array<{
      invoiceNumber: string;
      description: string;
      hsn: string;
      qty: number;
      rate: number;
      discount: number;
      gstRate: number;
      total: number;
    }> = [];

    try {
      const resItems = await sheets.spreadsheets.values.get({
        spreadsheetId: cfg.spreadsheetId,
        range: `'${itemsSheetName}'!A:H`,
      });

      const allItemRows = resItems.data.values || [];
      if (allItemRows.length > 1) {
        const itemHeader = allItemRows[0] || [];
        let itemInvIdx = itemHeader.findIndex(
          (h: any) => String(h).trim().toLowerCase() === "invoice number"
        );
        if (itemInvIdx === -1) itemInvIdx = 0;

        for (let j = 1; j < allItemRows.length; j++) {
          const itemRow = allItemRows[j];
          const itemInv = String(itemRow?.[itemInvIdx] || "").trim().toLowerCase();
          if (itemInv === cleanInv) {
            itemRows.push({
              invoiceNumber: String(itemRow?.[0] || invoiceNumber).trim(),
              description: String(itemRow?.[1] || "").trim(),
              hsn: String(itemRow?.[2] || "").trim(),
              qty: parseNum(itemRow?.[3]) || 1,
              rate: parseNum(itemRow?.[4]) || 0,
              discount: parseNum(itemRow?.[5]) || 0,
              gstRate: parseNum(itemRow?.[6]) || 0,
              total: parseNum(itemRow?.[7]) || 0,
            });
          }
        }
      }
    } catch (itemErr: any) {
      console.warn(`[Google Sheets Warning] Could not read items sheet "${itemsSheetName}":`, itemErr.message || itemErr);
    }

    const invoiceData: GoogleSheetsInvoiceData = {
      documentType: String(r[0] || "Invoice").trim(),
      vendorName: String(r[1] || "").trim(),
      vendorGstin: String(r[2] || "").trim(),
      vendorPan: String(r[3] || "").trim(),
      customerName: String(r[4] || "").trim(),
      customerGstin: String(r[5] || "").trim(),
      invoiceNumber: String(r[6] || invoiceNumber).trim(),
      invoiceDate: String(r[7] || "").trim(),
      dueDate: String(r[8] || "").trim(),
      poNumber: String(r[9] || "").trim(),
      currency: String(r[10] || "INR").trim(),
      paymentTerms: String(r[11] || "").trim(),
      subtotal: parseNum(r[12]),
      cgst: parseNum(r[13]),
      sgst: parseNum(r[14]),
      igst: parseNum(r[15]),
      totalTax: parseNum(r[16]),
      grandTotal: parseNum(r[17]),
      itemsCount: parseNum(r[18]) || itemRows.length,
      confidenceScore: String(r[19] || "95%").trim(),
      processedDate: String(r[20] || "").trim(),
      items: itemRows,
    };

    console.log(`[Google Sheets Fetch] Found invoice "${invoiceNumber}" at row ${matchingRowIndex + 1} with ${itemRows.length} item(s).`);
    return {
      found: true,
      invoiceData,
    };
  } catch (err: any) {
    console.error(`[Google Sheets Fetch Error] Failed to read invoice "${invoiceNumber}":`, err.message || err);
    return {
      found: false,
      error: err.message || "Failed to fetch invoice from Google Sheets",
    };
  }
}


/**
 * Top-level Orchestrator: exportInvoiceToGoogleSheets
 */
export async function exportInvoiceToGoogleSheets(
  doc: DocumentRecord,
  overrideConfig?: Partial<GoogleSheetsConfig>
): Promise<{
  success: boolean;
  duplicate: boolean;
  message: string;
  spreadsheetUrl?: string;
  invoiceNumber?: string;
}> {
  const cfg = { ...googleSheetsConfigService.getConfig(), ...overrideConfig };

  console.log("\n=================== GOOGLE SHEETS: exportInvoiceToGoogleSheets ===================");
  console.log(`[Google Sheets Target] Spreadsheet ID: "${cfg.spreadsheetId}" | Sheet Name: "${cfg.sheetName}"`);

  if (!cfg.spreadsheetId) {
    const errMsg = "Google Spreadsheet ID is not configured. Please enter your Spreadsheet ID in Settings.";
    console.error(`[Google Sheets Error]: ${errMsg}`);
    throw new Error(errMsg);
  }

  const { sheets, clientEmail } = await connectGoogleSheets(overrideConfig);
  console.log(`[Google Sheets Connection] Connected with Service Account: ${clientEmail}`);

  const data = doc.aiResult?.cleanedData || ({} as ExtractedInvoice);

  // Requirement 7: If the invoice number is missing, still save the row with "Missing Invoice Number" instead of skipping it
  const rawInvoiceNumber = data.invoiceNumber && String(data.invoiceNumber).trim();
  const invoiceNumber = rawInvoiceNumber || "Missing Invoice Number";

  console.log(`[Document Info] Document ID: "${doc.id}", File: "${doc.fileName}"`);
  console.log(`[Document Info] Resolved Invoice Number: "${invoiceNumber}" (Raw Extracted: "${data.invoiceNumber || "none"}")`);
  console.log(`[Document Info] Vendor: "${data.vendorName || "N/A"}", Grand Total: ₹${data.grandTotal ?? 0}`);

  // Requirement 6: Ensure duplicate detection does NOT prevent new invoices from being inserted.
  // Note: If invoice number is "Missing Invoice Number", checkDuplicateInvoice returns false so it is always inserted.
  const isDuplicate = await checkDuplicateInvoice(
    cfg.spreadsheetId,
    cfg.sheetName,
    {
      invoiceNumber,
      vendorName: data.vendorName,
      grandTotal: data.grandTotal,
    },
    sheets
  );

  if (isDuplicate) {
    console.log(`[Google Sheets Duplicate Skipped] True duplicate detected: Invoice "${invoiceNumber}" is already in sheet "${cfg.sheetName}".`);
    console.log("==================================================================================\n");
    return {
      success: true,
      duplicate: true,
      invoiceNumber,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${cfg.spreadsheetId}/edit`,
      message: `⚠️ Invoice #${invoiceNumber} is already recorded in Google Sheets. Skipped duplicate insertion.`,
    };
  }

  // Requirement 5: Temporarily disable any validation blocking the save so every processed invoice is saved.
  // All invoices are saved regardless of documentType, confidenceScore, or validation flags.

  // 2. Append Main Invoice Row
  await appendInvoice(
    cfg.spreadsheetId,
    cfg.sheetName,
    {
      documentType: doc.documentType || "Invoice",
      vendorName: data.vendorName || "",
      vendorGstin: data.vendorGstin || "",
      vendorPan: data.vendorPan || "",
      customerName: data.customerName || "",
      customerGstin: data.customerGstin || "",
      invoiceNumber,
      invoiceDate: data.invoiceDate || "",
      dueDate: data.dueDate || "",
      poNumber: data.poNumber || "",
      currency: data.currency || "INR",
      paymentTerms: data.notes || (data as any).paymentTerms || "",
      subtotal: data.subTotal ?? 0,
      cgst: data.cgstTotal ?? 0,
      sgst: data.sgstTotal ?? 0,
      igst: data.igstTotal ?? 0,
      totalTax: data.totalTax ?? 0,
      grandTotal: data.grandTotal ?? 0,
      itemsCount: data.items?.length ?? 0,
      confidenceScore: doc.confidenceScore || doc.aiResult?.overallConfidence || 95,
      processedDate: new Date().toISOString().replace("T", " ").substring(0, 19),
    },
    sheets
  );

  // 3. Append Line Items to "Invoice Items" sheet if present
  if (data.items && data.items.length > 0) {
    try {
      await appendInvoiceItems(
        cfg.spreadsheetId,
        cfg.itemsSheetName,
        invoiceNumber,
        data.items,
        sheets
      );
    } catch (itemsErr: any) {
      console.warn("[Google Sheets Warning] Line items append failed, but main invoice was saved:", itemsErr.message || itemsErr);
    }
  }

  // NOTE: Tally Data (21-column) is NOT written here.
  // The "Tally Data" sheet is only written when the user explicitly clicks
  // "Sync to Google Sheet" inside the Tally Data tab, or when running a manual sync.
  // The "Export to Tally" button generates a standalone Tally_Data_YYYY-MM-DD.xlsx file —
  // it does NOT write to Google Sheets at all.

  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${cfg.spreadsheetId}/edit`;
  console.log(`[Google Sheets] ✅ Invoice saved successfully to Google Sheets: ${spreadsheetUrl}`);
  console.log("==================================================================================\n");

  return {
    success: true,
    duplicate: false,
    invoiceNumber,
    spreadsheetUrl,
    message: "Invoice saved successfully to Google Sheets.",
  };
}

/**
 * 5. testGoogleSheetsConnection: Validates credentials and spreadsheet access
 */
export async function testGoogleSheetsConnection(
  overrideConfig?: Partial<GoogleSheetsConfig>
): Promise<{
  success: boolean;
  message: string;
  spreadsheetTitle?: string;
  clientEmail?: string;
  sheetsList?: string[];
}> {
  const cfg = { ...googleSheetsConfigService.getConfig(), ...overrideConfig };

  if (!cfg.spreadsheetId) {
    return {
      success: false,
      message: "❌ Google Spreadsheet ID is required.",
    };
  }

  try {
    const { sheets, clientEmail } = await connectGoogleSheets(overrideConfig);
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: cfg.spreadsheetId,
    });

    const sheetsList = (meta.data.sheets || []).map((s) => s.properties?.title || "");

    return {
      success: true,
      message: `✅ Successfully connected to Google Sheet "${meta.data.properties?.title || "Untitled"}"!`,
      spreadsheetTitle: meta.data.properties?.title || "Untitled Spreadsheet",
      clientEmail,
      sheetsList,
    };
  } catch (err: any) {
    console.error("[Google Sheets Test Connection Error]:", err);
    return {
      success: false,
      message: err.message || "❌ Google Sheets authentication failed.",
    };
  }
}

/**
 * Maps Google API errors to human-friendly actionable messages
 */
function handleGoogleApiError(err: any, spreadsheetId: string, sheetName?: string): never {
  const status = err.code || err.status;
  const msg = err.message || "";

  if (status === 404 || msg.includes("Requested entity was not found")) {
    throw new Error(
      `❌ Spreadsheet not found. Please verify that Spreadsheet ID "${spreadsheetId}" is correct.`
    );
  }

  if (status === 403 || msg.includes("The caller does not have permission")) {
    const email = googleSheetsConfigService.getSafeConfig().clientEmail || "your Service Account email";
    throw new Error(
      `❌ Google Sheets access denied (403). Please share your Google Sheet with '${email}' and give it 'Editor' permission.`
    );
  }

  if (msg.includes("Unable to parse range")) {
    throw new Error(
      `❌ Worksheet "${sheetName}" is invalid or could not be accessed in spreadsheet.`
    );
  }

  throw new Error(`❌ Google Sheets error: ${msg}`);
}
