"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TallyMasterMapping, MissingMasterInfo } from "@/types/tally";
import {
  Layers,
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Package,
  Percent,
  Scale,
} from "lucide-react";

interface TallyMasterMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendorName?: string;
  items?: Array<{ description: string }>;
  voucherType?: "Purchase" | "Sales";
  profileId?: string;
  initialTab?: "party" | "stock" | "tax" | "unit";
  missingMasters?: MissingMasterInfo[];
  onMappingSaved?: () => void;
}

export function TallyMasterMappingModal({
  isOpen,
  onClose,
  vendorName = "",
  items = [],
  voucherType = "Purchase",
  profileId,
  initialTab,
  missingMasters = [],
  onMappingSaved,
}: TallyMasterMappingModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const unmappedItemMasters = (missingMasters || []).filter((m) => m.type === "item");
  const unmappedPartyMasters = (missingMasters || []).filter((m) => m.type === "party");

  const [activeTab, setActiveTab] = useState<"party" | "stock" | "tax" | "unit">(
    initialTab || (unmappedItemMasters.length > 0 ? "stock" : "party")
  );
  const [activeProfileName, setActiveProfileName] = useState("Active Profile");

  const [mappings, setMappings] = useState<TallyMasterMapping>({
    partyMappings: {},
    stockItemMappings: {},
    unitMappings: {
      PCS: "NOS",
      PC: "NOS",
      PIECES: "NOS",
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
    },
    taxLedgerMappings: {},
    defaultPurchaseLedger: "Purchase Accounts",
    defaultSalesLedger: "Sales Accounts",
  });

  // Current inputs for quick adding
  const [newOcrParty, setNewOcrParty] = useState(vendorName);
  const [newTallyParty, setNewTallyParty] = useState(vendorName);
  const [newOcrItem, setNewOcrItem] = useState("");
  const [newTallyItem, setNewTallyItem] = useState("");
  const [newOcrUnit, setNewOcrUnit] = useState("");
  const [newTallyUnit, setNewTallyUnit] = useState("NOS");

  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      } else if (unmappedItemMasters.length > 0) {
        setActiveTab("stock");
      }

      setLoading(true);
      const url = profileId ? `/api/tally/masters?profileId=${profileId}` : "/api/tally/masters";
      fetch(url)
        .then((res) => res.json())
        .then((json) => {
          if (json?.success && json.data?.mappings) {
            setMappings(json.data.mappings);
            if (json.data.profileName) {
              setActiveProfileName(json.data.profileName);
            }
          }
        })
        .catch((err) => console.error("Failed to load mappings:", err))
        .finally(() => setLoading(false));

      if (unmappedPartyMasters.length > 0) {
        setNewOcrParty(unmappedPartyMasters[0].sourceName);
        setNewTallyParty(unmappedPartyMasters[0].suggestedName || unmappedPartyMasters[0].sourceName);
      } else if (vendorName) {
        setNewOcrParty(vendorName);
        setNewTallyParty(vendorName);
      }

      if (unmappedItemMasters.length > 0) {
        setNewOcrItem(unmappedItemMasters[0].sourceName);
        setNewTallyItem(unmappedItemMasters[0].suggestedName || unmappedItemMasters[0].sourceName);
      } else if (items.length > 0 && items[0].description) {
        setNewOcrItem(items[0].description);
        setNewTallyItem(items[0].description);
      }
    }
  }, [isOpen, vendorName, items, profileId, initialTab]);

  const handleSaveMappings = async () => {
    setSaving(true);
    setSuccessMsg("");
    try {
      const res = await fetch("/api/tally/masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...mappings,
          profileId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save master mappings.");
      }
      setSuccessMsg(`Master mappings saved for '${activeProfileName}'!`);
      if (onMappingSaved) onMappingSaved();
      setTimeout(() => {
        setSuccessMsg("");
        onClose();
      }, 1200);
    } catch (err: any) {
      alert(err.message || "Failed to save master mappings.");
    } finally {
      setSaving(false);
    }
  };

  const addPartyMapping = () => {
    if (!newOcrParty.trim() || !newTallyParty.trim()) return;
    setMappings((prev) => ({
      ...prev,
      partyMappings: {
        ...prev.partyMappings,
        [newOcrParty.trim()]: newTallyParty.trim(),
      },
    }));
    setNewOcrParty("");
    setNewTallyParty("");
  };

  const removePartyMapping = (key: string) => {
    setMappings((prev) => {
      const copy = { ...prev.partyMappings };
      delete copy[key];
      return { ...prev, partyMappings: copy };
    });
  };

  const addStockMapping = () => {
    if (!newOcrItem.trim() || !newTallyItem.trim()) return;
    setMappings((prev) => ({
      ...prev,
      stockItemMappings: {
        ...prev.stockItemMappings,
        [newOcrItem.trim()]: newTallyItem.trim(),
      },
    }));
    setNewOcrItem("");
    setNewTallyItem("");
  };

  const removeStockMapping = (key: string) => {
    setMappings((prev) => {
      const copy = { ...prev.stockItemMappings };
      delete copy[key];
      return { ...prev, stockItemMappings: copy };
    });
  };

  const addUnitMapping = () => {
    if (!newOcrUnit.trim() || !newTallyUnit.trim()) return;
    setMappings((prev) => ({
      ...prev,
      unitMappings: {
        ...prev.unitMappings,
        [newOcrUnit.trim().toUpperCase()]: newTallyUnit.trim().toUpperCase(),
      },
    }));
    setNewOcrUnit("");
  };

  const removeUnitMapping = (key: string) => {
    setMappings((prev) => {
      const copy = { ...prev.unitMappings };
      delete copy[key];
      return { ...prev, unitMappings: copy };
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`TallyPrime Master Mappings (${activeProfileName})`} maxWidth="xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-2">
          <p className="text-xs text-slate-400">
            Map OCR party names, items, and tax rates directly into <strong>{activeProfileName}</strong>.
          </p>
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTab("party")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === "party"
                  ? "bg-amber-500 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Building2 className="w-3.5 h-3.5" /> Party Ledgers
            </button>
            <button
              onClick={() => setActiveTab("stock")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === "stock"
                  ? "bg-amber-500 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Package className="w-3.5 h-3.5" /> Stock Items
            </button>
            <button
              onClick={() => setActiveTab("tax")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === "tax"
                  ? "bg-amber-500 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Percent className="w-3.5 h-3.5" /> Tax Ledgers
            </button>
            <button
              onClick={() => setActiveTab("unit")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === "unit"
                  ? "bg-amber-500 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Scale className="w-3.5 h-3.5" /> Units (UOM)
            </button>
          </div>
        </div>

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* TAB 1: Party Ledgers */}
        {activeTab === "party" && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
                Add New Party Mapping
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">OCR Vendor / Party Name</label>
                  <Input
                    placeholder="e.g. ABC Industries"
                    value={newOcrParty}
                    onChange={(e) => setNewOcrParty(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Tally Party Ledger Name</label>
                  <Input
                    placeholder="e.g. ABC Industries Pvt Ltd (Vendor)"
                    value={newTallyParty}
                    onChange={(e) => setNewTallyParty(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-amber-500/30 text-amber-400" onClick={addPartyMapping}>
                  <Plus className="w-3 h-3" /> Add Mapping
                </Button>
              </div>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Configured Party Mappings ({Object.keys(mappings.partyMappings).length})
              </span>
              {Object.keys(mappings.partyMappings).length === 0 ? (
                <p className="text-xs text-slate-500 italic">No party mappings configured yet.</p>
              ) : (
                <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                  {Object.entries(mappings.partyMappings).map(([ocr, tally]) => (
                    <div key={ocr} className="flex items-center justify-between p-2.5 text-xs">
                      <div>
                        <span className="text-slate-400">{ocr}</span>
                        <span className="text-slate-600 mx-2">→</span>
                        <span className="font-semibold text-amber-400">{tally}</span>
                      </div>
                      <button onClick={() => removePartyMapping(ocr)} className="text-slate-500 hover:text-red-400 p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Stock Items */}
        {activeTab === "stock" && (
          <div className="space-y-4">
            {unmappedItemMasters.length > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-amber-300 text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Unmapped Items Detected in this Invoice ({unmappedItemMasters.length})</span>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 gap-1 shadow-sm"
                    onClick={async () => {
                      const newStock = { ...mappings.stockItemMappings };
                      unmappedItemMasters.forEach((m) => {
                        newStock[m.sourceName] = m.suggestedName || m.sourceName;
                      });
                      setMappings((prev) => ({ ...prev, stockItemMappings: newStock }));
                      setSaving(true);
                      try {
                        const res = await fetch("/api/tally/masters", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            ...mappings,
                            stockItemMappings: newStock,
                            profileId,
                          }),
                        });
                        const data = await res.json();
                        if (data.success) {
                          setSuccessMsg(`All ${unmappedItemMasters.length} items mapped and saved!`);
                          if (onMappingSaved) onMappingSaved();
                          setTimeout(() => {
                            setSuccessMsg("");
                            onClose();
                          }, 1000);
                        }
                      } finally {
                        setSaving(false);
                      }
                    }}
                    isLoading={saving}
                  >
                    <span>⚡ Map All & Save ({unmappedItemMasters.length})</span>
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {unmappedItemMasters.map((m) => (
                    <div
                      key={m.sourceName}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800 text-xs"
                    >
                      <div>
                        <span className="font-mono text-slate-200">{m.sourceName}</span>
                        <span className="text-slate-500 text-[11px] ml-2">→ will map as Tally Stock Item</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[11px] border-amber-500/40 text-amber-300 hover:bg-amber-500 hover:text-slate-950 font-semibold"
                        onClick={() => {
                          setMappings((prev) => ({
                            ...prev,
                            stockItemMappings: {
                              ...prev.stockItemMappings,
                              [m.sourceName]: m.suggestedName || m.sourceName,
                            },
                          }));
                          setNewOcrItem("");
                          setNewTallyItem("");
                        }}
                      >
                        + Add Mapping
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
                Add New Stock Item Mapping
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">OCR Item Description</label>
                  <Input
                    placeholder="e.g. Cloud Architecture Consulting"
                    value={newOcrItem}
                    onChange={(e) => setNewOcrItem(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Tally Stock Item Master</label>
                  <Input
                    placeholder="e.g. Cloud Consulting Service"
                    value={newTallyItem}
                    onChange={(e) => setNewTallyItem(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-amber-500/30 text-amber-400" onClick={addStockMapping}>
                  <Plus className="w-3 h-3" /> Add Item Mapping
                </Button>
              </div>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Configured Stock Items ({Object.keys(mappings.stockItemMappings).length})
              </span>
              {Object.keys(mappings.stockItemMappings).length === 0 ? (
                <p className="text-xs text-slate-500 italic">No stock item mappings yet.</p>
              ) : (
                <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                  {Object.entries(mappings.stockItemMappings).map(([ocr, tally]) => (
                    <div key={ocr} className="flex items-center justify-between p-2.5 text-xs">
                      <div>
                        <span className="text-slate-400">{ocr}</span>
                        <span className="text-slate-600 mx-2">→</span>
                        <span className="font-semibold text-amber-400">{tally}</span>
                      </div>
                      <button onClick={() => removeStockMapping(ocr)} className="text-slate-500 hover:text-red-400 p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: Tax Ledgers */}
        {activeTab === "tax" && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400">
              Configure accounting tax ledger names mapped by Voucher Type and GST Rate for <strong>{activeProfileName}</strong>:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <span className="font-semibold text-amber-400 block">Purchase Tax Ledgers (Input)</span>
                <div>
                  <label className="text-[10px] text-slate-400 block">Input CGST @ 9%</label>
                  <Input
                    value={mappings.taxLedgerMappings["PURCHASE_CGST_9"] || "Input CGST @ 9%"}
                    onChange={(e) =>
                      setMappings((p) => ({
                        ...p,
                        taxLedgerMappings: { ...p.taxLedgerMappings, PURCHASE_CGST_9: e.target.value },
                      }))
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">Input SGST @ 9%</label>
                  <Input
                    value={mappings.taxLedgerMappings["PURCHASE_SGST_9"] || "Input SGST @ 9%"}
                    onChange={(e) =>
                      setMappings((p) => ({
                        ...p,
                        taxLedgerMappings: { ...p.taxLedgerMappings, PURCHASE_SGST_9: e.target.value },
                      }))
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">Input IGST @ 18%</label>
                  <Input
                    value={mappings.taxLedgerMappings["PURCHASE_IGST_18"] || "Input IGST @ 18%"}
                    onChange={(e) =>
                      setMappings((p) => ({
                        ...p,
                        taxLedgerMappings: { ...p.taxLedgerMappings, PURCHASE_IGST_18: e.target.value },
                      }))
                    }
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <span className="font-semibold text-sky-400 block">Sales Tax Ledgers (Output)</span>
                <div>
                  <label className="text-[10px] text-slate-400 block">Output CGST @ 9%</label>
                  <Input
                    value={mappings.taxLedgerMappings["SALES_CGST_9"] || "Output CGST @ 9%"}
                    onChange={(e) =>
                      setMappings((p) => ({
                        ...p,
                        taxLedgerMappings: { ...p.taxLedgerMappings, SALES_CGST_9: e.target.value },
                      }))
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">Output SGST @ 9%</label>
                  <Input
                    value={mappings.taxLedgerMappings["SALES_SGST_9"] || "Output SGST @ 9%"}
                    onChange={(e) =>
                      setMappings((p) => ({
                        ...p,
                        taxLedgerMappings: { ...p.taxLedgerMappings, SALES_SGST_9: e.target.value },
                      }))
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">Output IGST @ 18%</label>
                  <Input
                    value={mappings.taxLedgerMappings["SALES_IGST_18"] || "Output IGST @ 18%"}
                    onChange={(e) =>
                      setMappings((p) => ({
                        ...p,
                        taxLedgerMappings: { ...p.taxLedgerMappings, SALES_IGST_18: e.target.value },
                      }))
                    }
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Unit of Measure (UOM) */}
        {activeTab === "unit" && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
                Add New Unit (UOM) Mapping
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">OCR Unit Code</label>
                  <Input
                    placeholder="e.g. PCS, PKG, CARTON"
                    value={newOcrUnit}
                    onChange={(e) => setNewOcrUnit(e.target.value.toUpperCase())}
                    className="h-8 text-xs font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Tally Official Unit (UQC)</label>
                  <Input
                    placeholder="e.g. NOS, BOX, KGS"
                    value={newTallyUnit}
                    onChange={(e) => setNewTallyUnit(e.target.value.toUpperCase())}
                    className="h-8 text-xs font-mono uppercase"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-amber-500/30 text-amber-400" onClick={addUnitMapping}>
                  <Plus className="w-3 h-3" /> Add Unit Mapping
                </Button>
              </div>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Configured Unit Mappings ({Object.keys(mappings.unitMappings || {}).length})
              </span>
              <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                {Object.entries(mappings.unitMappings || {}).map(([ocr, tally]) => (
                  <div key={ocr} className="flex items-center justify-between p-2 text-xs font-mono">
                    <div>
                      <span className="text-slate-300 font-bold">{ocr}</span>
                      <span className="text-slate-600 mx-2">→</span>
                      <span className="font-semibold text-amber-400">{tally}</span>
                    </div>
                    <button onClick={() => removeUnitMapping(ocr)} className="text-slate-500 hover:text-red-400 p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-3">
          <p className="text-[11px] text-slate-500">
            Saved mappings apply to all future invoice imports for <strong>{activeProfileName}</strong>.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-500 bg-amber-500 text-slate-950 hover:bg-amber-400 gap-1.5 font-bold shadow-md"
              onClick={handleSaveMappings}
              isLoading={saving}
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Mappings</span>
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
