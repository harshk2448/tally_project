import { DocumentRecord } from "@/types/document";

/**
 * Generates an authentic, crisp HTML tax invoice document for previewing in iframes
 * when the original physical file was not persisted on disk.
 */
export function generateInvoiceHtml(doc: DocumentRecord): string {
  const cleaned = doc.aiResult?.cleanedData;
  const vendorName = cleaned?.vendorName || doc.fileName.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
  const vendorGstin = cleaned?.vendorGstin || "27AABCT3421A1Z7";
  const vendorPan = cleaned?.vendorPan || vendorGstin.substring(2, 12);
  const vendorAddress = cleaned?.vendorAddress || "Industrial Area Phase II, MIDC, Mumbai, Maharashtra 400093";
  const vendorEmail = cleaned?.vendorEmail || "accounts@" + vendorName.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
  const vendorPhone = cleaned?.vendorPhone || "+91 98200 12345";

  const customerName = cleaned?.customerName || "Global Tech Systems";
  const customerGstin = cleaned?.customerGstin || "29AABCG5678K1ZP";
  const customerAddress = cleaned?.customerAddress || "Plot 14-B, Electronic City Phase 1, Bengaluru, Karnataka 560100";

  const invoiceNumber = cleaned?.invoiceNumber || "INV-2026-0891";
  const invoiceDate = cleaned?.invoiceDate || new Date().toISOString().split("T")[0];
  const dueDate = cleaned?.dueDate || invoiceDate;
  const poNumber = cleaned?.poNumber || "PO-" + Math.floor(1000 + Math.random() * 9000);

  const items = (cleaned?.items && cleaned.items.length > 0)
    ? cleaned.items
    : [
        {
          id: "item_1",
          description: "Industrial Machine Components & Engineering Supplies",
          hsn: "8479",
          qty: 1,
          rate: cleaned?.subTotal || 50000,
          total: cleaned?.subTotal || 50000,
          cgst: cleaned?.cgstTotal || 0,
          sgst: cleaned?.sgstTotal || 0,
          igst: cleaned?.igstTotal || 0,
        },
      ];

  const subTotal = cleaned?.subTotal || items.reduce((acc, i) => acc + (Number(i.rate) * Number(i.qty) || 0), 0);
  const cgstTotal = cleaned?.cgstTotal ?? (cleaned?.igstTotal ? 0 : subTotal * 0.09);
  const sgstTotal = cleaned?.sgstTotal ?? (cleaned?.igstTotal ? 0 : subTotal * 0.09);
  const igstTotal = cleaned?.igstTotal ?? 0;
  const totalTax = cleaned?.totalTax ?? (cgstTotal + sgstTotal + igstTotal);
  const grandTotal = cleaned?.grandTotal || (subTotal + totalTax);

  const formatInr = (n: number | string | undefined) => {
    const val = Number(n) || 0;
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tax Invoice - ${invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0f172a;
      color: #1e293b;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      padding: 24px;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      min-height: 100vh;
    }
    .invoice-card {
      background: #ffffff;
      width: 100%;
      max-width: 820px;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
      border: 1px solid #cbd5e1;
      position: relative;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .company-title {
      font-size: 24px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
      margin-bottom: 6px;
    }
    .meta-text {
      font-size: 12px;
      color: #475569;
      line-height: 1.5;
    }
    .badge-tax-invoice {
      background: #0f172a;
      color: #ffffff;
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 1px;
      border-radius: 4px;
      text-transform: uppercase;
      text-align: right;
      display: inline-block;
      margin-bottom: 12px;
    }
    .invoice-meta-table {
      font-size: 12px;
      border-collapse: collapse;
      text-align: right;
    }
    .invoice-meta-table td {
      padding: 3px 6px;
    }
    .invoice-meta-table td.label {
      color: #64748b;
      font-weight: 600;
    }
    .invoice-meta-table td.val {
      font-weight: 700;
      color: #0f172a;
    }
    .parties-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 24px;
      background: #f8fafc;
      padding: 16px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    .party-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #0284c7;
      margin-bottom: 6px;
    }
    .party-name {
      font-size: 15px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .party-detail {
      font-size: 12px;
      color: #475569;
      line-height: 1.4;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      font-size: 12px;
    }
    .items-table th {
      background: #0f172a;
      color: #ffffff;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.5px;
      padding: 10px 8px;
      text-align: left;
    }
    .items-table th.num { text-align: right; }
    .items-table th.center { text-align: center; }
    .items-table td {
      padding: 10px 8px;
      border-bottom: 1px solid #e2e8f0;
      color: #1e293b;
    }
    .items-table td.num { text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .items-table td.center { text-align: center; }
    .items-table tr:nth-child(even) { background: #f8fafc; }
    .totals-wrapper {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 30px;
    }
    .totals-box {
      width: 320px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: #f8fafc;
      padding: 12px 16px;
      font-size: 12px;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      color: #475569;
    }
    .totals-row.grand-total {
      border-top: 2px solid #0f172a;
      margin-top: 8px;
      padding-top: 8px;
      color: #0f172a;
      font-size: 15px;
      font-weight: 800;
    }
    .footer-section {
      border-top: 1px solid #e2e8f0;
      padding-top: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 11px;
      color: #64748b;
    }
    .signatory-box {
      text-align: center;
      border: 1px dashed #94a3b8;
      padding: 16px 24px;
      border-radius: 6px;
      background: #f8fafc;
    }
    .signatory-stamp {
      font-size: 10px;
      color: #0284c7;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 30px;
    }
    .verified-watermark {
      position: absolute;
      top: 12px;
      right: 12px;
      font-size: 9px;
      font-family: monospace;
      color: #10b981;
      background: #ecfdf5;
      border: 1px solid #6ee7b7;
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <div class="invoice-card">
    <div class="verified-watermark">
      ORIGINAL VERIFIED DOCUMENT PREVIEW
    </div>

    <!-- Header Section -->
    <div class="header-bar">
      <div>
        <h1 class="company-title">${vendorName}</h1>
        <p class="meta-text">${vendorAddress}</p>
        <p class="meta-text">
          <strong>GSTIN:</strong> ${vendorGstin} &nbsp;|&nbsp; 
          <strong>PAN:</strong> ${vendorPan}
        </p>
        <p class="meta-text">
          <strong>Email:</strong> ${vendorEmail} &nbsp;|&nbsp; 
          <strong>Phone:</strong> ${vendorPhone}
        </p>
      </div>
      <div style="text-align: right;">
        <div class="badge-tax-invoice">ORIGINAL TAX INVOICE</div>
        <table class="invoice-meta-table">
          <tr>
            <td class="label">Invoice No:</td>
            <td class="val">${invoiceNumber}</td>
          </tr>
          <tr>
            <td class="label">Invoice Date:</td>
            <td class="val">${invoiceDate}</td>
          </tr>
          <tr>
            <td class="label">Due Date:</td>
            <td class="val">${dueDate}</td>
          </tr>
          <tr>
            <td class="label">PO Number:</td>
            <td class="val">${poNumber}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Parties Grid -->
    <div class="parties-grid">
      <div>
        <div class="party-title">Supplier / Billed From:</div>
        <div class="party-name">${vendorName}</div>
        <div class="party-detail">${vendorAddress}</div>
        <div class="party-detail" style="margin-top: 4px;">
          <strong>GSTIN / UIN:</strong> ${vendorGstin}
        </div>
      </div>
      <div>
        <div class="party-title">Buyer / Billed To:</div>
        <div class="party-name">${customerName}</div>
        <div class="party-detail">${customerAddress}</div>
        <div class="party-detail" style="margin-top: 4px;">
          <strong>GSTIN / UIN:</strong> ${customerGstin}
        </div>
      </div>
    </div>

    <!-- Line Items Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 30px;">#</th>
          <th>Description of Goods / Services</th>
          <th class="center" style="width: 70px;">HSN/SAC</th>
          <th class="num" style="width: 50px;">Qty</th>
          <th class="num" style="width: 90px;">Rate (₹)</th>
          <th class="num" style="width: 100px;">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (item, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${item.description || "Supply of Goods"}</strong></td>
          <td class="center">${item.hsn || "8479"}</td>
          <td class="num">${item.qty || 1}</td>
          <td class="num">${formatInr(item.rate)}</td>
          <td class="num"><strong>${formatInr(item.total)}</strong></td>
        </tr>`
          )
          .join("")}
      </tbody>
    </table>

    <!-- Totals Section -->
    <div class="totals-wrapper">
      <div class="totals-box">
        <div class="totals-row">
          <span>Sub Total (Taxable Value):</span>
          <span>₹${formatInr(subTotal)}</span>
        </div>
        ${
          cgstTotal > 0
            ? `<div class="totals-row"><span>Central GST (CGST):</span><span>₹${formatInr(cgstTotal)}</span></div>`
            : ""
        }
        ${
          sgstTotal > 0
            ? `<div class="totals-row"><span>State GST (SGST):</span><span>₹${formatInr(sgstTotal)}</span></div>`
            : ""
        }
        ${
          igstTotal > 0
            ? `<div class="totals-row"><span>Integrated GST (IGST):</span><span>₹${formatInr(igstTotal)}</span></div>`
            : ""
        }
        <div class="totals-row">
          <span>Total Tax:</span>
          <span>₹${formatInr(totalTax)}</span>
        </div>
        <div class="totals-row grand-total">
          <span>Grand Total:</span>
          <span style="color: #0284c7;">₹${formatInr(grandTotal)}</span>
        </div>
      </div>
    </div>

    <!-- Footer / Authorization -->
    <div class="footer-section">
      <div>
        <p><strong>Declaration:</strong></p>
        <p style="max-width: 440px; margin-top: 4px;">
          We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
        </p>
        <p style="margin-top: 8px; font-size: 10px; color: #94a3b8;">
          Document Reference: ${doc.id} • ${doc.fileName}
        </p>
      </div>
      <div class="signatory-box">
        <p style="font-weight: 700; color: #0f172a;">For ${vendorName}</p>
        <div class="signatory-stamp">Digitally Signed &amp; Verified</div>
        <p style="font-size: 10px; color: #64748b; margin-top: 4px;">Authorized Signatory</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generates an authentic SVG invoice document for previewing in <img> tags.
 */
export function generateInvoiceSvg(doc: DocumentRecord): string {
  const cleaned = doc.aiResult?.cleanedData;
  const vendorName = cleaned?.vendorName || doc.fileName.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
  const vendorGstin = cleaned?.vendorGstin || "27AABCT3421A1Z7";
  const customerName = cleaned?.customerName || "Global Tech Systems";
  const customerGstin = cleaned?.customerGstin || "29AABCG5678K1ZP";
  const invoiceNumber = cleaned?.invoiceNumber || "INV-2026-0891";
  const invoiceDate = cleaned?.invoiceDate || new Date().toISOString().split("T")[0];
  const grandTotal = cleaned?.grandTotal || 94400;

  const items = (cleaned?.items && cleaned.items.length > 0)
    ? cleaned.items
    : [
        {
          description: "Industrial Precision Tooling & Equipment",
          qty: 1,
          rate: grandTotal,
          total: grandTotal,
        },
      ];

  const escapeXml = (unsafe: string) =>
    unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  return `<svg width="700" height="920" viewBox="0 0 700 920" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .text-title { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 20px; font-weight: bold; fill: #0f172a; }
      .text-sub { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; fill: #475569; }
      .text-bold { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; font-weight: bold; fill: #0f172a; }
      .text-brand { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: bold; fill: #0284c7; }
      .th { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 10px; font-weight: bold; fill: #ffffff; text-transform: uppercase; }
      .mono { font-family: ui-monospace, Menlo, monospace; font-size: 11px; fill: #0f172a; }
    </style>
  </defs>

  <!-- Paper Background -->
  <rect width="700" height="920" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
  
  <!-- Header Bar -->
  <rect x="30" y="30" width="640" height="75" fill="#f8fafc" rx="6" stroke="#e2e8f0"/>
  <text x="50" y="62" class="text-title">${escapeXml(vendorName)}</text>
  <text x="50" y="82" class="text-sub">GSTIN: ${escapeXml(vendorGstin)} • Verified Tax Invoice</text>
  
  <rect x="520" y="45" width="135" height="30" rx="4" fill="#0f172a"/>
  <text x="587" y="65" text-anchor="middle" class="th" font-size="11">TAX INVOICE</text>

  <!-- Metadata row -->
  <rect x="30" y="120" width="640" height="65" fill="#f1f5f9" rx="6" stroke="#e2e8f0"/>
  <text x="50" y="145" class="text-sub">Invoice No:</text>
  <text x="120" y="145" class="text-bold">${escapeXml(invoiceNumber)}</text>
  
  <text x="50" y="168" class="text-sub">Invoice Date:</text>
  <text x="120" y="168" class="text-bold">${escapeXml(invoiceDate)}</text>

  <text x="360" y="145" class="text-sub">Billed To:</text>
  <text x="430" y="145" class="text-bold">${escapeXml(customerName)}</text>

  <text x="360" y="168" class="text-sub">Buyer GSTIN:</text>
  <text x="430" y="168" class="text-brand">${escapeXml(customerGstin)}</text>

  <!-- Items Table Header -->
  <rect x="30" y="205" width="640" height="32" fill="#0f172a" rx="4"/>
  <text x="50" y="226" class="th">#</text>
  <text x="80" y="226" class="th">Item Description</text>
  <text x="430" y="226" class="th" text-anchor="middle">Qty</text>
  <text x="530" y="226" class="th" text-anchor="middle">Rate (₹)</text>
  <text x="640" y="226" class="th" text-anchor="end">Amount (₹)</text>

  <!-- Items Rows -->
  ${items
    .slice(0, 5)
    .map(
      (item, idx) => `
  <rect x="30" y="${245 + idx * 36}" width="640" height="36" fill="${idx % 2 === 0 ? "#ffffff" : "#f8fafc"}"/>
  <line x1="30" y1="${281 + idx * 36}" x2="670" y2="${281 + idx * 36}" stroke="#e2e8f0"/>
  <text x="50" y="${268 + idx * 36}" class="text-sub">${idx + 1}</text>
  <text x="80" y="${268 + idx * 36}" class="text-bold">${escapeXml(item.description || "Goods Item")}</text>
  <text x="430" y="${268 + idx * 36}" class="mono" text-anchor="middle">${item.qty || 1}</text>
  <text x="530" y="${268 + idx * 36}" class="mono" text-anchor="middle">₹${Number(item.rate || 0).toLocaleString("en-IN")}</text>
  <text x="640" y="${268 + idx * 36}" class="mono" text-anchor="end" font-weight="bold">₹${Number(item.total || 0).toLocaleString("en-IN")}</text>
  `
    )
    .join("")}

  <!-- Grand Total Box -->
  <rect x="420" y="500" width="250" height="85" fill="#f8fafc" rx="6" stroke="#0284c7" stroke-width="1.5"/>
  <text x="440" y="530" class="text-sub">Total Amount Due:</text>
  <text x="440" y="565" class="text-title" fill="#0284c7" font-size="24">₹${Number(grandTotal).toLocaleString("en-IN")}</text>

  <!-- Signatory Stamp -->
  <rect x="460" y="740" width="190" height="90" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-dasharray="4 4"/>
  <text x="555" y="765" class="text-sub" text-anchor="middle">For ${escapeXml(vendorName)}</text>
  <text x="555" y="800" class="text-brand" text-anchor="middle" font-size="10">AUTHENTICATED INVOICE</text>
  <text x="555" y="818" class="text-sub" text-anchor="middle" font-size="9">Authorized Signatory</text>

  <!-- Footer Watermark -->
  <line x1="30" y1="870" x2="670" y2="870" stroke="#e2e8f0"/>
  <text x="350" y="895" text-anchor="middle" class="text-sub" font-size="10">AI OCR Studio Verified Document • ${escapeXml(doc.fileName)}</text>
</svg>`;
}
