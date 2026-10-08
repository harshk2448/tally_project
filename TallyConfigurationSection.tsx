"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  TallyProfile,
  TallyCustomTemplate,
  TallyStandardFieldKey,
  TALLY_FIELD_MAPPINGS,
} from "@/types/tally";
import {
  Settings,
  Building2,
  Package,
  Percent,
  Scale,
  FileSpreadsheet,
  UploadCloud,
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Copy,
} from "lucide-react";

export function TallyConfigurationSection() {
  const [profiles, setProfiles] = useState<TallyProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Active profile being edited
  const [currentProfile, setCurrentProfile] = useState<TallyProfile | null>(null);
  const [activeSubtab, setActiveSubtab] = useState<"general" | "parties" | "items" | "taxes" | "units" | "template">("general");

  // Template upload state
  const [isParsingTemplate, setIsParsingTemplate] = useState(false);

  // New item inputs
  const [newOcrParty, setNewOcrParty] = useState("");
  const [newTallyParty, setNewTallyParty] = useState("");
  const [newOcrItem, setNewOcrItem] = useState("");
  const [newTallyItem, setNewTallyItem] = useState("");
  const [newOcrUnit, setNewOcrUnit] = useState("");
  const [newTallyUnit, setNewTallyUnit] = useState("NOS");

  // Load profiles
  const loadProfiles = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tally/profiles");
      const json = await res.json();
      if (json?.success && json.data?.profiles) {
        setProfiles(json.data.profiles);
        const activeId = json.data.activeProfile?.id || json.data.profiles[0]?.id;
        setActiveProfileId(activeId);
        const activeObj = json.data.profiles.find((p: TallyProfile) => p.id === activeId);
        setCurrentProfile(activeObj ? JSON.parse(JSON.stringify(activeObj)) : null);
      }
    } catch (e) {
      console.error("Failed to load profiles:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const handleSwitchProfile = (id: string) => {
    setActiveProfileId(id);
    const target = profiles.find((p) => p.id === id);
    if (target) {
      setCurrentProfile(JSON.parse(JSON.stringify(target)));
    }
  };

  const handleCreateNewProfile = async () => {
    const name = prompt("Enter Name for new Tally Profile (e.g. 'XYZ Corporation'):");
    if (!name || !name.trim()) return;

    try {
      const res = await fetch("/api/tally/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          cloneFromId: activeProfileId,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setMessage({ type: "success", text: `Profile '${name}' created successfully.` });
        await loadProfiles();
        handleSwitchProfile(json.data.id);
      }
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Failed to create profile." });
    }
  };

  const handleSaveCurrentProfile = async () => {
    if (!currentProfile) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/tally/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentProfile),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to save profile.");
      }
      setMessage({ type: "success", text: `Profile '${currentProfile.name}' saved successfully.` });
      await loadProfiles();
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Failed to save profile." });
    } finally {
      setSaving(false);
    }
  };

  const handleTemplateFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentProfile) return;

    setIsParsingTemplate(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("profileId", currentProfile.id);

      const res = await fetch("/api/tally/template/parse", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to parse template file.");
      }

      setCurrentProfile({
        ...currentProfile,
        customTemplate: json.data,
      });

      setMessage({
        type: "success",
        text: `Successfully parsed '${json.data.templateName}' (${json.data.columns.length} columns detected). You can now customize field mappings.`,
      });
      setActiveSubtab("template");
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to upload template." });
    } finally {
      setIsParsingTemplate(false);
    }
  };

  if (!currentProfile) {
    return (
      <Card className="p-6 border-slate-800 space-y-4">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-amber-400" />
          <span className="text-xs text-slate-400">Loading Tally configurations...</span>
        </div>
      </Card>
    );
  }

  const STANDARD_FIELDS: { key: TallyStandardFieldKey; label: string }[] = [
    { key: "voucherType", label: "Voucher Type Name" },
    { key: "voucherDate", label: "Voucher Date" },
    { key: "voucherNumber", label: "Voucher / Invoice Number" },
    { key: "referenceNumber", label: "Reference Number" },
    { key: "partyLedger", label: "Party Ledger Name" },
    { key: "partyGstin", label: "Party GSTIN" },
    { key: "purchaseSalesLedger", label: "Purchase / Sales Ledger" },
    { key: "stockItem", label: "Stock Item Master Name" },
    { key: "hsnSac", label: "HSN / SAC Code" },
    { key: "quantity", label: "Billed Quantity" },
    { key: "unit", label: "Unit of Measure (UOM)" },
    { key: "rate", label: "Unit Rate" },
    { key: "taxableAmount", label: "Taxable / Assessable Amount" },
    { key: "cgstAmount", label: "CGST Amount" },
    { key: "sgstAmount", label: "SGST Amount" },
    { key: "igstAmount", label: "IGST Amount" },
    { key: "totalTax", label: "Total Tax Amount" },
    { key: "itemTotal", label: "Line Item Total" },
    { key: "grandTotal", label: "Voucher Grand Total" },
    { key: "narration", label: "Narration / Remarks" },
    { key: "poNumber", label: "PO Number" },
    { key: "dueDate", label: "Due Date" },
  ];

  return (
    <Card className="p-6 border-slate-800 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>TallyPrime Configuration & Mapping Profiles</span>
              <Badge variant="warning">Module 13.5</Badge>
            </h3>
            <p className="text-xs text-slate-400">
              Manage multi-company setups, custom ledger names, and user-provided Tally import templates.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-400">Active Profile:</label>
          <select
            value={currentProfile.id}
            onChange={(e) => handleSwitchProfile(e.target.value)}
            className="h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.companyGstin ? `(${p.companyGstin})` : ""}
              </option>
            ))}
          </select>

          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-slate-700 text-slate-300 hover:text-white gap-1"
            onClick={handleCreateNewProfile}
            title="Create a new Tally Profile"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>New Profile</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-amber-500 bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold gap-1 shadow-md shadow-amber-500/20"
            onClick={handleSaveCurrentProfile}
            isLoading={saving}
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Profile</span>
          </Button>
        </div>
      </div>

      {message && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
            message.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Subtabs Navigation */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 pb-2 text-xs">
        <button
          onClick={() => setActiveSubtab("general")}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
            activeSubtab === "general"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          1. Company & Core Ledgers
        </button>
        <button
          onClick={() => setActiveSubtab("parties")}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
            activeSubtab === "parties"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          2. Party Ledgers ({Object.keys(currentProfile.partyMappings || {}).length})
        </button>
        <button
          onClick={() => setActiveSubtab("items")}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
            activeSubtab === "items"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          3. Stock Items ({Object.keys(currentProfile.stockItemMappings || {}).length})
        </button>
        <button
          onClick={() => setActiveSubtab("taxes")}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
            activeSubtab === "taxes"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          4. Tax Ledgers
        </button>
        <button
          onClick={() => setActiveSubtab("units")}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
            activeSubtab === "units"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          5. Units ({Object.keys(currentProfile.unitMappings || {}).length})
        </button>
        <button
          onClick={() => setActiveSubtab("template")}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1 ${
            activeSubtab === "template"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
          <span>6. Custom Template {currentProfile.customTemplate ? "(Configured)" : ""}</span>
        </button>
      </div>

      {/* SUBTAB 1: General & Core Ledgers */}
      {activeSubtab === "general" && (
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-slate-400 block mb-1">Profile Display Name</label>
              <Input
                value={currentProfile.name}
                onChange={(e) => setCurrentProfile({ ...currentProfile, name: e.target.value })}
                placeholder="e.g. ABC Company"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Your Company Legal Name</label>
              <Input
                value={currentProfile.companyName}
                onChange={(e) => setCurrentProfile({ ...currentProfile, companyName: e.target.value })}
                placeholder="e.g. ABC Industries Pvt Ltd"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Your Company GSTIN</label>
              <Input
                value={currentProfile.companyGstin}
                onChange={(e) => setCurrentProfile({ ...currentProfile, companyGstin: e.target.value.toUpperCase() })}
                placeholder="e.g. 27AABCA1234A1Z5"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Used to auto-detect Purchase (when billed to you) vs Sales (when issued by you).
              </span>
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Round Off Ledger Name</label>
              <Input
                value={currentProfile.ledgers.roundOffLedger}
                onChange={(e) =>
                  setCurrentProfile({
                    ...currentProfile,
                    ledgers: { ...currentProfile.ledgers, roundOffLedger: e.target.value },
                  })
                }
                placeholder="Round Off"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Default Purchase Ledger</label>
              <Input
                value={currentProfile.ledgers.purchaseLedger}
                onChange={(e) =>
                  setCurrentProfile({
                    ...currentProfile,
                    ledgers: { ...currentProfile.ledgers, purchaseLedger: e.target.value },
                  })
                }
                placeholder="Purchase Accounts"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Default Sales Ledger</label>
              <Input
                value={currentProfile.ledgers.salesLedger}
                onChange={(e) =>
                  setCurrentProfile({
                    ...currentProfile,
                    ledgers: { ...currentProfile.ledgers, salesLedger: e.target.value },
                  })
                }
                placeholder="Sales Accounts"
              />
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: Party Ledgers */}
      {activeSubtab === "parties" && (
        <div className="space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
              Map Invoice Vendor Name → Tally Party Ledger
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">OCR Vendor / Customer Name</label>
                <Input
                  placeholder="e.g. ABC Industries"
                  value={newOcrParty}
                  onChange={(e) => setNewOcrParty(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Tally Sundry Creditor / Debtor Ledger</label>
                <Input
                  placeholder="e.g. ABC Industries Pvt Ltd (Vendor)"
                  value={newTallyParty}
                  onChange={(e) => setNewTallyParty(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-amber-500/30 text-amber-400 gap-1"
                onClick={() => {
                  if (!newOcrParty.trim() || !newTallyParty.trim()) return;
                  setCurrentProfile({
                    ...currentProfile,
                    partyMappings: {
                      ...currentProfile.partyMappings,
                      [newOcrParty.trim()]: newTallyParty.trim(),
                    },
                  });
                  setNewOcrParty("");
                  setNewTallyParty("");
                }}
              >
                <Plus className="w-3 h-3" /> Add Party Mapping
              </Button>
            </div>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              {Object.entries(currentProfile.partyMappings || {}).map(([ocr, tally]) => (
                <div key={ocr} className="flex items-center justify-between p-2.5">
                  <div>
                    <span className="text-slate-300 font-medium">{ocr}</span>
                    <span className="text-slate-600 mx-2">→</span>
                    <span className="font-bold text-amber-400">{tally}</span>
                  </div>
                  <button
                    onClick={() => {
                      const copy = { ...currentProfile.partyMappings };
                      delete copy[ocr];
                      setCurrentProfile({ ...currentProfile, partyMappings: copy });
                    }}
                    className="text-slate-500 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 3: Stock Items */}
      {activeSubtab === "items" && (
        <div className="space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
              Map OCR Item Description → Tally Stock Item Master
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
                <label className="text-[10px] text-slate-400 block mb-1">Actual Tally Stock Item Master Name</label>
                <Input
                  placeholder="e.g. Cloud Consulting Service"
                  value={newTallyItem}
                  onChange={(e) => setNewTallyItem(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-amber-500/30 text-amber-400 gap-1"
                onClick={() => {
                  if (!newOcrItem.trim() || !newTallyItem.trim()) return;
                  setCurrentProfile({
                    ...currentProfile,
                    stockItemMappings: {
                      ...currentProfile.stockItemMappings,
                      [newOcrItem.trim()]: newTallyItem.trim(),
                    },
                  });
                  setNewOcrItem("");
                  setNewTallyItem("");
                }}
              >
                <Plus className="w-3 h-3" /> Add Stock Item Mapping
              </Button>
            </div>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              {Object.entries(currentProfile.stockItemMappings || {}).map(([ocr, tally]) => (
                <div key={ocr} className="flex items-center justify-between p-2.5">
                  <div>
                    <span className="text-slate-300 font-medium">{ocr}</span>
                    <span className="text-slate-600 mx-2">→</span>
                    <span className="font-bold text-amber-400">{tally}</span>
                  </div>
                  <button
                    onClick={() => {
                      const copy = { ...currentProfile.stockItemMappings };
                      delete copy[ocr];
                      setCurrentProfile({ ...currentProfile, stockItemMappings: copy });
                    }}
                    className="text-slate-500 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 4: Tax Ledgers */}
      {activeSubtab === "taxes" && (
        <div className="space-y-4 text-xs">
          <p className="text-slate-400">
            Define specific GST tax ledger names used by <strong>{currentProfile.name}</strong> for Purchase and Sales:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Purchase Tax Ledgers */}
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5">
              <span className="font-bold text-amber-400 block">Purchase Tax Ledgers (Input)</span>
              <div>
                <label className="text-[10px] text-slate-400 block">Input CGST @ 9%</label>
                <Input
                  value={currentProfile.taxLedgers?.inputCgst?.["9"] || "Input CGST @ 9%"}
                  onChange={(e) =>
                    setCurrentProfile({
                      ...currentProfile,
                      taxLedgers: {
                        ...currentProfile.taxLedgers,
                        inputCgst: { ...currentProfile.taxLedgers.inputCgst, "9": e.target.value },
                      },
                    })
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block">Input SGST @ 9%</label>
                <Input
                  value={currentProfile.taxLedgers?.inputSgst?.["9"] || "Input SGST @ 9%"}
                  onChange={(e) =>
                    setCurrentProfile({
                      ...currentProfile,
                      taxLedgers: {
                        ...currentProfile.taxLedgers,
                        inputSgst: { ...currentProfile.taxLedgers.inputSgst, "9": e.target.value },
                      },
                    })
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block">Input IGST @ 18%</label>
                <Input
                  value={currentProfile.taxLedgers?.inputIgst?.["18"] || "Input IGST @ 18%"}
                  onChange={(e) =>
                    setCurrentProfile({
                      ...currentProfile,
                      taxLedgers: {
                        ...currentProfile.taxLedgers,
                        inputIgst: { ...currentProfile.taxLedgers.inputIgst, "18": e.target.value },
                      },
                    })
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block">Default Input CGST (General)</label>
                <Input
                  value={currentProfile.taxLedgers?.inputCgst?.default || "Input CGST"}
                  onChange={(e) =>
                    setCurrentProfile({
                      ...currentProfile,
                      taxLedgers: {
                        ...currentProfile.taxLedgers,
                        inputCgst: { ...currentProfile.taxLedgers.inputCgst, default: e.target.value },
                      },
                    })
                  }
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Sales Tax Ledgers */}
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5">
              <span className="font-bold text-sky-400 block">Sales Tax Ledgers (Output)</span>
              <div>
                <label className="text-[10px] text-slate-400 block">Output CGST @ 9%</label>
                <Input
                  value={currentProfile.taxLedgers?.outputCgst?.["9"] || "Output CGST @ 9%"}
                  onChange={(e) =>
                    setCurrentProfile({
                      ...currentProfile,
                      taxLedgers: {
                        ...currentProfile.taxLedgers,
                        outputCgst: { ...currentProfile.taxLedgers.outputCgst, "9": e.target.value },
                      },
                    })
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block">Output SGST @ 9%</label>
                <Input
                  value={currentProfile.taxLedgers?.outputSgst?.["9"] || "Output SGST @ 9%"}
                  onChange={(e) =>
                    setCurrentProfile({
                      ...currentProfile,
                      taxLedgers: {
                        ...currentProfile.taxLedgers,
                        outputSgst: { ...currentProfile.taxLedgers.outputSgst, "9": e.target.value },
                      },
                    })
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block">Output IGST @ 18%</label>
                <Input
                  value={currentProfile.taxLedgers?.outputIgst?.["18"] || "Output IGST @ 18%"}
                  onChange={(e) =>
                    setCurrentProfile({
                      ...currentProfile,
                      taxLedgers: {
                        ...currentProfile.taxLedgers,
                        outputIgst: { ...currentProfile.taxLedgers.outputIgst, "18": e.target.value },
                      },
                    })
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block">Default Output CGST (General)</label>
                <Input
                  value={currentProfile.taxLedgers?.outputCgst?.default || "Output CGST"}
                  onChange={(e) =>
                    setCurrentProfile({
                      ...currentProfile,
                      taxLedgers: {
                        ...currentProfile.taxLedgers,
                        outputCgst: { ...currentProfile.taxLedgers.outputCgst, default: e.target.value },
                      },
                    })
                  }
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 5: Units (UOM) */}
      {activeSubtab === "units" && (
        <div className="space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
              Map Invoice Unit Code → Tally Official Unit Quantity Code (UQC)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">OCR Unit String</label>
                <Input
                  placeholder="e.g. PIECES, UNT"
                  value={newOcrUnit}
                  onChange={(e) => setNewOcrUnit(e.target.value.toUpperCase())}
                  className="h-8 text-xs uppercase"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Tally UOM (e.g. NOS, BOX, KGS)</label>
                <Input
                  placeholder="e.g. NOS"
                  value={newTallyUnit}
                  onChange={(e) => setNewTallyUnit(e.target.value.toUpperCase())}
                  className="h-8 text-xs uppercase"
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-amber-500/30 text-amber-400 gap-1"
                onClick={() => {
                  if (!newOcrUnit.trim() || !newTallyUnit.trim()) return;
                  setCurrentProfile({
                    ...currentProfile,
                    unitMappings: {
                      ...currentProfile.unitMappings,
                      [newOcrUnit.trim().toUpperCase()]: newTallyUnit.trim().toUpperCase(),
                    },
                  });
                  setNewOcrUnit("");
                }}
              >
                <Plus className="w-3 h-3" /> Add Unit Mapping
              </Button>
            </div>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden font-mono">
              {Object.entries(currentProfile.unitMappings || {}).map(([ocr, tally]) => (
                <div key={ocr} className="flex items-center justify-between p-2">
                  <div>
                    <span className="text-slate-300 font-bold">{ocr}</span>
                    <span className="text-slate-600 mx-2">→</span>
                    <span className="font-bold text-amber-400">{tally}</span>
                  </div>
                  <button
                    onClick={() => {
                      const copy = { ...currentProfile.unitMappings };
                      delete copy[ocr];
                      setCurrentProfile({ ...currentProfile, unitMappings: copy });
                    }}
                    className="text-slate-500 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 6: Step 10 - Tally Sample Template Support */}
      {activeSubtab === "template" && (
        <div className="space-y-4 text-xs">
          <div className="p-4 rounded-xl bg-amber-950/10 border border-amber-500/20 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-amber-300 block">
                  Upload Your Company&apos;s Tally Excel Sample Template
                </span>
                <p className="text-[11px] text-slate-400">
                  Upload an existing Excel import file from your Tally setup. OCR Studio will read its columns and generate invoices formatted to your exact layout.
                </p>
              </div>
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 text-xs font-bold shadow-md transition-all">
                <UploadCloud className="w-4 h-4" />
                <span>{isParsingTemplate ? "Parsing Template..." : "Upload .xlsx Sample"}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleTemplateFileUpload}
                  disabled={isParsingTemplate}
                />
              </label>
            </div>

            {currentProfile.customTemplate ? (
              <div className="space-y-3 pt-2 border-t border-amber-500/20">
                <div className="flex items-center justify-between">
                  <span className="text-slate-200 font-semibold flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    <span>Template: {currentProfile.customTemplate.templateName}</span>
                    <span className="text-[10px] text-slate-500">
                      ({currentProfile.customTemplate.columns.length} columns)
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[11px] text-rose-400 hover:text-rose-300"
                    onClick={() => setCurrentProfile({ ...currentProfile, customTemplate: undefined })}
                  >
                    Remove Template
                  </Button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-64 bg-slate-900/60">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-400 sticky top-0 border-b border-slate-800">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Your Excel Column Header</th>
                        <th className="px-3 py-2">Mapped Tally Field</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {currentProfile.customTemplate.columns.map((col, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30">
                          <td className="px-3 py-1.5 font-mono text-slate-500">{idx + 1}</td>
                          <td className="px-3 py-1.5 font-semibold text-slate-200">{col.excelColumn}</td>
                          <td className="px-3 py-1.5">
                            <select
                              value={col.mappedField}
                              onChange={(e) => {
                                const val = e.target.value as any;
                                const updatedCols = [...currentProfile.customTemplate!.columns];
                                updatedCols[idx].mappedField = val;
                                setCurrentProfile({
                                  ...currentProfile,
                                  customTemplate: {
                                    ...currentProfile.customTemplate!,
                                    columns: updatedCols,
                                  },
                                });
                              }}
                              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-amber-300 font-medium focus:outline-none focus:border-amber-400"
                            >
                              <option value="IGNORE">— Ignore Column —</option>
                              {STANDARD_FIELDS.map((f) => (
                                <option key={f.key} value={f.key}>
                                  {f.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-xl border border-dashed border-slate-800 text-center space-y-1">
                <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-xs text-slate-400 font-medium">No custom template uploaded yet.</p>
                <p className="text-[11px] text-slate-500">
                  By default, exports use standard TallyPrime Transaction Import layout.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
