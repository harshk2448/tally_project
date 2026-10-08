import { TallyMasterMapping, MissingMasterInfo, TallyProfile } from "@/types/tally";
import { ExtractedInvoice } from "@/types/document";
import { DEFAULT_ABC_COMPANY_PROFILE } from "@/lib/tally-defaults";

const getProfileService = () => {
  try {
    const { tallyProfileService } = require("./tally-profile.service");
    return tallyProfileService;
  } catch {
    return null;
  }
};

export class TallyMappingService {
  /**
   * Returns mappings for backwards compatibility, sourcing from the active TallyProfile.
   */
  public getMappings(profile?: TallyProfile): TallyMasterMapping {
    const activeProfile = profile || getProfileService()?.getActiveProfile() || DEFAULT_ABC_COMPANY_PROFILE;
    return {
      partyMappings: activeProfile.partyMappings,
      stockItemMappings: activeProfile.stockItemMappings,
      unitMappings: activeProfile.unitMappings,
      taxLedgerMappings: this.convertProfileTaxLedgersToFlat(activeProfile),
      defaultPurchaseLedger: activeProfile.ledgers.purchaseLedger,
      defaultSalesLedger: activeProfile.ledgers.salesLedger,
    };
  }

  private convertProfileTaxLedgersToFlat(profile: TallyProfile): Record<string, string> {
    const flat: Record<string, string> = {};
    const tl = profile.taxLedgers;

    Object.entries(tl.inputCgst || {}).forEach(([rate, name]) => {
      flat[`PURCHASE_CGST_${rate}`] = name;
    });
    Object.entries(tl.inputSgst || {}).forEach(([rate, name]) => {
      flat[`PURCHASE_SGST_${rate}`] = name;
    });
    Object.entries(tl.inputIgst || {}).forEach(([rate, name]) => {
      flat[`PURCHASE_IGST_${rate}`] = name;
    });
    Object.entries(tl.outputCgst || {}).forEach(([rate, name]) => {
      flat[`SALES_CGST_${rate}`] = name;
    });
    Object.entries(tl.outputSgst || {}).forEach(([rate, name]) => {
      flat[`SALES_SGST_${rate}`] = name;
    });
    Object.entries(tl.outputIgst || {}).forEach(([rate, name]) => {
      flat[`SALES_IGST_${rate}`] = name;
    });

    return flat;
  }

  public saveMappings(updates: Partial<TallyMasterMapping>, profileId?: string): TallyMasterMapping {
    const profileService = getProfileService();
    const profile = profileId
      ? profileService?.getProfileById(profileId)
      : profileService?.getActiveProfile() || { ...DEFAULT_ABC_COMPANY_PROFILE };

    if (profile) {
      if (updates.partyMappings) {
        profile.partyMappings = { ...profile.partyMappings, ...updates.partyMappings };
      }
      if (updates.stockItemMappings) {
        profile.stockItemMappings = { ...profile.stockItemMappings, ...updates.stockItemMappings };
      }
      if (updates.unitMappings) {
        profile.unitMappings = { ...profile.unitMappings, ...updates.unitMappings };
      }
      if (updates.defaultPurchaseLedger) {
        profile.ledgers.purchaseLedger = updates.defaultPurchaseLedger;
      }
      if (updates.defaultSalesLedger) {
        profile.ledgers.salesLedger = updates.defaultSalesLedger;
      }

      profileService?.saveProfile(profile);
    }
    return this.getMappings(profile);
  }

  /**
   * Step 5 & 6: Resolve Party Ledger strictly against active profile.
   * If not explicitly mapped, marks isMapped = false so UI can show [ NEEDS MAPPING ].
   */
  public resolvePartyLedger(
    ocrName: string,
    profile?: TallyProfile
  ): { ledgerName: string; isMapped: boolean } {
    if (!ocrName || !ocrName.trim()) {
      return { ledgerName: "", isMapped: false };
    }

    const clean = ocrName.trim();
    const key = clean.toLowerCase();
    const activeProfile = profile || getProfileService()?.getActiveProfile() || DEFAULT_ABC_COMPANY_PROFILE;
    const mappings = activeProfile.partyMappings || {};

    // Check exact or case-insensitive match
    for (const [k, v] of Object.entries(mappings)) {
      if (k.trim().toLowerCase() === key) {
        return { ledgerName: String(v), isMapped: true };
      }
    }

    // Unmapped: retain exact OCR name for preview and export, but flag as unmapped
    return { ledgerName: clean, isMapped: false };
  }

  /**
   * Step 5 & 6: Resolve Stock Item strictly against active profile.
   */
  public resolveStockItem(
    ocrItemName: string,
    profile?: TallyProfile
  ): { stockItemName: string; isMapped: boolean } {
    if (!ocrItemName || !ocrItemName.trim()) {
      return { stockItemName: "", isMapped: false };
    }

    const clean = ocrItemName.trim();
    const key = clean.toLowerCase();
    const activeProfile = profile || getProfileService()?.getActiveProfile() || DEFAULT_ABC_COMPANY_PROFILE;
    const mappings = activeProfile.stockItemMappings || {};

    for (const [k, v] of Object.entries(mappings)) {
      if (k.trim().toLowerCase() === key) {
        return { stockItemName: String(v), isMapped: true };
      }
    }

    return { stockItemName: clean, isMapped: false };
  }

  /**
   * Resolve Unit strictly against active profile UOM mappings.
   */
  public resolveUnit(rawUnit?: string, profile?: TallyProfile): { unit: string; isMapped: boolean } {
    if (!rawUnit || !rawUnit.trim()) return { unit: "NOS", isMapped: true };
    const clean = rawUnit.trim().toUpperCase();
    const activeProfile = profile || getProfileService()?.getActiveProfile() || DEFAULT_ABC_COMPANY_PROFILE;
    const mappings = activeProfile.unitMappings || {};

    if (mappings[clean]) {
      return { unit: mappings[clean], isMapped: true };
    }

    // Default standard unit list check
    const standardUnits = ["NOS", "PCS", "KGS", "BOX", "MTR", "SET", "BAG", "LTR"];
    if (standardUnits.includes(clean)) {
      return { unit: clean, isMapped: true };
    }

    return { unit: clean, isMapped: false };
  }

  /**
   * Step 4: Resolve Tax Ledger strictly from profile configuration.
   * Uses exact rate matching, then fallback to profile default.
   */
  public resolveTaxLedger(
    voucherType: "Purchase" | "Sales",
    taxType: "CGST" | "SGST" | "IGST",
    rate: number,
    profile?: TallyProfile
  ): { ledgerName: string; isMapped: boolean } {
    const activeProfile = profile || getProfileService()?.getActiveProfile() || DEFAULT_ABC_COMPANY_PROFILE;
    const tl = activeProfile.taxLedgers;
    const isPurchase = voucherType === "Purchase";

    let rateMap: Record<string, string> = {};
    if (isPurchase) {
      if (taxType === "CGST") rateMap = tl.inputCgst || {};
      else if (taxType === "SGST") rateMap = tl.inputSgst || {};
      else if (taxType === "IGST") rateMap = tl.inputIgst || {};
    } else {
      if (taxType === "CGST") rateMap = tl.outputCgst || {};
      else if (taxType === "SGST") rateMap = tl.outputSgst || {};
      else if (taxType === "IGST") rateMap = tl.outputIgst || {};
    }

    const rateStr = String(rate).trim();
    const rateInt = String(Math.round(Number(rate) || 0));

    if (rateMap[rateStr]) {
      return { ledgerName: rateMap[rateStr], isMapped: true };
    }
    if (rateMap[rateInt]) {
      return { ledgerName: rateMap[rateInt], isMapped: true };
    }

    if (rateMap["default"]) {
      return { ledgerName: rateMap["default"], isMapped: true };
    }

    // Standard Tally ledger naming
    const prefix = isPurchase ? "Input" : "Output";
    const fallback = Number(rate) > 0 ? `${prefix} ${taxType} @ ${rate}%` : `${prefix} ${taxType}`;
    return { ledgerName: fallback, isMapped: true };
  }

  /**
   * Step 6: Strict Master Data Readiness Check.
   * Evaluates if any required party, stock items, or ledgers are unmapped.
   */
  public checkMissingMasters(
    invoice: ExtractedInvoice,
    voucherType: "Purchase" | "Sales",
    profile?: TallyProfile
  ): MissingMasterInfo[] {
    const activeProfile = profile || getProfileService()?.getActiveProfile() || DEFAULT_ABC_COMPANY_PROFILE;
    const missing: MissingMasterInfo[] = [];

    // 1. Party Ledger Check
    const partySource = (voucherType === "Purchase" ? invoice.vendorName : invoice.customerName) || "";
    if (!partySource.trim()) {
      missing.push({
        type: "party",
        sourceName: "Party Name",
        reason: `${voucherType === "Purchase" ? "Vendor" : "Customer"} name is empty on invoice.`,
      });
    } else {
      const partyRes = this.resolvePartyLedger(partySource, activeProfile);
      if (!partyRes.isMapped) {
        missing.push({
          type: "party",
          sourceName: partySource,
          suggestedName: `${partySource} (Tally Ledger)`,
          reason: `Party '${partySource}' is not mapped to any Tally Party Ledger in '${activeProfile.name}'.`,
        });
      }
    }

    // 2. Line Item / Stock Item Check
    const items = invoice.items || [];
    if (items.length === 0) {
      missing.push({
        type: "item",
        sourceName: "No Items",
        reason: "Invoice contains no line items to map to Tally stock items.",
      });
    } else {
      const seenItems = new Set<string>();
      items.forEach((item, idx) => {
        const desc = (item.description || (item as any).itemName || "").trim();
        if (!desc) {
          missing.push({
            type: "item",
            sourceName: `Line Item #${idx + 1}`,
            reason: `Line item #${idx + 1} has no item description.`,
          });
        } else if (!seenItems.has(desc.toLowerCase())) {
          seenItems.add(desc.toLowerCase());
          const itemRes = this.resolveStockItem(desc, activeProfile);
          if (!itemRes.isMapped) {
            missing.push({
              type: "item",
              sourceName: desc,
              suggestedName: desc,
              reason: `Item '${desc}' is not mapped to a Tally Stock Item in '${activeProfile.name}'.`,
            });
          }
        }
      });
    }

    // 3. Purchase/Sales Ledger Check
    const ledger = voucherType === "Purchase"
      ? activeProfile.ledgers.purchaseLedger
      : activeProfile.ledgers.salesLedger;

    if (!ledger || !ledger.trim()) {
      missing.push({
        type: "ledger",
        sourceName: voucherType === "Purchase" ? "Purchase Ledger" : "Sales Ledger",
        reason: `${voucherType} accounting ledger is not configured in profile '${activeProfile.name}'.`,
      });
    }

    return missing;
  }
}

export const tallyMappingService = new TallyMappingService();
