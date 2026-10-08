"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  ColumnDef,
  flexRender,
  SortingState,
} from "@tanstack/react-table";
import { DocumentRecord } from "@/types/document";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ExportModal } from "@/components/validation/ExportModal";
import { TallyExportPreviewModal } from "@/components/tally/TallyExportPreviewModal";
import { BulkTallyExportPreviewModal } from "@/components/tally/BulkTallyExportPreviewModal";
import { transformValidatedInvoiceToTally, validateTallyInvoice } from "@/lib/tally-utils";
import { formatDate, formatCurrency, formatBytes, getConfidenceBadge, downloadBlob } from "@/lib/utils";
import { STATUS_CONFIG, SUPPORTED_DOC_TYPES } from "@/lib/constants";
import {
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  DownloadCloud,
  Trash2,
  ArrowUpDown,
  AlertTriangle,
  Archive,
  CheckSquare,
  Square,
} from "lucide-react";

interface DocumentTableProps {
  initialDocuments: DocumentRecord[];
}

export function DocumentTable({ initialDocuments }: DocumentTableProps) {
  const [data, setData] = useState<DocumentRecord[]>(initialDocuments);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "uploadedAt", desc: true },
  ]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedDocForExport, setSelectedDocForExport] =
    useState<DocumentRecord | null>(null);
  const [selectedDocForTally, setSelectedDocForTally] =
    useState<DocumentRecord | null>(null);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [isBulkTallyModalOpen, setIsBulkTallyModalOpen] = useState(false);

  // Phase 13: Open structured preview modal before downloading Tally file
  const handleQuickTallyDownload = (doc: DocumentRecord) => {
    setSelectedDocForTally(doc);
  };

  // Filtered dataset
  const filteredData = useMemo(() => {
    return data.filter((doc) => {
      const matchesType = typeFilter === "ALL" || doc.documentType === typeFilter;
      const matchesStatus =
        statusFilter === "ALL" || doc.status === statusFilter;
      return matchesType && matchesStatus;
    });
  }, [data, typeFilter, statusFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return;
    try {
      await fetch(`/api/document/${id}`, { method: "DELETE" });
      setData((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  const columns = useMemo<ColumnDef<DocumentRecord>[]>(
    () => [
      {
        id: "select",
        header: () => {
          const isAllSelected = filteredData.length > 0 && bulkSelectedIds.length === filteredData.length;
          return (
            <button
              onClick={() => {
                if (isAllSelected) {
                  setBulkSelectedIds([]);
                } else {
                  setBulkSelectedIds(filteredData.map((d) => d.id));
                }
              }}
              className="text-slate-400 hover:text-amber-400 flex items-center justify-center cursor-pointer"
              title={isAllSelected ? "Deselect All" : "Select All"}
            >
              {isAllSelected ? (
                <CheckSquare className="w-4 h-4 text-amber-400" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </button>
          );
        },
        cell: ({ row }) => {
          const isSelected = bulkSelectedIds.includes(row.original.id);
          return (
            <button
              onClick={() => {
                const id = row.original.id;
                setBulkSelectedIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                );
              }}
              className="text-slate-400 hover:text-amber-400 flex items-center justify-center cursor-pointer"
            >
              {isSelected ? (
                <CheckSquare className="w-4 h-4 text-amber-400" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </button>
          );
        },
      },
      {
        accessorKey: "fileName",
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1.5 font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            Document File <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        ),
        cell: ({ row }) => {
          const doc = row.original;
          return (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="overflow-hidden">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/documents/${doc.id}/validate`}
                    className="font-medium text-slate-100 hover:text-sky-400 transition-colors truncate max-w-xs block"
                  >
                    {doc.fileName}
                  </Link>
                  {(doc.isDuplicate || doc.aiResult?.flags?.isDuplicateInvoice) && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0 shadow-sm"
                      title={doc.duplicateInfo?.previouslyUploadedOn ? `Duplicate of invoice uploaded on ${doc.duplicateInfo.previouslyUploadedOn}` : "Duplicate Invoice"}
                    >
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                      Duplicate
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-slate-500">
                  {formatBytes(doc.fileSize)}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "uploadedAt",
        id: "uploadedAt",
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1.5 font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            Upload Date <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        ),
        cell: ({ row }) => (
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {formatDate(row.original.uploadedAt)}
          </span>
        ),
      },
      {
        accessorKey: "documentType",
        header: "Document Type",
        cell: ({ row }) => (
          <span className="px-2.5 py-0.5 rounded-md bg-slate-800 border border-slate-700/80 text-slate-300 text-xs font-medium">
            {row.original.documentType}
          </span>
        ),
      },
      {
        id: "vendor",
        header: "Vendor / Party",
        accessorFn: (row: DocumentRecord) =>
          row.aiResult?.cleanedData?.vendorName || "Unassigned",
        cell: ({ getValue }) => (
          <span className="text-slate-300 truncate max-w-[180px] block">
            {String(getValue())}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const cfg = STATUS_CONFIG[row.original.status] || STATUS_CONFIG.uploaded;
          return (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color} ${cfg.border}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {cfg.label}
            </span>
          );
        },
      },
      {
        accessorKey: "confidenceScore",
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1.5 font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            Confidence <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        ),
        cell: ({ row }) => {
          const score = row.original.confidenceScore;
          const badge = getConfidenceBadge(score);
          return (
            <div className="flex items-center gap-2">
              <div className="w-12 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    score >= 85
                      ? "bg-emerald-400"
                      : score >= 70
                      ? "bg-amber-400"
                      : "bg-rose-400"
                  }`}
                  style={{ width: `${score}%` }}
                />
              </div>
              <span className={`text-xs font-semibold ${badge.color}`}>
                {score}%
              </span>
            </div>
          );
        },
      },
      {
        id: "grandTotal",
        header: "Grand Total",
        cell: ({ row }) => {
          const total = row.original.aiResult?.cleanedData?.grandTotal || 0;
          const currency = row.original.aiResult?.cleanedData?.currency || "INR";
          return (
            <span className="font-semibold text-slate-200">
              {total > 0 ? formatCurrency(total, currency) : "—"}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: () => <span className="text-right block">Actions</span>,
        cell: ({ row }) => {
          const doc = row.original;
          return (
            <div className="flex items-center justify-end gap-2">
              <Link href={`/documents/${doc.id}/validate`}>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs px-2.5 hover:border-sky-500/40 gap-1"
                >
                  <Sparkles className="w-3 h-3 text-sky-400" />
                  <span>Studio</span>
                </Button>
              </Link>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-2 text-slate-400 hover:text-slate-200"
                onClick={() => setSelectedDocForExport(doc)}
                title="Export Document"
              >
                <DownloadCloud className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-2 text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/10 font-bold"
                onClick={() => setSelectedDocForTally(doc)}
                title="Preview & Export to TallyPrime (.xlsx)"
              >
                <span className="text-[10px] tracking-tight">TALLY</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-2 text-slate-500 hover:text-rose-400"
                onClick={() => handleDelete(doc.id)}
                title="Delete Document"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          );
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
        {/* Search */}
        <div className="w-full sm:w-72">
          <Input
            value={globalFilter ?? ""}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGlobalFilter(e.target.value)}
            placeholder="Search documents or vendors..."
            icon={<Search className="w-4 h-4" />}
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Type:</span>
            <select
              value={typeFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">All Types</option>
              {SUPPORTED_DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="ready_for_validation">Needs Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="ocr_processing">Processing</option>
            </select>
          </div>

          <Link href="/upload">
            <Button size="sm" variant="glow">
              <span>+ Upload New</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Batch Action Toolbar */}
      {bulkSelectedIds.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-4 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-amber-300">
              {bulkSelectedIds.length} invoice{bulkSelectedIds.length === 1 ? "" : "s"} selected
            </span>
            <button
              onClick={() => setBulkSelectedIds([])}
              className="text-xs text-slate-400 hover:text-slate-200 underline ml-2 cursor-pointer"
            >
              Clear selection
            </button>
          </div>
          <Button
            size="sm"
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs gap-1.5 shadow-md shadow-amber-500/20"
            onClick={() => setIsBulkTallyModalOpen(true)}
          >
            <Archive className="w-4 h-4 text-slate-950" />
            <span>Export to Tally ({bulkSelectedIds.length})</span>
          </Button>
        </div>
      )}

      {/* TanStack Table Container */}
      <div className="rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 text-[11px] uppercase border-b border-slate-800">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-5 py-3.5 font-semibold">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-6 py-12 text-center text-slate-500 text-xs"
                  >
                    No documents matching your search or filters.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const isDup =
                    row.original.isDuplicate ||
                    row.original.aiResult?.flags?.isDuplicateInvoice;
                  return (
                    <tr
                      key={row.id}
                      className={`transition-colors ${
                        isDup
                          ? "bg-amber-500/[0.07] hover:bg-amber-500/[0.12] border-l-4 border-l-amber-400"
                          : "hover:bg-slate-800/40"
                      }`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-5 py-3.5">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="px-6 py-3.5 border-t border-slate-800/80 bg-slate-950/40 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing{" "}
            <span className="font-semibold text-slate-200">
              {table.getRowModel().rows.length}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-slate-200">
              {filteredData.length}
            </span>{" "}
            documents
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-8 px-2.5"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-slate-300 font-mono">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount() || 1}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="h-8 px-2.5"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Export Modal */}
      {selectedDocForExport && (
        <ExportModal
          isOpen={Boolean(selectedDocForExport)}
          onClose={() => setSelectedDocForExport(null)}
          document={selectedDocForExport}
        />
      )}

      {/* Tally Export Preview Modal (Single Document) */}
      {selectedDocForTally && (
        <TallyPreviewModalContainer
          doc={selectedDocForTally}
          onClose={() => setSelectedDocForTally(null)}
        />
      )}

      {/* Bulk Tally Export Modal (Selected Documents) */}
      {isBulkTallyModalOpen && bulkSelectedIds.length > 0 && (
        <BulkTallyExportPreviewModal
          isOpen={isBulkTallyModalOpen}
          onClose={() => setIsBulkTallyModalOpen(false)}
          documents={data.filter((d) => bulkSelectedIds.includes(d.id))}
          onExportComplete={() => setBulkSelectedIds([])}
        />
      )}
    </div>
  );
}

function TallyPreviewModalContainer({
  doc,
  onClose,
}: {
  doc: DocumentRecord;
  onClose: () => void;
}) {
  const tallyInvoice = useMemo(() => {
    return transformValidatedInvoiceToTally(doc);
  }, [doc]);

  const validation = useMemo(() => {
    return validateTallyInvoice(tallyInvoice);
  }, [tallyInvoice]);

  return (
    <TallyExportPreviewModal
      isOpen={true}
      onClose={onClose}
      documentId={doc.id}
      document={doc}
      tallyInvoice={tallyInvoice}
      validation={validation}
    />
  );
}

