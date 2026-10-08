import React from "react";
import Link from "next/link";
import { DocumentRecord } from "@/types/document";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { formatDate, formatCurrency, getConfidenceBadge } from "@/lib/utils";
import { STATUS_CONFIG } from "@/lib/constants";
import {
  FileText,
  ExternalLink,
  Sparkles,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";

interface RecentUploadsProps {
  documents: DocumentRecord[];
}

export function RecentUploads({ documents }: RecentUploadsProps) {
  return (
    <div className="rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 overflow-hidden shadow-xl">
      <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-100">Recent Uploads</h3>
          <p className="text-xs text-slate-400">
            Latest documents processed through Azure OCR & OpenAI
          </p>
        </div>
        <Link href="/documents">
          <Button variant="ghost" size="sm" className="text-xs gap-1 text-sky-400">
            View All Documents <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/40 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800/80">
            <tr>
              <th className="px-6 py-3 font-semibold">Document</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Vendor / Subject</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Confidence</th>
              <th className="px-4 py-3 font-semibold">Total Amount</th>
              <th className="px-6 py-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {documents.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                  No documents processed yet. Upload your first document to get started.
                </td>
              </tr>
            ) : (
              documents.map((doc) => {
                const statusCfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.uploaded;
                const confBadge = getConfidenceBadge(doc.confidenceScore);
                const vendor = String(
                  doc.aiResult?.cleanedData?.vendorName ||
                  doc.metadata?.vendor ||
                  "N/A"
                );
                const total = doc.aiResult?.cleanedData?.grandTotal || 0;
                const currency = doc.aiResult?.cleanedData?.currency || "INR";

                return (
                  <tr
                    key={doc.id}
                    className="hover:bg-slate-800/30 transition-colors group"
                  >
                    <td className="px-6 py-3.5 font-medium text-slate-100 flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="overflow-hidden">
                        <p className="truncate max-w-[180px] text-xs font-semibold text-slate-200">
                          {doc.fileName}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {formatDate(doc.uploadedAt)}
                        </p>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700/60 font-medium text-[11px]">
                        {doc.documentType}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-slate-300 max-w-[180px] truncate">
                      {vendor}
                    </td>

                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {statusCfg.label}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-semibold ${confBadge.color} text-xs`}
                        >
                          {doc.confidenceScore}%
                        </span>
                        {doc.aiResult?.validationErrors &&
                          doc.aiResult.validationErrors.length > 0 && (
                            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                          )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 font-semibold text-slate-200">
                      {total > 0 ? formatCurrency(total, currency) : "—"}
                    </td>

                    <td className="px-6 py-3.5 text-right">
                      <Link href={`/documents/${doc.id}/validate`}>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-7 text-xs px-2.5 py-0 gap-1 hover:border-sky-500/50"
                        >
                          <Sparkles className="w-3 h-3 text-sky-400" />
                          <span>Validate</span>
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
