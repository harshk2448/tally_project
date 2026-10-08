import fs from "fs";
import path from "path";

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  sheetName: string;
  itemsSheetName: string;
  tallyDataSheetName: string;
  tallyExportSheetName?: string;
  tallyValidationSheetName?: string;
  companyGstin?: string;
  companyName?: string;
  defaultPurchaseLedger?: string;
  defaultSalesLedger?: string;
  autoExport: boolean;
  serviceAccountKey: Record<string, any> | null;
}

export interface SafeGoogleSheetsConfig {
  spreadsheetId: string;
  sheetName: string;
  itemsSheetName: string;
  tallyDataSheetName: string;
  tallyExportSheetName?: string;
  tallyValidationSheetName?: string;
  companyGstin?: string;
  companyName?: string;
  defaultPurchaseLedger?: string;
  defaultSalesLedger?: string;
  autoExport: boolean;
  isConfigured: boolean;
  clientEmail: string | null;
  projectId: string | null;
  spreadsheetUrl: string | null;
}

const CONFIG_FILE_PATH = path.join(process.cwd(), ".sheets-config.json");

export class GoogleSheetsConfigService {
  private config: GoogleSheetsConfig | null = null;

  constructor() {
    this.loadConfig();
  }

  private loadConfig(): GoogleSheetsConfig {
    let fileData: Partial<GoogleSheetsConfig> = {};
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      try {
        const raw = fs.readFileSync(CONFIG_FILE_PATH, "utf-8");
        fileData = JSON.parse(raw);
      } catch (err) {
        console.error("[Google Sheets Config] Failed to read .sheets-config.json:", err);
      }
    }

    // Read service account from env or file
    let serviceAccountKey = fileData.serviceAccountKey || null;
    if (!serviceAccountKey && process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      try {
        serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
      } catch {
        console.warn("[Google Sheets Config] Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY from env.");
      }
    }

    this.config = {
      spreadsheetId: fileData.spreadsheetId || process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "",
      sheetName: fileData.sheetName || process.env.GOOGLE_SHEETS_SHEET_NAME || "Invoices",
      itemsSheetName: fileData.itemsSheetName || process.env.GOOGLE_SHEETS_ITEMS_SHEET_NAME || "Invoice Items",
      tallyDataSheetName: fileData.tallyDataSheetName || process.env.TALLY_DATA_SHEET_NAME || "Tally Data",
      tallyExportSheetName: fileData.tallyExportSheetName || process.env.TALLY_EXPORT_SHEET_NAME || "Tally Export",
      tallyValidationSheetName: fileData.tallyValidationSheetName || process.env.TALLY_VALIDATION_SHEET_NAME || "Tally Validation",
      companyGstin: fileData.companyGstin || process.env.COMPANY_GSTIN || "",
      companyName: fileData.companyName || process.env.COMPANY_NAME || "",
      defaultPurchaseLedger: fileData.defaultPurchaseLedger || "Purchase Accounts",
      defaultSalesLedger: fileData.defaultSalesLedger || "Sales Accounts",
      autoExport: fileData.autoExport ?? (process.env.GOOGLE_SHEETS_AUTO_EXPORT === "true"),
      serviceAccountKey,
    };

    return this.config;
  }

  public getConfig(): GoogleSheetsConfig {
    if (!this.config) {
      return this.loadConfig();
    }
    return this.config;
  }

  public isAutoExportEnabled(): boolean {
    const cfg = this.getConfig();
    return Boolean(cfg.autoExport && cfg.spreadsheetId && cfg.serviceAccountKey);
  }

  public getSafeConfig(): SafeGoogleSheetsConfig {
    const cfg = this.getConfig();
    const hasKey = Boolean(
      cfg.serviceAccountKey &&
      cfg.serviceAccountKey.client_email &&
      cfg.serviceAccountKey.private_key
    );

    return {
      spreadsheetId: cfg.spreadsheetId,
      sheetName: cfg.sheetName || "Invoices",
      itemsSheetName: cfg.itemsSheetName || "Invoice Items",
      tallyDataSheetName: cfg.tallyDataSheetName || "Tally Data",
      tallyExportSheetName: cfg.tallyExportSheetName,
      tallyValidationSheetName: cfg.tallyValidationSheetName,
      companyGstin: cfg.companyGstin || "",
      companyName: cfg.companyName || "",
      defaultPurchaseLedger: cfg.defaultPurchaseLedger || "Purchase Accounts",
      defaultSalesLedger: cfg.defaultSalesLedger || "Sales Accounts",
      autoExport: cfg.autoExport,
      isConfigured: Boolean(hasKey && cfg.spreadsheetId),
      clientEmail: cfg.serviceAccountKey?.client_email || null,
      projectId: cfg.serviceAccountKey?.project_id || null,
      spreadsheetUrl: cfg.spreadsheetId
        ? `https://docs.google.com/spreadsheets/d/${cfg.spreadsheetId}/edit`
        : null,
    };
  }

  public saveConfig(updates: Partial<GoogleSheetsConfig>): SafeGoogleSheetsConfig {
    const current = this.getConfig();

    const newConfig: GoogleSheetsConfig = {
      ...current,
      ...updates,
      spreadsheetId: updates.spreadsheetId !== undefined ? updates.spreadsheetId.trim() : current.spreadsheetId,
      sheetName: updates.sheetName !== undefined ? updates.sheetName.trim() : current.sheetName,
      itemsSheetName: updates.itemsSheetName !== undefined ? updates.itemsSheetName.trim() : current.itemsSheetName,
      tallyDataSheetName: updates.tallyDataSheetName !== undefined ? updates.tallyDataSheetName.trim() : (current.tallyDataSheetName || "Tally Data"),
      tallyExportSheetName: updates.tallyExportSheetName !== undefined ? updates.tallyExportSheetName.trim() : current.tallyExportSheetName,
      tallyValidationSheetName: updates.tallyValidationSheetName !== undefined ? updates.tallyValidationSheetName.trim() : current.tallyValidationSheetName,
      companyGstin: updates.companyGstin !== undefined ? updates.companyGstin.trim().toUpperCase() : current.companyGstin,
      companyName: updates.companyName !== undefined ? updates.companyName.trim() : current.companyName,
      defaultPurchaseLedger: updates.defaultPurchaseLedger !== undefined ? updates.defaultPurchaseLedger.trim() : current.defaultPurchaseLedger,
      defaultSalesLedger: updates.defaultSalesLedger !== undefined ? updates.defaultSalesLedger.trim() : current.defaultSalesLedger,
      autoExport: updates.autoExport !== undefined ? Boolean(updates.autoExport) : current.autoExport,
      serviceAccountKey: updates.serviceAccountKey !== undefined ? updates.serviceAccountKey : current.serviceAccountKey,
    };

    try {
      fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(newConfig, null, 2), "utf-8");
      this.config = newConfig;
      console.log("[Google Sheets Config] Settings securely saved to server storage.");
    } catch (err) {
      console.error("[Google Sheets Config] Failed to persist .sheets-config.json:", err);
      throw new Error("Failed to save Google Sheets configuration on server.");
    }

    return this.getSafeConfig();
  }
}

export const googleSheetsConfigService = new GoogleSheetsConfigService();
