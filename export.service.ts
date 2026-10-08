import * as XLSX from "xlsx";
import { DocumentRecord, ExtractedInvoice } from "@/types/document";

export class ExportService {
  /**
   * Generates a multi-sheet formatted Excel workbook (.xlsx)
   */
  public static generateExcel(document: DocumentRecord): Uint8Array {
    const wb = XLSX.utils.book_new();
    const data: ExtractedInvoice =
      document.aiResult?.cleanedData || ({} as ExtractedInvoice);

    // Sheet 1: Document Summary
    const summaryRows = [
      ["AI OCR STUDIO - EXTRACTED DOCUMENT REPORT"],
      ["Generated At", new Date().toISOString()],
      ["Document Name", document.fileName],
      ["Document Type", document.documentType],
      ["Extraction Status", document.status.toUpperCase()],
      ["Confidence Score", `${document.confidenceScore}%`],
      [],
      ["--- VENDOR INFORMATION ---"],
      ["Vendor Name", data.vendorName || "N/A"],
      ["Vendor GSTIN", data.vendorGstin || "N/A"],
      ["Vendor PAN", data.vendorPan || "N/A"],
      ["Vendor Email", data.vendorEmail || "N/A"],
      ["Vendor Phone", data.vendorPhone || "N/A"],
      ["Vendor Address", data.vendorAddress || "N/A"],
      [],
      ["--- CUSTOMER INFORMATION ---"],
      ["Customer Name", data.customerName || "N/A"],
      ["Customer GSTIN", data.customerGstin || "N/A"],
      ["Customer Address", data.customerAddress || "N/A"],
      [],
      ["--- INVOICE FINANCIAL SUMMARY ---"],
      ["Invoice Number", data.invoiceNumber || "N/A"],
      ["Invoice Date", data.invoiceDate || "N/A"],
      ["Due Date", data.dueDate || "N/A"],
      ["PO Reference", data.poNumber || "N/A"],
      ["Currency", data.currency || "INR"],
      ["Subtotal Amount", data.subTotal || 0],
      ["Total CGST", data.cgstTotal || 0],
      ["Total SGST", data.sgstTotal || 0],
      ["Total IGST", data.igstTotal || 0],
      ["Total Tax", data.totalTax || 0],
      ["Grand Total", data.grandTotal || 0],
      [],
      ["Notes / Terms", data.notes || "None"],
    ];

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
    summaryWs["!cols"] = [{ wch: 28 }, { wch: 45 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

    // Sheet 2: Line Items
    const itemHeaders = [
      "Item #",
      "Description",
      "HSN / SAC",
      "Quantity",
      "Rate",
      "Discount",
      "Taxable Value",
      "GST %",
      "CGST",
      "SGST",
      "IGST",
      "Total Amount",
    ];

    const itemRows = (data.items || []).map((item, index) => {
      const taxable = Math.max(0, item.qty * item.rate - item.discount);
      return [
        index + 1,
        item.description,
        item.hsn,
        item.qty,
        item.rate,
        item.discount,
        taxable,
        `${item.gstRate}%`,
        item.cgst,
        item.sgst,
        item.igst,
        item.total,
      ];
    });

    const itemsWs = XLSX.utils.aoa_to_sheet([itemHeaders, ...itemRows]);
    itemsWs["!cols"] = [
      { wch: 8 },
      { wch: 35 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 10 },
      { wch: 14 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, itemsWs, "Line Items");

    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
  }

  /**
   * Generates Clean CSV formatted string
   */
  public static generateCsv(document: DocumentRecord): string {
    const data = document.aiResult?.cleanedData || ({} as ExtractedInvoice);
    const lines: string[] = [];

    lines.push(`"Invoice Number","${data.invoiceNumber || ""}"`);
    lines.push(`"Invoice Date","${data.invoiceDate || ""}"`);
    lines.push(`"Vendor Name","${(data.vendorName || "").replace(/"/g, '""')}"`);
    lines.push(`"Vendor GSTIN","${data.vendorGstin || ""}"`);
    lines.push(`"Customer Name","${(data.customerName || "").replace(/"/g, '""')}"`);
    lines.push(`"Currency","${data.currency || "INR"}"`);
    lines.push(`"Grand Total","${data.grandTotal || 0}"`);
    lines.push("");
    lines.push(
      `"Index","Description","HSN","Quantity","Rate","Discount","GST%","Total"`
    );

    (data.items || []).forEach((item, index) => {
      lines.push(
        `"${index + 1}","${(item.description || "").replace(/"/g, '""')}","${item.hsn}","${item.qty}","${item.rate}","${item.discount}","${item.gstRate}%","${item.total}"`
      );
    });

    return lines.join("\n");
  }

  /**
   * Generates Clean JSON object
   */
  public static generateJson(document: DocumentRecord): string {
    const exportObject = {
      meta: {
        exportedAt: new Date().toISOString(),
        documentId: document.id,
        fileName: document.fileName,
        documentType: document.documentType,
        confidenceScore: document.confidenceScore,
        status: document.status,
      },
      extractedData: document.aiResult?.cleanedData,
      rawOcrPreview: document.ocrResult?.rawText?.slice(0, 500),
    };
    return JSON.stringify(exportObject, null, 2);
  }

  /**
   * Phase 6: Generates multi-sheet bulk Excel workbook (.xlsx)
   * Sheet 1: Invoices (Standard schema)
   * Sheet 2: Invoice Items (All line items across all invoices)
   */
  public static generateBulkExcel(documents: DocumentRecord[]): Uint8Array {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Invoices
    const INVOICES_HEADERS = [
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
      "Tax Total",
      "Grand Total",
      "Items Count",
      "Confidence Score",
      "Processed Date",
    ];

    const invoiceRows: any[][] = [];
    const itemRows: any[][] = [];

    for (const doc of documents) {
      const data: ExtractedInvoice =
        doc.aiResult?.cleanedData || ({} as ExtractedInvoice);
      const invNo = (data.invoiceNumber || doc.fileName.replace(/\.[^/.]+$/, "")).trim();

      invoiceRows.push([
        doc.documentType || "Invoice",
        data.vendorName || "Unassigned Vendor",
        data.vendorGstin || "",
        data.vendorPan || "",
        data.customerName || "",
        data.customerGstin || "",
        invNo,
        data.invoiceDate || "",
        data.dueDate || "",
        data.poNumber || "",
        data.currency || "INR",
        data.notes || (data as any).paymentTerms || "Due on receipt",
        Number(data.subTotal) || 0,
        Number(data.cgstTotal) || 0,
        Number(data.sgstTotal) || 0,
        Number(data.igstTotal) || 0,
        Number(data.totalTax) || 0,
        Number(data.grandTotal) || 0,
        data.items?.length || 0,
        doc.confidenceScore || 95,
        new Date().toISOString().replace("T", " ").substring(0, 19),
      ]);

      if (data.items && data.items.length > 0) {
        for (const it of data.items) {
          const taxable = Number((it.qty * it.rate - (it.discount || 0)).toFixed(2));
          itemRows.push([
            invNo,
            data.vendorName || "",
            it.description || "Supply / Services",
            it.hsn || "",
            Number(it.qty) || 1,
            (it as any).unit || "NOS",
            Number(it.rate) || 0,
            taxable > 0 ? taxable : Number(it.rate) || 0,
            Number(it.cgst) || 0,
            Number(it.sgst) || 0,
            Number(it.igst) || 0,
            Number(it.total) || 0,
          ]);
        }
      }
    }

    // Helper: Creates worksheet with explicit cell types
    const createWorksheetWithTypes = (headers: string[], dataRows: any[][]): XLSX.WorkSheet => {
      const ws: XLSX.WorkSheet = {};
      const range = { s: { c: 0, r: 0 }, e: { c: headers.length - 1, r: dataRows.length } };

      headers.forEach((h, c) => {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c });
        ws[cellRef] = { t: "s", v: h };
      });

      dataRows.forEach((row, rIdx) => {
        const r = rIdx + 1;
        row.forEach((val, c) => {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          if (val === null || val === undefined || val === "") {
            ws[cellRef] = { t: "s", v: "" };
          } else if (typeof val === "number") {
            ws[cellRef] = { t: "n", v: val };
          } else {
            ws[cellRef] = { t: "s", v: String(val).trim() };
          }
        });
      });

      ws["!ref"] = XLSX.utils.encode_range(range);
      return ws;
    };

    // Sheet 1
    const invoicesWs = createWorksheetWithTypes(INVOICES_HEADERS, invoiceRows);
    invoicesWs["!cols"] = [
      { wch: 16 }, // Document Type
      { wch: 32 }, // Vendor Name
      { wch: 18 }, // Vendor GSTIN
      { wch: 14 }, // Vendor PAN
      { wch: 30 }, // Customer Name
      { wch: 18 }, // Customer GSTIN
      { wch: 20 }, // Invoice Number
      { wch: 14 }, // Invoice Date
      { wch: 14 }, // Due Date
      { wch: 16 }, // PO Number
      { wch: 10 }, // Currency
      { wch: 20 }, // Payment Terms
      { wch: 14 }, // Subtotal
      { wch: 12 }, // CGST
      { wch: 12 }, // SGST
      { wch: 12 }, // IGST
      { wch: 14 }, // Total Tax
      { wch: 16 }, // Grand Total
      { wch: 12 }, // Items Count
      { wch: 16 }, // Confidence Score
      { wch: 20 }, // Processed Date
    ];
    XLSX.utils.book_append_sheet(wb, invoicesWs, "Invoices");

    // Sheet 2
    const ITEMS_HEADERS = [
      "Invoice Number",
      "Vendor Name",
      "Item Description",
      "HSN/SAC",
      "Quantity",
      "Unit",
      "Rate",
      "Taxable Amount",
      "CGST",
      "SGST",
      "IGST",
      "Total Amount",
    ];
    const itemsWs = createWorksheetWithTypes(ITEMS_HEADERS, itemRows);
    itemsWs["!cols"] = [
      { wch: 20 },
      { wch: 30 },
      { wch: 35 },
      { wch: 14 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
      { wch: 16 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, itemsWs, "Invoice Items");

    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
  }

  /**
   * Generates Consolidated Bulk CSV formatted string
   */
  public static generateBulkCsv(documents: DocumentRecord[]): string {
    const headers = [
      "Document Type",
      "Vendor Name",
      "Vendor GSTIN",
      "Customer Name",
      "Customer GSTIN",
      "Invoice Number",
      "Invoice Date",
      "Due Date",
      "PO Number",
      "Currency",
      "Subtotal",
      "CGST",
      "SGST",
      "IGST",
      "Total Tax",
      "Grand Total",
      "Confidence Score",
    ];

    const escape = (val: any) => `"${String(val ?? "").replace(/"/g, '""')}"`;
    const lines: string[] = [headers.map(escape).join(",")];

    for (const doc of documents) {
      const data: ExtractedInvoice =
        doc.aiResult?.cleanedData || ({} as ExtractedInvoice);
      lines.push(
        [
          doc.documentType || "Invoice",
          data.vendorName || "",
          data.vendorGstin || "",
          data.customerName || "",
          data.customerGstin || "",
          data.invoiceNumber || doc.fileName.replace(/\.[^/.]+$/, ""),
          data.invoiceDate || "",
          data.dueDate || "",
          data.poNumber || "",
          data.currency || "INR",
          data.subTotal || 0,
          data.cgstTotal || 0,
          data.sgstTotal || 0,
          data.igstTotal || 0,
          data.totalTax || 0,
          data.grandTotal || 0,
          doc.confidenceScore || 95,
        ]
          .map(escape)
          .join(",")
      );
    }

    return lines.join("\n");
  }

  /**
   * Phase 7: Structured JSON download containing all successfully processed invoices
   * Conforms strictly to Requirement 7:
   * { "invoices": [...] }
   */
  public static generateBulkJson(documents: DocumentRecord[]): string {
    const invoices = documents.map((doc) => {
      const data = doc.aiResult?.cleanedData || ({} as ExtractedInvoice);
      return {
        document_id: doc.id,
        file_name: doc.fileName,
        document_type: doc.documentType || "Invoice",
        vendor_name: data.vendorName || "",
        vendor_gstin: data.vendorGstin || "",
        vendor_pan: data.vendorPan || "",
        customer_name: data.customerName || "",
        customer_gstin: data.customerGstin || "",
        invoice_number: data.invoiceNumber || doc.fileName.replace(/\.[^/.]+$/, ""),
        invoice_date: data.invoiceDate || "",
        due_date: data.dueDate || "",
        po_number: data.poNumber || "",
        currency: data.currency || "INR",
        payment_terms: data.notes || (data as any).paymentTerms || "",
        subtotal: Number(data.subTotal) || 0,
        cgst: Number(data.cgstTotal) || 0,
        sgst: Number(data.sgstTotal) || 0,
        igst: Number(data.igstTotal) || 0,
        tax_total: Number(data.totalTax) || 0,
        grand_total: Number(data.grandTotal) || 0,
        confidence_score: doc.confidenceScore || 95,
        items: (data.items || []).map((it) => ({
          description: it.description || "",
          hsn: it.hsn || "",
          quantity: it.qty || 1,
          unit: (it as any).unit || "NOS",
          rate: it.rate || 0,
          taxable_amount: Number((it.qty * it.rate - (it.discount || 0)).toFixed(2)),
          cgst: it.cgst || 0,
          sgst: it.sgst || 0,
          igst: it.igst || 0,
          total: it.total || 0,
        })),
      };
    });

    return JSON.stringify({ invoices }, null, 2);
  }

  /**
   * Section 17: Generates structured Tally-ready JSON array matching TallyVoucher
   */
  public static generateBulkTallyJson(
    documents: DocumentRecord[],
    voucherTypes?: Record<string, "Purchase" | "Sales">
  ): string {
    const { TallyExportService } = require("@/services/tally-export.service");
    return TallyExportService.generateTallyJson(documents, { voucherTypes });
  }
}

