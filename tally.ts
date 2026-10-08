export type TallyVoucherType = "Purchase" | "Sales" | "REQUIRES_VALIDATION";

export type TallyVoucherStatus =
  | "READY"
  | "NEEDS_MAPPING"
  | "NEEDS_REVIEW"
  | "INVALID"
  | "EXPORTED"
  | "DUPLICATE";

/**
 * Canonical 21-Column Tally Import Flat Table
 * Single source of truth for Tally Data UI and Excel export.
 */
export const TALLY_IMPORT_COLUMNS = [
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

export type TallyImportColumnName = typeof TALLY_IMPORT_COLUMNS[number];

export interface TallyImportRow {
  id?: string;
  documentId?: string;
  voucherDate: string;        // 1. Voucher Date (formatted date, e.g. 04-Jun-26, strictly from invoice date)
  voucherNumber: string;      // 2. Voucher Number
  voucherRefNo: string;       // 3. Voucher Ref. No
  partyName: string;          // 4. Party Name
  state: string;              // 5. State
  gstNumber: string;          // 6. GST Number
  itemGstRate: number;        // 7. ITEM GST RATE (numeric)
  itemHsn: string;            // 8. ITEM HSN
  itemName: string;           // 9. Item Name
  units: string;              // 10. Units (e.g. PCS)
  quantity: number;           // 11. Quantity (numeric)
  rate: number;               // 12. Rate (numeric)
  taxableAmount: number;      // 13. TAXABLE AMOUNT (numeric)
  salesLedger: string;        // 14. SALES LEDGER
  igstValue: number;          // 15. IGST VALUE (numeric)
  cgstValue: number;          // 16. CGST VALUE (numeric)
  sgstValue: number;          // 17. SGST VALUE (numeric)
  itemDescription: string;    // 18. ITEM DESCRIPTION
  narration: string;          // 19. NARRATION
  deliveryNote: string;       // 20. Delivery Note
  deliveryNo: string;         // 21. Delivery No.
}

export interface TallyLedgerEntry {
  ledgerName: string;
  amount: number;
  isDebit: boolean;
  narration?: string;
}

export interface TallyInventoryEntry {
  itemName: string;
  stockItemName: string;
  hsnSac: string;
  quantity: number;
  unit: string;
  rate: number;
  discount?: number;
  taxableAmount: number; // Basic taxable amount strictly excluding taxes
  gstRate: number;
  cgstRate?: number;
  cgst: number;
  sgstRate?: number;
  sgst: number;
  igstRate?: number;
  igst: number;
  total: number; // Strictly line item total = Taxable + Item Taxes (never voucher grand total)
  isMapped?: boolean; // Whether stock item is explicitly mapped in active profile
  description?: string;
}

export interface TallyParty {
  name: string;
  ledgerName: string;
  gstin: string;
  pan?: string;
  state: string;
  stateCode: string;
  placeOfSupply: string;
  supplyType: "Intrastate" | "Interstate";
  isMapped?: boolean; // Whether party is explicitly mapped in active profile
}

export interface TallyTaxBreakdown {
  taxableAmount: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalTax: number;
}

export interface TallyAccountingBalance {
  totalDebit: number;
  totalCredit: number;
  difference: number;
  isBalanced: boolean;
}

export interface TallyItem {
  itemName: string;
  hsnSac: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number; // Basic taxable amount strictly excluding tax
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  total: number; // Line item total strictly (Taxable + Item Tax)
  isMapped?: boolean;
}

export interface TallyTax {
  ledgerName: string;
  taxType: "CGST" | "SGST" | "IGST";
  rate: number;
  amount: number;
  isMapped?: boolean;
}

export interface TallyVoucher {
  voucherId: string; // e.g. "V001"
  voucherType: "Purchase" | "Sales";
  voucherDate: string; // DD-MM-YYYY
  voucherNumber: string;
  referenceNumber: string;
  referenceDate?: string;
  party: TallyParty;
  ledgerEntries: TallyLedgerEntry[];
  inventoryEntries: TallyInventoryEntry[];
  tax: TallyTaxBreakdown;
  totals: {
    taxableAmount: number; // Sum of line item taxable amounts
    taxAmount: number;     // Sum of tax entries
    roundOff: number;      // Rounding adjustment (+/-)
    grandTotal: number;    // Subtotal + Total Tax + RoundOff
    calculatedTotal: number;
    isTotalMatched: boolean;
    discrepancy?: number;
  };
  accountingBalance: TallyAccountingBalance;
  status: TallyVoucherStatus;
  narration: string;
  placeOfSupply?: string;
  supplyType?: "Intrastate" | "Interstate";
  poNumber?: string;
  dueDate?: string;
  paymentTerms?: string;
  deliveryNote?: string;
  deliveryNo?: string;
  validationErrors: string[];
  warnings: string[];
  profileId?: string;
  profileName?: string;
}

export interface TallyInvoice extends TallyVoucher {
  partyName: string;
  partyGSTIN: string;
  purchaseLedger?: string;
  salesLedger?: string;
  items: TallyItem[];
  taxLedgers: TallyTax[];
  subtotal: number;
  totalTax: number;
  grandTotal: number;
  validationMessage?: string;
}

// -------------------------------------------------------------
// TALLY PROFILE & MULTI-COMPANY CONFIGURATION (Steps 4 & 5)
// -------------------------------------------------------------

export interface TallyTaxLedgerMapping {
  inputCgst: Record<string, string>;  // e.g. "9": "Input CGST @ 9%", "default": "Input CGST"
  inputSgst: Record<string, string>;  // e.g. "9": "Input SGST @ 9%", "default": "Input SGST"
  inputIgst: Record<string, string>;  // e.g. "18": "Input IGST @ 18%", "default": "Input IGST"
  outputCgst: Record<string, string>; // e.g. "9": "Output CGST @ 9%", "default": "Output CGST"
  outputSgst: Record<string, string>; // e.g. "9": "Output SGST @ 9%", "default": "Output SGST"
  outputIgst: Record<string, string>; // e.g. "18": "Output IGST @ 18%", "default": "Output IGST"
}

export type TallyStandardFieldKey =
  | "voucherType"
  | "voucherDate"
  | "voucherNumber"
  | "referenceNumber"
  | "partyLedger"
  | "partyGstin"
  | "purchaseSalesLedger"
  | "stockItem"
  | "hsnSac"
  | "quantity"
  | "unit"
  | "rate"
  | "taxableAmount"
  | "cgstAmount"
  | "sgstAmount"
  | "igstAmount"
  | "totalTax"
  | "itemTotal"
  | "grandTotal"
  | "narration"
  | "poNumber"
  | "dueDate";

export interface TallyTemplateColumnMapping {
  excelColumn: string;
  mappedField: TallyStandardFieldKey | "STATIC" | "IGNORE";
  staticValue?: string;
}

export interface TallyCustomTemplate {
  templateName: string;
  sourceFileName?: string;
  sheetName?: string;
  columns: TallyTemplateColumnMapping[];
  uploadedAt?: string;
}

export interface TallyProfile {
  id: string;
  name: string; // e.g. "ABC Company" or "TechCorp Client"
  isDefault?: boolean;
  companyName: string;
  companyGstin: string;
  voucherTypes: {
    purchase: string; // e.g. "Purchase"
    sales: string;    // e.g. "Sales"
  };
  ledgers: {
    purchaseLedger: string; // e.g. "Purchase Accounts"
    salesLedger: string;    // e.g. "Sales Accounts"
    roundOffLedger: string; // e.g. "Round Off"
  };
  taxLedgers: TallyTaxLedgerMapping;
  partyMappings: Record<string, string>;      // OCR Vendor/Customer Name -> Tally Party Ledger
  stockItemMappings: Record<string, string>;  // OCR Item Description -> Tally Stock Item Master
  unitMappings: Record<string, string>;       // OCR UOM (PCS, PKG, etc.) -> Tally Official Unit (NOS, BOX, etc.)
  customTemplate?: TallyCustomTemplate;      // Optional user-uploaded sample Excel template mapping
  createdAt?: string;
  updatedAt?: string;
}

export interface TallyMasterMapping {
  partyMappings: Record<string, string>;
  stockItemMappings: Record<string, string>;
  unitMappings: Record<string, string>;
  taxLedgerMappings: Record<string, string>;
  defaultPurchaseLedger: string;
  defaultSalesLedger: string;
}

export interface MissingMasterInfo {
  type: "party" | "item" | "tax" | "unit" | "ledger";
  sourceName: string;
  suggestedName?: string;
  reason: string;
}

export interface TallyValidationChecks {
  isVoucherTypeValid: boolean;
  isPartyMapped: boolean;
  areItemsMapped: boolean;
  areUnitsMapped: boolean;
  areLedgersMapped: boolean;
  areTaxLedgersMapped: boolean;
  isDebitCreditBalanced: boolean;
  isMathBalanced: boolean;
}

export interface TallyValidationResult {
  isValid: boolean;
  status: "READY" | "NEEDS_MAPPING" | "REQUIRES_VALIDATION" | "AMOUNT_MISMATCH" | "INVALID";
  errors: string[];
  warnings: string[];
  voucherType: TallyVoucherType;
  isVoucherTypeConfident: boolean;
  missingMasters: MissingMasterInfo[];
  checks: TallyValidationChecks;
  mathDetails: {
    subtotal: number;
    cgst: number;
    sgst: number;
    igst: number;
    totalTax: number;
    grandTotal: number;
    computedTotal: number;
    discrepancy: number;
    isBalanced: boolean;
  };
  accountingBalance: TallyAccountingBalance;
}

export interface TallyExportCheckSummary {
  invoiceId: string;
  invoiceNumber: string;
  voucherType: string;
  party: string;
  itemCount: number;
  taxCount: number;
  grandTotal: number;
  excelRowsGenerated: number;
  excelFileSizeKb: number;
  status: "READY" | "NEEDS_MAPPING" | "FAILED";
  message: string;
}

export interface TallyFieldMappingDef {
  excelColumn: string;
  tallyField: string;
  category: "Voucher Header" | "Party & Ledger" | "Stock Item" | "Tax Ledger" | "Additional";
  dataType: "Text" | "Number" | "Date";
  description: string;
}

export const TALLY_FIELD_MAPPINGS: TallyFieldMappingDef[] = [
  {
    excelColumn: "Voucher Type",
    tallyField: "Voucher Type Name",
    category: "Voucher Header",
    dataType: "Text",
    description: "Voucher type in Tally (Purchase or Sales)",
  },
  {
    excelColumn: "Voucher Date",
    tallyField: "Voucher Date",
    category: "Voucher Header",
    dataType: "Date",
    description: "Transaction date formatted as DD-MM-YYYY",
  },
  {
    excelColumn: "Invoice Number",
    tallyField: "Voucher Number",
    category: "Voucher Header",
    dataType: "Text",
    description: "Primary voucher number identifier",
  },
  {
    excelColumn: "Reference Number",
    tallyField: "Supplier Invoice No / Ref",
    category: "Voucher Header",
    dataType: "Text",
    description: "Original supplier invoice number or PO reference",
  },
  {
    excelColumn: "Party Name",
    tallyField: "Party Ledger",
    category: "Party & Ledger",
    dataType: "Text",
    description: "Sundry Creditor / Debtor ledger name in Tally",
  },
  {
    excelColumn: "Party GSTIN",
    tallyField: "Party GSTIN",
    category: "Party & Ledger",
    dataType: "Text",
    description: "15-digit GSTIN of the party",
  },
  {
    excelColumn: "Sales/Purchase Ledger",
    tallyField: "Purchase / Sales Ledger",
    category: "Party & Ledger",
    dataType: "Text",
    description: "Accounting ledger (e.g. Purchase Accounts, Sales Accounts)",
  },
  {
    excelColumn: "Item Name",
    tallyField: "Stock Item",
    category: "Stock Item",
    dataType: "Text",
    description: "Stock item master name defined in Tally",
  },
  {
    excelColumn: "HSN/SAC",
    tallyField: "HSN/SAC Code",
    category: "Stock Item",
    dataType: "Text",
    description: "Harmonized system nomenclature code",
  },
  {
    excelColumn: "Quantity",
    tallyField: "Billed Quantity",
    category: "Stock Item",
    dataType: "Number",
    description: "Pure numeric billed quantity (no text)",
  },
  {
    excelColumn: "Unit",
    tallyField: "Units of Measure",
    category: "Stock Item",
    dataType: "Text",
    description: "UOM matching Tally master (e.g. NOS, PCS, KGS)",
  },
  {
    excelColumn: "Rate",
    tallyField: "Rate",
    category: "Stock Item",
    dataType: "Number",
    description: "Unit price per item strictly excluding tax",
  },
  {
    excelColumn: "Amount",
    tallyField: "Amount (Taxable Value)",
    category: "Stock Item",
    dataType: "Number",
    description: "Total basic taxable value strictly excluding tax",
  },
  {
    excelColumn: "CGST",
    tallyField: "CGST Ledger & Amount",
    category: "Tax Ledger",
    dataType: "Number",
    description: "Central GST amount posted to CGST tax ledger",
  },
  {
    excelColumn: "SGST",
    tallyField: "SGST Ledger & Amount",
    category: "Tax Ledger",
    dataType: "Number",
    description: "State GST amount posted to SGST tax ledger",
  },
  {
    excelColumn: "IGST",
    tallyField: "IGST Ledger & Amount",
    category: "Tax Ledger",
    dataType: "Number",
    description: "Integrated GST amount posted to IGST tax ledger",
  },
  {
    excelColumn: "Total Tax",
    tallyField: "Total Tax Amount",
    category: "Tax Ledger",
    dataType: "Number",
    description: "Sum of CGST + SGST + IGST",
  },
  {
    excelColumn: "Item Total",
    tallyField: "Line Item Total",
    category: "Stock Item",
    dataType: "Number",
    description: "Line item total strictly excluding invoice grand total",
  },
  {
    excelColumn: "Grand Total",
    tallyField: "Total Voucher Amount",
    category: "Voucher Header",
    dataType: "Number",
    description: "Invoice grand total (Subtotal + Taxes + RoundOff)",
  },
  {
    excelColumn: "Narration",
    tallyField: "Narration",
    category: "Voucher Header",
    dataType: "Text",
    description: "Audit narration with invoice details and PO number",
  },
];
