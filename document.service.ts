import fs from "fs";
import path from "path";
import {
  DocumentRecord,
  DashboardStats,
  DocumentType,
  DocumentStatus,
  ExtractedInvoice,
  AIResult,
} from "@/types/document";
import { HistoryQueryParams } from "@/types/api";
import { ocrService } from "./ocr.service";
import { aiExtractorService } from "./ai-extractor.service";
import { cleanAndValidateInvoice } from "./data-cleaner.service";
import { createTallyImportRows } from "@/lib/tally-utils";

const DOCS_CACHE_FILE = path.join(process.cwd(), ".documents-cache.json");
const DOCS_FILES_DIR = path.join(process.cwd(), ".document-files");

// Initial seed mock documents for immediate interactive experience
const initialDocuments: DocumentRecord[] = [
  {
    id: "doc-demo-inv-1",
    userId: "usr_demo_01",
    fileName: "TechCorp_Tax_Invoice_2026_09.pdf",
    fileType: "application/pdf",
    fileSize: 428000,
    fileUrl: "https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/examples/learning/helloworld.pdf",
    status: "ready_for_validation",
    documentType: "Invoice",
    confidenceScore: 96.8,
    pageCount: 1,
    uploadedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    updatedAt: new Date().toISOString(),
    ocrResult: {
      id: "ocr_1",
      documentId: "doc-demo-inv-1",
      rawText: `TAX INVOICE\nTechCorp Solutions Private Limited\nGSTIN: 27AABCT3421A1Z7\nInvoice Number: INV-2026-8891\nDate: 01/09/2026\nGrand Total: 148,680.00`,
      pageCount: 1,
      tables: [],
      keyValuePairs: [
        { key: "Invoice Number", value: "INV-2026-8891", confidence: 99 },
        { key: "Invoice Date", value: "01/09/2026", confidence: 98 },
        { key: "Vendor Name", value: "TechCorp Solutions Private Limited", confidence: 98 },
        { key: "Vendor GSTIN", value: "27AABCT3421A1Z7", confidence: 99 },
        { key: "Grand Total", value: "148,680.00", confidence: 98 },
      ],
      lines: [],
      provider: "azure",
      modelUsed: "prebuilt-invoice",
      structuredData: {
        vendorName: "TechCorp Solutions Private Limited",
        vendorGstin: "27AABCT3421A1Z7",
        vendorPan: "AABCT3421A",
        vendorEmail: "billing@techcorp.in",
        vendorPhone: "+91 98201 12345",
        vendorAddress: "401 Business Bay, BKC, Mumbai, MH 400051",
        customerName: "Zenith Enterprise Global",
        customerGstin: "29AABCZ9981K1ZP",
        customerAddress: "Brigade Gateway, Rajajinagar, Bengaluru, KA 560055",
        invoiceNumber: "INV-2026-8891",
        invoiceDate: "2026-09-01",
        dueDate: "2026-09-15",
        poNumber: "PO-2026-901",
        currency: "INR",
        items: [
          {
            id: "item_1",
            description: "Cloud Architecture Consulting",
            hsn: "998313",
            qty: 40,
            rate: 2500,
            discount: 0,
            gstRate: 18,
            cgst: 9000,
            sgst: 9000,
            igst: 0,
            total: 118000,
            confidence: 98,
          },
          {
            id: "item_2",
            description: "Enterprise Security Audit",
            hsn: "998314",
            qty: 1,
            rate: 26000,
            discount: 0,
            gstRate: 18,
            cgst: 2340,
            sgst: 2340,
            igst: 0,
            total: 30680,
            confidence: 95,
          },
        ],
        subTotal: 126000,
        cgstTotal: 11340,
        sgstTotal: 11340,
        igstTotal: 0,
        totalTax: 22680,
        grandTotal: 148680,
      },
      createdAt: new Date().toISOString(),
    },
    aiResult: {
      id: "ai_1",
      documentId: "doc-demo-inv-1",
      documentType: "Invoice",
      overallConfidence: 96.8,
      fieldConfidences: {
        vendorName: 98,
        vendorGstin: 99,
        invoiceNumber: 99,
        invoiceDate: 97,
        grandTotal: 98,
        items: 95,
      },
      rawExtractedData: {},
      cleanedData: {
        vendorName: "TechCorp Solutions Private Limited",
        vendorGstin: "27AABCT3421A1Z7",
        vendorPan: "AABCT3421A",
        vendorEmail: "billing@techcorp.in",
        vendorPhone: "+91 98201 12345",
        vendorAddress: "401 Business Bay, BKC, Mumbai, MH 400051",
        customerName: "Zenith Enterprise Global",
        customerGstin: "29AABCZ9981K1ZP",
        customerAddress: "Brigade Gateway, Rajajinagar, Bengaluru, KA 560055",
        invoiceNumber: "INV-2026-8891",
        invoiceDate: "2026-09-01",
        dueDate: "2026-09-15",
        poNumber: "PO-2026-901",
        currency: "INR",
        items: [
          {
            id: "item_1",
            description: "Cloud Architecture Consulting",
            hsn: "998313",
            qty: 40,
            rate: 2500,
            discount: 0,
            gstRate: 18,
            cgst: 9000,
            sgst: 9000,
            igst: 0,
            total: 118000,
            confidence: 98,
          },
          {
            id: "item_2",
            description: "Enterprise Security Audit",
            hsn: "998314",
            qty: 1,
            rate: 26000,
            discount: 0,
            gstRate: 18,
            cgst: 2340,
            sgst: 2340,
            igst: 0,
            total: 30680,
            confidence: 95,
          },
        ],
        subTotal: 126000,
        cgstTotal: 11340,
        sgstTotal: 11340,
        igstTotal: 0,
        totalTax: 22680,
        grandTotal: 148680,
        notes: "Payment Terms: Net 15 Days. Bank: HDFC Bank IFSC: HDFC0001234",
      },
      validationErrors: [],
      flags: {
        isDuplicateInvoice: false,
        isDuplicateVendor: false,
        isGstinValid: true,
        isPanValid: true,
        isCalculationAccurate: true,
        hasMissingFields: false,
      },
      cleaningAudit: {
        trimmedSpacesCount: 4,
        normalizedVendorName: "TechCorp Solutions Private Limited",
        standardizedDatesCount: 1,
        ocrCorrectionsCount: 1,
        duplicateRowsRemoved: 0,
      },
      status: "pending_validation",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  },
  {
    id: "doc-demo-pan-2",
    userId: "usr_demo_01",
    fileName: "Identity_PAN_Card_KAPIL.jpg",
    fileType: "image/jpeg",
    fileSize: 184000,
    fileUrl: "",
    status: "approved",
    documentType: "PAN",
    confidenceScore: 98.2,
    pageCount: 1,
    uploadedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "doc-demo-po-3",
    userId: "usr_demo_01",
    fileName: "GlobalLogistics_PurchaseOrder_PO-5512.pdf",
    fileType: "application/pdf",
    fileSize: 720000,
    fileUrl: "",
    status: "approved",
    documentType: "Purchase Order",
    confidenceScore: 92.5,
    pageCount: 1,
    uploadedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "doc-demo-inv-4",
    userId: "usr_demo_01",
    fileName: "Scanned_Vendor_Challan_Blur.png",
    fileType: "image/png",
    fileSize: 310000,
    fileUrl: "",
    status: "ready_for_validation",
    documentType: "Delivery Challan",
    confidenceScore: 68.4,
    pageCount: 1,
    uploadedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

class DocumentService {
  private documents: Map<string, DocumentRecord> = new Map();
  private fileBuffers: Map<string, { buffer: Buffer; fileName: string; mimeType: string }> = new Map();

  constructor() {
    this.loadPersistedDocuments();
  }

  private loadPersistedDocuments(): void {
    try {
      if (fs.existsSync(DOCS_CACHE_FILE)) {
        const raw = fs.readFileSync(DOCS_CACHE_FILE, "utf-8");
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) {
          let updatedAny = false;
          for (const doc of list) {
            if (!doc.tallyImportRows || doc.tallyImportRows.length === 0) {
              doc.tallyImportRows = createTallyImportRows(doc);
              updatedAny = true;
            }
            this.documents.set(doc.id, doc);
          }
          if (updatedAny) {
            this.savePersistedDocuments();
          }
          console.log(`[Document Service] Loaded ${list.length} persisted documents from cache.`);
          return;
        }
      }
    } catch (e) {
      console.warn("[Document Service] Failed to load .documents-cache.json:", e);
    }

    // Seed defaults only if no cache exists
    for (const doc of initialDocuments) {
      if (!doc.tallyImportRows || doc.tallyImportRows.length === 0) {
        doc.tallyImportRows = createTallyImportRows(doc);
      }
      this.documents.set(doc.id, doc);
    }
  }

  private savePersistedDocuments(): void {
    try {
      const list = Array.from(this.documents.values());
      fs.writeFileSync(DOCS_CACHE_FILE, JSON.stringify(list, null, 2), "utf-8");
    } catch (e) {
      console.warn("[Document Service] Failed to save .documents-cache.json:", e);
    }
  }

  public async getLatestDocument(): Promise<DocumentRecord | null> {
    const all = Array.from(this.documents.values());
    if (all.length === 0) return null;
    // Prefer non-demo documents first
    const userDocs = all.filter((d) => !d.id.startsWith("doc-demo-"));
    const candidateList = userDocs.length > 0 ? userDocs : all;
    candidateList.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    return candidateList[0] || null;
  }

  public async getDocumentByInvoiceNumber(invNo: string): Promise<DocumentRecord | null> {
    if (!invNo) return null;
    const clean = invNo.trim().toLowerCase();
    for (const doc of this.documents.values()) {
      const num = doc.aiResult?.cleanedData?.invoiceNumber;
      if (num && num.trim().toLowerCase() === clean) {
        return doc;
      }
    }
    return null;
  }

  public async getAllDocuments(): Promise<DocumentRecord[]> {
    this.loadPersistedDocuments();
    return Array.from(this.documents.values());
  }

  public storeFileBuffer(
    documentId: string,
    buffer: Buffer,
    fileName: string,
    mimeType: string
  ): void {
    this.fileBuffers.set(documentId, { buffer, fileName, mimeType });
    try {
      if (!fs.existsSync(DOCS_FILES_DIR)) {
        fs.mkdirSync(DOCS_FILES_DIR, { recursive: true });
      }
      const binPath = path.join(DOCS_FILES_DIR, `${documentId}.bin`);
      const metaPath = path.join(DOCS_FILES_DIR, `${documentId}.meta.json`);
      fs.writeFileSync(binPath, buffer);
      fs.writeFileSync(
        metaPath,
        JSON.stringify({ fileName, mimeType, size: buffer.length }),
        "utf-8"
      );
    } catch (err) {
      console.warn(`[Document Service] Failed to persist file buffer to disk for ${documentId}:`, err);
    }
  }

  public getFileBuffer(documentId: string): Buffer | null {
    const item = this.fileBuffers.get(documentId);
    if (item?.buffer) return item.buffer;

    // Check disk storage (.document-files/)
    try {
      const binPath = path.join(DOCS_FILES_DIR, `${documentId}.bin`);
      if (fs.existsSync(binPath)) {
        const buf = fs.readFileSync(binPath);
        let meta = { fileName: "document", mimeType: "application/octet-stream" };
        const metaPath = path.join(DOCS_FILES_DIR, `${documentId}.meta.json`);
        if (fs.existsSync(metaPath)) {
          try {
            meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
          } catch {}
        }
        this.fileBuffers.set(documentId, {
          buffer: buf,
          fileName: meta.fileName,
          mimeType: meta.mimeType,
        });
        return buf;
      }
    } catch (err) {
      console.warn(`[Document Service] Error reading file buffer from disk for ${documentId}:`, err);
    }

    return null;
  }

  public getFileEntry(documentId: string): { buffer: Buffer; fileName: string; mimeType: string } | null {
    const item = this.fileBuffers.get(documentId);
    if (item?.buffer) return item;

    try {
      const binPath = path.join(DOCS_FILES_DIR, `${documentId}.bin`);
      if (fs.existsSync(binPath)) {
        const buf = fs.readFileSync(binPath);
        let meta = { fileName: "document", mimeType: "application/octet-stream" };
        const metaPath = path.join(DOCS_FILES_DIR, `${documentId}.meta.json`);
        if (fs.existsSync(metaPath)) {
          try {
            meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
          } catch {}
        }
        const entry = {
          buffer: buf,
          fileName: meta.fileName,
          mimeType: meta.mimeType,
        };
        this.fileBuffers.set(documentId, entry);
        return entry;
      }
    } catch (err) {
      console.warn(`[Document Service] Error reading file entry from disk for ${documentId}:`, err);
    }

    return null;
  }

  public async getDocuments(params: HistoryQueryParams = {}): Promise<{
    documents: DocumentRecord[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    this.loadPersistedDocuments();
    const {
      page = 1,
      limit = 10,
      search = "",
      type = "ALL",
      status = "ALL",
      minConfidence = 0,
      sortBy = "uploadedAt",
      sortOrder = "desc",
    } = params;

    let items = Array.from(this.documents.values());

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (d) =>
          d.fileName.toLowerCase().includes(q) ||
          d.documentType.toLowerCase().includes(q) ||
          (d.aiResult?.cleanedData?.vendorName &&
            d.aiResult.cleanedData.vendorName.toLowerCase().includes(q)) ||
          (d.aiResult?.cleanedData?.invoiceNumber &&
            d.aiResult.cleanedData.invoiceNumber.toLowerCase().includes(q))
      );
    }

    // Type filter
    if (type && type !== "ALL") {
      items = items.filter((d) => d.documentType === type);
    }

    // Status filter
    if (status && status !== "ALL") {
      items = items.filter((d) => d.status === status);
    }

    // Confidence filter
    if (minConfidence > 0) {
      items = items.filter((d) => d.confidenceScore >= minConfidence);
    }

    // Sorting
    items.sort((a, b) => {
      let aVal = a[sortBy] ?? "";
      let bVal = b[sortBy] ?? "";
      if (typeof aVal === "string") {
        return sortOrder === "asc"
          ? (aVal as string).localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal as string);
      }
      return sortOrder === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    const total = items.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginated = items.slice(startIndex, startIndex + limit);

    return {
      documents: paginated,
      total,
      page,
      limit,
      totalPages,
    };
  }

  public async getDocumentById(id: string): Promise<DocumentRecord | null> {
    let doc = this.documents.get(id);
    if (!doc) {
      this.loadPersistedDocuments();
      doc = this.documents.get(id);
    }
    return doc || null;
  }

  public async createDocument(
    fileName: string,
    fileType: string,
    fileSize: number,
    fileUrl: string,
    buffer?: Buffer
  ): Promise<DocumentRecord> {
    const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newDoc: DocumentRecord = {
      id,
      userId: "usr_demo_01",
      fileName,
      fileType,
      fileSize,
      fileUrl,
      status: "uploaded",
      documentType: "Unknown",
      confidenceScore: 0,
      pageCount: 1,
      uploadedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.documents.set(id, newDoc);
    this.savePersistedDocuments();
    if (buffer) {
      this.storeFileBuffer(id, buffer, fileName, fileType);
    }
    return newDoc;
  }

  public async processOcrForDocument(
    documentId: string,
    fileBuffer?: Buffer
  ): Promise<DocumentRecord> {
    const doc = this.documents.get(documentId);
    if (!doc) throw new Error(`Document not found: ${documentId}`);

    const bufferToUse = fileBuffer || this.getFileBuffer(documentId);
    if (!bufferToUse) {
      throw new Error(
        `OCR Aborted: No file content/buffer found for document "${doc.fileName}" (${documentId}). Upload must provide actual file bytes.`
      );
    }

    doc.status = "ocr_processing";
    doc.updatedAt = new Date().toISOString();

    const ocrResult = await ocrService.analyzeDocument(
      bufferToUse,
      doc.fileName,
      documentId,
      doc.fileType
    );

    doc.ocrResult = ocrResult;
    doc.pageCount = ocrResult.pageCount;
    doc.status = "extracting";
    this.documents.set(documentId, doc);

    return doc;
  }

  public async extractAndCleanDocument(documentId: string): Promise<DocumentRecord> {
    const doc = this.documents.get(documentId);
    if (!doc) throw new Error("Document not found");
    if (!doc.ocrResult) {
      await this.processOcrForDocument(documentId);
    }

    doc.status = "cleaning";
    doc.updatedAt = new Date().toISOString();

    const existing = Array.from(this.documents.values())
      .filter((d) => d.id !== documentId && d.aiResult?.cleanedData)
      .map((d) => ({
        invoiceNumber: d.aiResult!.cleanedData.invoiceNumber || "",
        vendorName: d.aiResult!.cleanedData.vendorName || "",
      }));

    const aiResult = await aiExtractorService.extractStructuredData(
      doc.ocrResult!,
      doc.fileName,
      existing
    );

    doc.aiResult = aiResult;
    doc.documentType = aiResult.documentType;
    doc.confidenceScore = aiResult.overallConfidence;
    doc.status = "ready_for_validation";
    doc.updatedAt = new Date().toISOString();
    doc.tallyImportRows = createTallyImportRows(doc);

    // Modular Duplicate Invoice Detection (Requirements 1, 2, 4, 8, 9)
    try {
      const { checkDuplicateInvoice } = await import("@/lib/duplicate-check");
      const otherDocs = Array.from(this.documents.values()).filter((d) => d.id !== documentId);
      const dupCheck = checkDuplicateInvoice(
        {
          invoiceNumber: aiResult.cleanedData?.invoiceNumber,
          vendorName: aiResult.cleanedData?.vendorName,
          invoiceDate: aiResult.cleanedData?.invoiceDate,
          grandTotal: aiResult.cleanedData?.grandTotal,
          currentDocumentId: documentId,
        },
        otherDocs
      );

      if (dupCheck.isDuplicate) {
        doc.isDuplicate = true;
        doc.duplicateInfo = dupCheck.details;
        if (doc.aiResult?.flags) {
          doc.aiResult.flags.isDuplicateInvoice = true;
        }
        console.log(`\n=================== DUPLICATE INVOICE DETECTED ===================`);
        console.log(dupCheck.warningMessage);
        console.log(`==================================================================\n`);
      } else {
        doc.isDuplicate = false;
      }
    } catch (dupErr) {
      console.warn("[Duplicate Check Error] Non-blocking duplicate check error:", dupErr);
    }

    this.documents.set(documentId, doc);
    this.savePersistedDocuments();
    return doc;
  }

  public async updateDocument(
    documentId: string,
    updates: {
      cleanedData?: Partial<ExtractedInvoice>;
      aiResult?: AIResult;
      status?: DocumentStatus;
      documentType?: DocumentType;
      rejectionReason?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<DocumentRecord> {
    const doc = this.documents.get(documentId);
    if (!doc) throw new Error("Document not found");

    if (updates.metadata) {
      doc.metadata = { ...(doc.metadata || {}), ...updates.metadata };
    }

    if (updates.documentType) {
      doc.documentType = updates.documentType;
    }

    if (updates.aiResult) {
      doc.aiResult = updates.aiResult;
    }

    if (updates.status) {
      doc.status = updates.status;
      if (doc.aiResult) {
        if (updates.status === "approved") {
          doc.aiResult.status = "approved";
          doc.aiResult.reviewedAt = new Date().toISOString();
        } else if (updates.status === "rejected") {
          doc.aiResult.status = "rejected";
          doc.aiResult.rejectionReason = updates.rejectionReason;
          doc.aiResult.reviewedAt = new Date().toISOString();
        }
      }
    }

    if (updates.cleanedData && doc.aiResult) {
      const merged = {
        ...doc.aiResult.cleanedData,
        ...updates.cleanedData,
      } as ExtractedInvoice;

      const cleaned = cleanAndValidateInvoice(merged);
      doc.aiResult.cleanedData = cleaned.cleaned;
      doc.aiResult.validationErrors = cleaned.validationErrors;
      doc.aiResult.flags = cleaned.flags;
      doc.confidenceScore = cleaned.overallConfidence;
      doc.aiResult.overallConfidence = cleaned.overallConfidence;
      doc.tallyImportRows = createTallyImportRows(doc);
    }

    doc.updatedAt = new Date().toISOString();
    this.documents.set(documentId, doc);
    this.savePersistedDocuments();
    return doc;
  }

  public async deleteDocument(documentId: string): Promise<boolean> {
    const res = this.documents.delete(documentId);
    if (res) this.savePersistedDocuments();
    return res;
  }

  public async getDashboardStats(): Promise<DashboardStats> {
    const all = Array.from(this.documents.values());
    const total = all.length;
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    const documentsToday = all.filter((d) => d.uploadedAt.startsWith(today)).length;
    const successfulOcr = all.filter(
      (d) => d.status === "approved" || d.status === "ready_for_validation"
    ).length;
    const failedOcr = all.filter((d) => d.status === "rejected").length;

    const confidences = all.filter((d) => d.confidenceScore > 0).map((d) => d.confidenceScore);
    const averageConfidence =
      confidences.length > 0
        ? Number((confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(1))
        : 0;

    const successRate =
      total > 0 ? Number(((successfulOcr / total) * 100).toFixed(1)) : 100;

    const typeDistribution: Record<DocumentType, number> = {
      Invoice: 0,
      "Purchase Order": 0,
      Quotation: 0,
      "Delivery Challan": 0,
      "Gate Pass": 0,
      Resume: 0,
      "Bank Statement": 0,
      Passport: 0,
      PAN: 0,
      Aadhaar: 0,
      "Driving License": 0,
      Unknown: 0,
    };

    for (const d of all) {
      if (typeDistribution[d.documentType] !== undefined) {
        typeDistribution[d.documentType]++;
      } else {
        typeDistribution.Unknown++;
      }
    }

    return {
      totalDocuments: total,
      documentsToday,
      successfulOcr,
      failedOcr,
      averageConfidence,
      successRate,
      typeDistribution,
    };
  }
}

// Global singleton instance
const globalForDocs = globalThis as unknown as { documentService?: DocumentService };
export const documentService = globalForDocs.documentService || new DocumentService();
if (process.env.NODE_ENV !== "production") globalForDocs.documentService = documentService;
