import OpenAI from "openai";
import { geminiService } from "@/lib/ai/gemini";
import {
  AIResult,
  DocumentType,
  ExtractedInvoice,
  OCRResult,
} from "@/types/document";
import { cleanAndValidateInvoice } from "./data-cleaner.service";

export class AiExtractorService {
  private openai: OpenAI | null = null;
  private isOpenAiConfigured: boolean = false;
  private model: string = "gpt-5.5";

  constructor(apiKey?: string, model?: string) {
    const key = (apiKey || process.env.OPENAI_API_KEY || "").trim();
    if (key && key.startsWith("sk-") && key !== "sk-proj-your-openai-api-key") {
      try {
        this.openai = new OpenAI({ apiKey: key });
        this.isOpenAiConfigured = true;
      } catch (e) {
        console.warn("Failed to initialize OpenAI client:", e);
      }
    }
    this.model = model || process.env.OPENAI_MODEL || "gpt-5.5";
  }

  public getStatus(): { isConfigured: boolean; model: string; provider: "openai" | "gemini" } {
    if (this.isOpenAiConfigured && this.openai) {
      return {
        isConfigured: true,
        model: this.model,
        provider: "openai",
      };
    }
    let isGeminiConfigured = false;
    try {
      geminiService.getApiKey();
      isGeminiConfigured = true;
    } catch {
      isGeminiConfigured = false;
    }
    return {
      isConfigured: isGeminiConfigured,
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      provider: "gemini",
    };
  }

  /**
   * Detects document category
   */
  public detectDocumentType(ocrResult: OCRResult, fileName: string): DocumentType {
    if (ocrResult.detectedType && ocrResult.detectedType !== "Unknown") {
      return ocrResult.detectedType;
    }

    const text = (ocrResult.rawText + " " + fileName).toLowerCase();

    if (text.includes("permanent account number") || text.includes("income tax department") || text.includes("pan card") || fileName.toLowerCase().includes("pan")) {
      return "PAN";
    }
    if (text.includes("aadhaar") || text.includes("unique identification authority") || text.includes("uidai")) {
      return "Aadhaar";
    }
    if (text.includes("passport") || text.includes("republic of india passport")) {
      return "Passport";
    }
    if (text.includes("driving licence") || text.includes("driving license") || text.includes("transport department")) {
      return "Driving License";
    }
    if (text.includes("purchase order") || text.includes("p.o. number") || fileName.toLowerCase().includes("po-")) {
      return "Purchase Order";
    }
    if (text.includes("delivery challan") || text.includes("challan no")) {
      return "Delivery Challan";
    }
    if (text.includes("gate pass") || text.includes("returnable gate pass")) {
      return "Gate Pass";
    }
    if (text.includes("curriculum vitae") || text.includes("resume") || (text.includes("work experience") && text.includes("skills"))) {
      return "Resume";
    }
    if (text.includes("bank statement") || text.includes("account statement") || (text.includes("opening balance") && text.includes("closing balance"))) {
      return "Bank Statement";
    }
    if (text.includes("quotation") || text.includes("proforma invoice") || text.includes("quote ref")) {
      return "Quotation";
    }
    if (text.includes("tax invoice") || text.includes("invoice") || text.includes("bill to") || text.includes("gstin") || text.includes("hsn")) {
      return "Invoice";
    }

    return "Unknown";
  }

  /**
   * Secondary Processing Pipeline:
   * 1. Takes verbatim structured fields from Azure Document Intelligence
   * 2. Uses GPT-5.5 / LLM strictly for:
   *    - Data Normalization (Vendor legal suffixes, ISO YYYY-MM-DD date formats, PAN derivation)
   *    - Validation & filling genuinely missing metadata without guessing
   * 3. STRICT ENFORCEMENT:
   *    - Zero guessing or hallucination of invoice fields.
   *    - All extracted numeric values (subtotal, tax, grand total, line items) are preserved 100% exactly from OCR.
   */
  public async processStructuredData(
    ocrResult: OCRResult,
    fileName: string,
    existingInvoices: Array<{ invoiceNumber: string; vendorName: string }> = []
  ): Promise<AIResult> {
    const docType = this.detectDocumentType(ocrResult, fileName);
    const rawOcrData = ocrResult.structuredData || ({} as ExtractedInvoice);

    // Requirement 3: Use GPT-5.5 for normalization, validation, and filling missing values (not guessing)
    let normalizedData: ExtractedInvoice;
    try {
      normalizedData = await this.normalizeWithGpt(rawOcrData, ocrResult.rawText);
    } catch (normErr) {
      console.warn("[AI Warning] Normalization error, preserving raw OCR data:", normErr);
      normalizedData = rawOcrData;
    }

    // Requirement 10: Debug Log - GPT Normalized Output
    console.log("\n=================== PIPELINE STAGE: GPT NORMALIZED OUTPUT ===================");
    console.log(`[GPT Normalized Output] Model: ${this.isOpenAiConfigured ? this.model : "GPT-5.5 Normalizer"}`);
    console.log(JSON.stringify(normalizedData, null, 2));
    console.log("=============================================================================\n");

    // Run deterministic validator & data cleaner to verify GSTIN Modulo-36, PAN, duplicates
    const cleanResult = cleanAndValidateInvoice(normalizedData, existingInvoices);

    // CRITICAL ENFORCEMENT: Strictly preserve all original numeric values from Azure Document Intelligence
    const finalCleanedData: ExtractedInvoice = {
      ...cleanResult.cleaned,
      // Strictly maintain exact OCR amounts
      subTotal: rawOcrData.subTotal !== undefined && rawOcrData.subTotal !== 0 ? rawOcrData.subTotal : cleanResult.cleaned.subTotal,
      cgstTotal: rawOcrData.cgstTotal !== undefined && rawOcrData.cgstTotal !== 0 ? rawOcrData.cgstTotal : cleanResult.cleaned.cgstTotal,
      sgstTotal: rawOcrData.sgstTotal !== undefined && rawOcrData.sgstTotal !== 0 ? rawOcrData.sgstTotal : cleanResult.cleaned.sgstTotal,
      igstTotal: rawOcrData.igstTotal !== undefined && rawOcrData.igstTotal !== 0 ? rawOcrData.igstTotal : cleanResult.cleaned.igstTotal,
      totalTax: rawOcrData.totalTax !== undefined && rawOcrData.totalTax !== 0 ? rawOcrData.totalTax : cleanResult.cleaned.totalTax,
      grandTotal: rawOcrData.grandTotal !== undefined && rawOcrData.grandTotal !== 0 ? rawOcrData.grandTotal : cleanResult.cleaned.grandTotal,
      currency: rawOcrData.currency || cleanResult.cleaned.currency || "INR",
      items: (cleanResult.cleaned.items || []).map((cleanedItem, index) => {
        const originalOcrItem = rawOcrData.items?.[index];
        return {
          ...cleanedItem,
          qty: originalOcrItem?.qty ?? cleanedItem.qty,
          rate: originalOcrItem?.rate ?? cleanedItem.rate,
          discount: originalOcrItem?.discount ?? cleanedItem.discount,
          gstRate: originalOcrItem?.gstRate ?? cleanedItem.gstRate,
          cgst: originalOcrItem?.cgst ?? cleanedItem.cgst,
          sgst: originalOcrItem?.sgst ?? cleanedItem.sgst,
          igst: originalOcrItem?.igst ?? cleanedItem.igst,
          total: originalOcrItem?.total ?? cleanedItem.total,
        };
      }),
    };

    // Requirement 10: Debug Log - Final JSON Before Saving
    console.log("\n=================== PIPELINE STAGE: FINAL JSON BEFORE SAVING ===================");
    console.log("[Final JSON Before Saving] Extracted, Normalized, and Cleaned Document JSON:");
    console.log(JSON.stringify({
      documentType: docType,
      vendorName: finalCleanedData.vendorName || null,
      vendorGstin: finalCleanedData.vendorGstin || null,
      vendorPan: finalCleanedData.vendorPan || null,
      customerName: finalCleanedData.customerName || null,
      customerGstin: finalCleanedData.customerGstin || null,
      invoiceNumber: finalCleanedData.invoiceNumber || null,
      invoiceDate: finalCleanedData.invoiceDate || null,
      dueDate: finalCleanedData.dueDate || null,
      poNumber: finalCleanedData.poNumber || null,
      currency: finalCleanedData.currency,
      paymentTerms: finalCleanedData.notes || null,
      subTotal: finalCleanedData.subTotal,
      cgst: finalCleanedData.cgstTotal,
      sgst: finalCleanedData.sgstTotal,
      igst: finalCleanedData.igstTotal,
      totalTax: finalCleanedData.totalTax,
      grandTotal: finalCleanedData.grandTotal,
      itemsCount: finalCleanedData.items.length,
      items: finalCleanedData.items,
      validationErrorsCount: cleanResult.validationErrors.length,
      flags: cleanResult.flags,
      overallConfidence: cleanResult.overallConfidence,
    }, null, 2));
    console.log("================================================================================\n");

    return {
      id: `ai_${Date.now()}`,
      documentId: ocrResult.documentId,
      documentType: docType,
      overallConfidence: cleanResult.overallConfidence,
      fieldConfidences: {
        ...(ocrResult.fieldConfidences || {}),
        vendorName: ocrResult.fieldConfidences?.vendorName ?? (finalCleanedData.vendorName ? 98 : 0),
        vendorGstin: ocrResult.fieldConfidences?.vendorGstin ?? (cleanResult.flags.isGstinValid ? 98 : (finalCleanedData.vendorGstin ? 65 : 0)),
        invoiceNumber: ocrResult.fieldConfidences?.invoiceNumber ?? (finalCleanedData.invoiceNumber ? 99 : 0),
        invoiceDate: ocrResult.fieldConfidences?.invoiceDate ?? (finalCleanedData.invoiceDate ? 97 : 0),
        grandTotal: ocrResult.fieldConfidences?.grandTotal ?? (cleanResult.flags.isCalculationAccurate ? 98 : (finalCleanedData.grandTotal ? 75 : 0)),
        items: ocrResult.fieldConfidences?.items ?? (finalCleanedData.items.length > 0 ? 96 : 0),
      },
      rawExtractedData: (ocrResult.rawAzureDocument || ocrResult.structuredData || {}) as unknown as Record<string, unknown>,
      cleanedData: finalCleanedData,
      validationErrors: cleanResult.validationErrors,
      flags: cleanResult.flags,
      cleaningAudit: cleanResult.audit,
      status: "pending_validation",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * GPT-5.5 / LLM Normalization Engine:
   * Uses GPT-5.5 (or Gemini fallback) strictly for normalization and missing value validation.
   * Never invents or guesses fields.
   */
  private async normalizeWithGpt(
    rawDocData: ExtractedInvoice,
    rawText: string = ""
  ): Promise<ExtractedInvoice> {
    const prompt = `You are a precision enterprise invoice data normalization and validation engine.
You are given structured invoice data extracted by Azure Document Intelligence.
Your task is ONLY to normalize and format fields without altering factual information or guessing.

CRITICAL RULES:
1. NEVER invent, guess, or hallucinate missing fields. If a field is not present in the document, return null.
2. NEVER use placeholder values like "Unknown", "N/A", "Missing Invoice Number", or example values.
3. PRESERVE EVERY NUMERIC VALUE:
   - subTotal, cgstTotal, sgstTotal, igstTotal, totalTax, grandTotal must be preserved with exact numeric values.
   - Do NOT round, re-calculate, or alter numeric amounts.
4. NORMALIZE TEXT FIELDS:
   - Vendor Name: Standardize casing and legal suffix (e.g., "PVT LTD" -> "Private Limited", "LTD" -> "Limited", "CORP" -> "Corporation").
   - Dates: Standardize invoiceDate and dueDate to ISO format "YYYY-MM-DD" (e.g., "01/09/2026" -> "2026-09-01").
   - Vendor PAN: If vendorPan is missing or null, derive the 10-character PAN from the 15-character GSTIN (characters 2 to 12) if vendorGstin is valid.
   - Payment Terms: Standardize terms and conditions into clean readable text in "notes".
5. Line items: Preserve all items with exact descriptions, quantities, rates, and amounts.

Return ONLY a valid JSON object matching this schema:
{
  "vendorName": string | null,
  "vendorGstin": string | null,
  "vendorPan": string | null,
  "customerName": string | null,
  "customerGstin": string | null,
  "invoiceNumber": string | null,
  "invoiceDate": string | null,
  "dueDate": string | null,
  "poNumber": string | null,
  "currency": string,
  "items": [
    {
      "description": string,
      "hsn": string | null,
      "qty": number,
      "rate": number,
      "discount": number,
      "gstRate": number,
      "cgst": number,
      "sgst": number,
      "igst": number,
      "total": number
    }
  ],
  "subTotal": number,
  "cgstTotal": number,
  "sgstTotal": number,
  "igstTotal": number,
  "totalTax": number,
  "grandTotal": number,
  "notes": string | null
}

RAW AZURE DOCUMENT DATA:
${JSON.stringify(rawDocData, null, 2)}

RAW DOCUMENT TEXT CONTEXT:
${rawText.substring(0, 3000)}`;

    let responseText = "";

    // 1. Try OpenAI GPT-5.5 if configured
    if (this.isOpenAiConfigured && this.openai) {
      try {
        const completion = await this.openai.chat.completions.create({
          model: this.model,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "You are a precise data normalizer. Extract only visible information. Return valid JSON only.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.0,
        });
        responseText = completion.choices[0]?.message?.content || "";
      } catch (openAiErr) {
        console.warn("[OpenAI Warning] GPT normalization call failed, falling back to Gemini:", openAiErr);
      }
    }

    // 2. Fallback to Gemini if OpenAI is unconfigured or failed
    if (!responseText) {
      try {
        responseText = await geminiService.generateText(prompt, {
          systemInstruction: "You are a precise invoice data normalizer. Extract only visible information. Return valid JSON only.",
          temperature: 0.0,
        });
      } catch (gemErr) {
        console.warn("[Gemini Warning] Gemini normalizer call failed:", gemErr);
        return rawDocData;
      }
    }

    try {
      let cleaned = responseText.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }
      const parsed = JSON.parse(cleaned) as ExtractedInvoice;

      // Merge to ensure no OCR fields were dropped
      return {
        ...rawDocData,
        ...parsed,
        vendorName: parsed.vendorName || rawDocData.vendorName || "",
        vendorGstin: parsed.vendorGstin || rawDocData.vendorGstin || "",
        vendorPan: parsed.vendorPan || rawDocData.vendorPan || (rawDocData.vendorGstin?.length >= 12 ? rawDocData.vendorGstin.substring(2, 12) : undefined),
        customerName: parsed.customerName || rawDocData.customerName || "",
        customerGstin: parsed.customerGstin || rawDocData.customerGstin || undefined,
        invoiceNumber: parsed.invoiceNumber || rawDocData.invoiceNumber || null,
        invoiceDate: parsed.invoiceDate || rawDocData.invoiceDate || "",
        dueDate: parsed.dueDate || rawDocData.dueDate || undefined,
        poNumber: parsed.poNumber || rawDocData.poNumber || undefined,
        notes: parsed.notes || rawDocData.notes || undefined,
        currency: rawDocData.currency || parsed.currency || "INR",
        subTotal: rawDocData.subTotal !== undefined && rawDocData.subTotal !== 0 ? rawDocData.subTotal : (parsed.subTotal || 0),
        cgstTotal: rawDocData.cgstTotal !== undefined && rawDocData.cgstTotal !== 0 ? rawDocData.cgstTotal : (parsed.cgstTotal || 0),
        sgstTotal: rawDocData.sgstTotal !== undefined && rawDocData.sgstTotal !== 0 ? rawDocData.sgstTotal : (parsed.sgstTotal || 0),
        igstTotal: rawDocData.igstTotal !== undefined && rawDocData.igstTotal !== 0 ? rawDocData.igstTotal : (parsed.igstTotal || 0),
        totalTax: rawDocData.totalTax !== undefined && rawDocData.totalTax !== 0 ? rawDocData.totalTax : (parsed.totalTax || 0),
        grandTotal: rawDocData.grandTotal !== undefined && rawDocData.grandTotal !== 0 ? rawDocData.grandTotal : (parsed.grandTotal || 0),
        items: (rawDocData.items && rawDocData.items.length > 0) ? rawDocData.items : (parsed.items || []),
      };
    } catch {
      return rawDocData;
    }
  }

  /**
   * Compatibility alias
   */
  public async extractStructuredData(
    ocrResult: OCRResult,
    fileName: string,
    existingInvoices: Array<{ invoiceNumber: string; vendorName: string }> = []
  ): Promise<AIResult> {
    return this.processStructuredData(ocrResult, fileName, existingInvoices);
  }
}

export const aiExtractorService = new AiExtractorService();
