import * as XLSX from "xlsx";
import {
  TallyProfile,
  TallyCustomTemplate,
  TallyTemplateColumnMapping,
  TallyStandardFieldKey,
  TALLY_FIELD_MAPPINGS,
} from "@/types/tally";
import { DEFAULT_ABC_COMPANY_PROFILE, DEFAULT_GENERIC_PROFILE } from "@/lib/tally-defaults";

export { DEFAULT_ABC_COMPANY_PROFILE, DEFAULT_GENERIC_PROFILE };

const getFs = () => {
  if (typeof window !== "undefined") return null;
  try {
    return require("fs");
  } catch {
    return null;
  }
};

const getPath = () => {
  if (typeof window !== "undefined") return null;
  try {
    return require("path");
  } catch {
    return null;
  }
};

const getProfilesFilePath = () => {
  const p = getPath();
  return p ? p.join(process.cwd(), ".tally-profiles.json") : ".tally-profiles.json";
};

const getOldMastersFilePath = () => {
  const p = getPath();
  return p ? p.join(process.cwd(), ".tally-masters.json") : ".tally-masters.json";
};

interface ProfilesFileStructure {
  activeProfileId: string;
  profiles: TallyProfile[];
}

export class TallyProfileService {
  private cache: ProfilesFileStructure | null = null;

  constructor() {
    this.loadProfiles();
  }

  private loadProfiles(): ProfilesFileStructure {
    const fs = getFs();
    const profilesFilePath = getProfilesFilePath();
    const oldMastersFilePath = getOldMastersFilePath();

    if (fs && fs.existsSync(profilesFilePath)) {
      try {
        const raw = fs.readFileSync(profilesFilePath, "utf-8");
        const parsed: ProfilesFileStructure = JSON.parse(raw);
        if (parsed.profiles && Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
          this.cache = parsed;
          return this.cache;
        }
      } catch (err) {
        console.error("[Tally Profile Service] Failed to read .tally-profiles.json:", err);
      }
    }

    // Attempt migration from old .tally-masters.json if present
    const abcProfile = { ...DEFAULT_ABC_COMPANY_PROFILE };
    if (fs && fs.existsSync(oldMastersFilePath)) {
      try {
        const rawOld = fs.readFileSync(oldMastersFilePath, "utf-8");
        const parsedOld = JSON.parse(rawOld);
        if (parsedOld.partyMappings) {
          abcProfile.partyMappings = { ...abcProfile.partyMappings, ...parsedOld.partyMappings };
        }
        if (parsedOld.stockItemMappings) {
          abcProfile.stockItemMappings = { ...abcProfile.stockItemMappings, ...parsedOld.stockItemMappings };
        }
        if (parsedOld.unitMappings) {
          abcProfile.unitMappings = { ...abcProfile.unitMappings, ...parsedOld.unitMappings };
        }
        if (parsedOld.defaultPurchaseLedger) {
          abcProfile.ledgers.purchaseLedger = parsedOld.defaultPurchaseLedger;
        }
        if (parsedOld.defaultSalesLedger) {
          abcProfile.ledgers.salesLedger = parsedOld.defaultSalesLedger;
        }
      } catch (e) {
        console.warn("[Tally Profile Service] Migration from old masters failed:", e);
      }
    }

    this.cache = {
      activeProfileId: abcProfile.id,
      profiles: [abcProfile, DEFAULT_GENERIC_PROFILE],
    };
    this.persistCache();
    return this.cache;
  }

  private persistCache() {
    if (!this.cache) return;
    const fs = getFs();
    if (!fs) return;
    try {
      fs.writeFileSync(getProfilesFilePath(), JSON.stringify(this.cache, null, 2), "utf-8");
    } catch (err) {
      console.error("[Tally Profile Service] Failed to write .tally-profiles.json:", err);
    }
  }

  public getProfiles(): TallyProfile[] {
    if (!this.cache) this.loadProfiles();
    return this.cache?.profiles || [DEFAULT_ABC_COMPANY_PROFILE];
  }

  public getProfileById(id?: string | null): TallyProfile {
    const profiles = this.getProfiles();
    if (id) {
      const found = profiles.find((p) => p.id === id);
      if (found) return found;
    }
    return this.getActiveProfile();
  }

  public getActiveProfile(): TallyProfile {
    if (!this.cache) this.loadProfiles();
    const activeId = this.cache?.activeProfileId;
    const profiles = this.getProfiles();
    const active = profiles.find((p) => p.id === activeId);
    return active || profiles[0] || DEFAULT_ABC_COMPANY_PROFILE;
  }

  public setActiveProfile(id: string): TallyProfile {
    const profiles = this.getProfiles();
    const target = profiles.find((p) => p.id === id);
    if (!target) {
      throw new Error(`Tally profile '${id}' not found.`);
    }

    if (!this.cache) this.loadProfiles();
    this.cache!.activeProfileId = id;
    this.persistCache();
    return target;
  }

  public saveProfile(profile: TallyProfile): TallyProfile {
    if (!profile.id) {
      profile.id = `profile_${Date.now()}`;
    }
    profile.updatedAt = new Date().toISOString();

    const profiles = this.getProfiles();
    const idx = profiles.findIndex((p) => p.id === profile.id);

    if (idx >= 0) {
      profiles[idx] = { ...profiles[idx], ...profile };
    } else {
      if (!profile.createdAt) profile.createdAt = new Date().toISOString();
      profiles.push(profile);
    }

    if (!this.cache) this.loadProfiles();
    this.cache!.profiles = profiles;
    this.persistCache();
    return profile;
  }

  public createProfile(data: {
    name: string;
    companyName?: string;
    companyGstin?: string;
    purchaseLedger?: string;
    salesLedger?: string;
    cloneFromId?: string;
  }): TallyProfile {
    const base = data.cloneFromId ? this.getProfileById(data.cloneFromId) : DEFAULT_ABC_COMPANY_PROFILE;

    const newProfile: TallyProfile = {
      ...JSON.parse(JSON.stringify(base)),
      id: `profile_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: data.name,
      companyName: data.companyName || data.name,
      companyGstin: data.companyGstin || "",
      isDefault: false,
      ledgers: {
        ...base.ledgers,
        purchaseLedger: data.purchaseLedger || base.ledgers.purchaseLedger,
        salesLedger: data.salesLedger || base.ledgers.salesLedger,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return this.saveProfile(newProfile);
  }

  public deleteProfile(id: string): boolean {
    const profiles = this.getProfiles();
    if (profiles.length <= 1) {
      throw new Error("Cannot delete the only remaining Tally profile.");
    }

    const filtered = profiles.filter((p) => p.id !== id);
    if (filtered.length === profiles.length) return false;

    if (!this.cache) this.loadProfiles();
    this.cache!.profiles = filtered;
    if (this.cache!.activeProfileId === id) {
      this.cache!.activeProfileId = filtered[0].id;
    }
    this.persistCache();
    return true;
  }

  /**
   * Step 10: Parse user-provided Tally sample Excel template
   * Reads headers and generates suggested column bindings.
   */
  public parseExcelTemplate(buffer: Buffer | Uint8Array, fileName?: string): TallyCustomTemplate {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) {
      throw new Error("Uploaded Excel file contains no worksheets.");
    }

    const ws = wb.Sheets[firstSheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (!data || data.length === 0) {
      throw new Error("Worksheet contains no data or headers.");
    }

    // Find the header row (first non-empty row with strings)
    let headerRowIdx = 0;
    while (headerRowIdx < data.length && (!data[headerRowIdx] || data[headerRowIdx].length === 0)) {
      headerRowIdx++;
    }

    const rawHeaders: string[] = (data[headerRowIdx] || [])
      .map((h) => String(h || "").trim())
      .filter((h) => h.length > 0);

    if (rawHeaders.length === 0) {
      throw new Error("Could not detect any column headers in uploaded file.");
    }

    const columns: TallyTemplateColumnMapping[] = rawHeaders.map((colName) => {
      const clean = colName.toLowerCase();
      let mappedField: TallyStandardFieldKey | "IGNORE" = "IGNORE";

      if (clean.includes("voucher type") || clean.includes("vch type")) {
        mappedField = "voucherType";
      } else if (clean.includes("date") || clean.includes("vch date") || clean.includes("invoice date")) {
        mappedField = "voucherDate";
      } else if (clean.includes("voucher no") || clean.includes("vch no") || clean.includes("inv no") || clean.includes("invoice number")) {
        mappedField = "voucherNumber";
      } else if (clean.includes("ref") || clean.includes("supplier inv") || clean.includes("order no")) {
        mappedField = "referenceNumber";
      } else if (clean.includes("party") || clean.includes("vendor") || clean.includes("customer") || clean.includes("account")) {
        mappedField = "partyLedger";
      } else if (clean.includes("gstin") || clean.includes("gst no")) {
        mappedField = "partyGstin";
      } else if (clean.includes("purchase ledger") || clean.includes("sales ledger") || clean.includes("particulars")) {
        mappedField = "purchaseSalesLedger";
      } else if (clean.includes("item") || clean.includes("description") || clean.includes("stock")) {
        mappedField = "stockItem";
      } else if (clean.includes("hsn") || clean.includes("sac")) {
        mappedField = "hsnSac";
      } else if (clean.includes("qty") || clean.includes("quantity") || clean.includes("billed qty")) {
        mappedField = "quantity";
      } else if (clean.includes("unit") || clean.includes("uom")) {
        mappedField = "unit";
      } else if (clean.includes("rate") || clean.includes("price") || clean.includes("unit price")) {
        mappedField = "rate";
      } else if (clean.includes("taxable") || clean.includes("basic") || clean.includes("assessable") || clean.includes("amount")) {
        mappedField = "taxableAmount";
      } else if (clean.includes("cgst")) {
        mappedField = "cgstAmount";
      } else if (clean.includes("sgst")) {
        mappedField = "sgstAmount";
      } else if (clean.includes("igst")) {
        mappedField = "igstAmount";
      } else if (clean.includes("total tax") || clean.includes("tax amount")) {
        mappedField = "totalTax";
      } else if (clean.includes("item total") || clean.includes("line total")) {
        mappedField = "itemTotal";
      } else if (clean.includes("grand total") || clean.includes("net amount") || clean.includes("invoice total")) {
        mappedField = "grandTotal";
      } else if (clean.includes("narration") || clean.includes("remarks")) {
        mappedField = "narration";
      } else if (clean.includes("po") || clean.includes("purchase order")) {
        mappedField = "poNumber";
      } else if (clean.includes("due date")) {
        mappedField = "dueDate";
      }

      return {
        excelColumn: colName,
        mappedField,
      };
    });

    return {
      templateName: fileName ? fileName.replace(/\.[^/.]+$/, "") : "Custom Tally Import Template",
      sourceFileName: fileName,
      sheetName: firstSheetName,
      columns,
      uploadedAt: new Date().toISOString(),
    };
  }

  /**
   * Helper to map a line item or party into active profile in 1-click
   */
  public addMapping(
    profileId: string,
    type: "party" | "stock" | "unit" | "tax",
    key: string,
    value: string
  ): TallyProfile {
    const profile = this.getProfileById(profileId);
    const cleanKey = key.trim();
    const cleanVal = value.trim();

    if (!cleanKey || !cleanVal) return profile;

    if (type === "party") {
      profile.partyMappings[cleanKey] = cleanVal;
    } else if (type === "stock") {
      profile.stockItemMappings[cleanKey] = cleanVal;
    } else if (type === "unit") {
      profile.unitMappings[cleanKey.toUpperCase()] = cleanVal.toUpperCase();
    }

    return this.saveProfile(profile);
  }
}

export const tallyProfileService = new TallyProfileService();
