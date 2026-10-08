/**
 * Official Indian GST 2-Digit State & Union Territory Codes Mapping
 * Reference: Section 12 & 13 of IGST Act / GST Council official codes.
 */
export const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Daman and Diu",
  "26": "Dadra and Nagar Haveli",
  "27": "Maharashtra",
  "28": "Andhra Pradesh (Old)",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
  "99": "Centre Jurisdiction",
};

/**
 * Extracts 2-digit GST state code and full state name from an Indian GSTIN.
 * Returns empty strings if GSTIN is invalid or missing.
 */
export function getStateFromGstin(gstin?: string | null): { state: string; stateCode: string } {
  if (!gstin || typeof gstin !== "string") {
    return { state: "", stateCode: "" };
  }
  const clean = gstin.trim().toUpperCase();
  const match = clean.match(/^(\d{2})[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/);
  const code = match ? match[1] : clean.substring(0, 2);

  if (/^\d{2}$/.test(code) && GST_STATE_CODES[code]) {
    return { state: GST_STATE_CODES[code], stateCode: code };
  }

  return { state: "", stateCode: "" };
}

/**
 * Normalizes a state name to official GST State name and code.
 */
export function getStateFromText(text?: string | null): { state: string; stateCode: string } {
  if (!text || typeof text !== "string") {
    return { state: "", stateCode: "" };
  }
  const clean = text.trim().toLowerCase();

  for (const [code, stateName] of Object.entries(GST_STATE_CODES)) {
    if (stateName.toLowerCase() === clean || clean.includes(stateName.toLowerCase())) {
      return { state: stateName, stateCode: code };
    }
  }

  return { state: text.trim(), stateCode: "" };
}

export interface PlaceOfSupplyResolution {
  supplierState: string;
  supplierStateCode: string;
  customerState: string;
  customerStateCode: string;
  placeOfSupply: string;
  supplyType: "Intrastate" | "Interstate";
}

/**
 * Determines Place of Supply and Supply Type (Intrastate vs Interstate).
 * Enforces Indian GST rules:
 * - If Supplier State === Customer State / Place of Supply => Intrastate (CGST + SGST)
 * - If Supplier State !== Customer State / Place of Supply => Interstate (IGST)
 */
export function determinePlaceOfSupply(params: {
  supplierGstin?: string | null;
  customerGstin?: string | null;
  companyGstin?: string | null;
  explicitPos?: string | null;
  isSales?: boolean;
}): PlaceOfSupplyResolution {
  const { supplierGstin, customerGstin, companyGstin, explicitPos, isSales } = params;

  // 1. Resolve Supplier State
  let supplierRes = getStateFromGstin(supplierGstin);
  if (!supplierRes.state && isSales && companyGstin) {
    supplierRes = getStateFromGstin(companyGstin);
  }

  // 2. Resolve Customer State
  let customerRes = getStateFromGstin(customerGstin);
  if (!customerRes.state && !isSales && companyGstin) {
    customerRes = getStateFromGstin(companyGstin);
  }

  // 3. Resolve Place of Supply
  let pos = "";
  if (explicitPos && explicitPos.trim()) {
    const fromText = getStateFromText(explicitPos);
    pos = fromText.state || explicitPos.trim();
  }

  if (!pos) {
    pos = customerRes.state || supplierRes.state || "Not Specified";
  }

  // 4. Determine Supply Type
  let supplyType: "Intrastate" | "Interstate" = "Intrastate";

  if (supplierRes.stateCode && customerRes.stateCode) {
    supplyType = supplierRes.stateCode === customerRes.stateCode ? "Intrastate" : "Interstate";
  } else if (supplierRes.state && pos && pos !== "Not Specified") {
    supplyType = supplierRes.state.toLowerCase() === pos.toLowerCase() ? "Intrastate" : "Interstate";
  }

  return {
    supplierState: supplierRes.state || (supplierRes.stateCode ? `State (${supplierRes.stateCode})` : "Not Specified"),
    supplierStateCode: supplierRes.stateCode,
    customerState: customerRes.state || (customerRes.stateCode ? `State (${customerRes.stateCode})` : "Not Specified"),
    customerStateCode: customerRes.stateCode,
    placeOfSupply: pos,
    supplyType,
  };
}
