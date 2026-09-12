"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/context/AuthContext";

type ImportType = "items" | "parties";

interface TargetFieldDef {
  key: string;
  label: string;
  required: boolean;
  description: string;
  aliases: string[];
}

const ITEM_FIELDS: TargetFieldDef[] = [
  {
    key: "name",
    label: "Item Name",
    required: true,
    description: "Medicine or product trade name",
    aliases: ["item name", "name", "product", "product name", "item", "description", "particulars", "medicine"],
  },
  {
    key: "sku",
    label: "Item Code / SKU",
    required: true,
    description: "Unique item code, barcode or Marg product code",
    aliases: ["sku", "item code", "code", "barcode", "item_code", "product code", "item no", "id"],
  },
  {
    key: "hsn_code",
    label: "HSN Code",
    required: false,
    description: "4 to 8 digit GST HSN classification code",
    aliases: ["hsn", "hsn code", "hsn/sac", "hsn_code", "hsncode"],
  },
  {
    key: "gst_rate",
    label: "GST Rate (%)",
    required: false,
    description: "Tax rate percentage (e.g. 5, 12, 18, 28)",
    aliases: ["gst", "gst%", "gst rate", "gst_rate", "tax", "tax%", "tax rate", "cgst+sgst", "vat%"],
  },
  {
    key: "unit",
    label: "Unit of Measurement",
    required: false,
    description: "e.g. pcs, strip, box, bottle, vial, tab",
    aliases: ["unit", "uom", "unit of measurement", "packing", "pack", "unit_name", "qty unit"],
  },
  {
    key: "opening_stock",
    label: "Opening Stock Qty",
    required: false,
    description: "Initial stock quantity (writes to stock ledger)",
    aliases: ["opening stock", "stock", "qty", "stock qty", "opening qty", "op stock", "balance qty", "quantity"],
  },
  {
    key: "reorder_threshold",
    label: "Reorder Threshold",
    required: false,
    description: "Minimum stock level for low-stock alerts",
    aliases: ["reorder", "reorder level", "min stock", "threshold", "minimum quantity", "reorder qty"],
  },
];

const PARTY_FIELDS: TargetFieldDef[] = [
  {
    key: "name",
    label: "Party / Vendor Name",
    required: true,
    description: "Full business or supplier name",
    aliases: ["party name", "name", "vendor name", "supplier", "vendor", "customer", "party", "account name", "ledger name"],
  },
  {
    key: "type",
    label: "Party Type",
    required: false,
    description: "vendor, customer, or both (defaults to vendor)",
    aliases: ["type", "party type", "group", "category", "account type", "ledger group"],
  },
  {
    key: "phone",
    label: "Phone / Mobile",
    required: false,
    description: "10-digit primary mobile or phone number",
    aliases: ["phone", "mobile", "contact", "phone number", "mobile no", "contact no", "telephone"],
  },
  {
    key: "email",
    label: "Email Address",
    required: false,
    description: "Business email address for invoices and ledger statements",
    aliases: ["email", "e-mail", "mail", "email id", "email address"],
  },
  {
    key: "address",
    label: "Address",
    required: false,
    description: "Premises, street, locality",
    aliases: ["address", "street", "location", "address 1", "full address", "billing address"],
  },
  {
    key: "city",
    label: "City",
    required: false,
    description: "Town or city name",
    aliases: ["city", "town", "district"],
  },
  {
    key: "state",
    label: "State",
    required: false,
    description: "Operating state name (e.g. Maharashtra)",
    aliases: ["state", "province", "region", "state name"],
  },
  {
    key: "pincode",
    label: "PIN Code",
    required: false,
    description: "6-digit postal code",
    aliases: ["pin", "pincode", "postal code", "zip", "zipcode"],
  },
  {
    key: "gst_number",
    label: "GSTIN / Tax ID",
    required: false,
    description: "15-digit GSTIN (e.g. 27AABCS1234F1Z1)",
    aliases: ["gstin", "gst number", "gst no", "gst_number", "tax id", "tin", "gst"],
  },
  {
    key: "pan",
    label: "PAN Number",
    required: false,
    description: "10-character Permanent Account Number",
    aliases: ["pan", "pan no", "pan number", "income tax pan"],
  },
  {
    key: "drug_license_number",
    label: "Drug License Number",
    required: false,
    description: "Pharma wholesale/retail drug license number (e.g. 20B/21B)",
    aliases: ["drug license", "drug license number", "drug license no", "dl", "dl no", "dl number", "license no", "d.l. no"],
  },
  {
    key: "drug_license_expiry",
    label: "Drug License Expiry",
    required: false,
    description: "Expiration date of drug license (YYYY-MM-DD)",
    aliases: ["drug license expiry", "dl expiry", "license expiry", "dl exp", "expiry date", "valid upto", "dl validity"],
  },
  {
    key: "opening_balance",
    label: "Opening Balance",
    required: false,
    description: "Initial balance when onboarding party",
    aliases: ["opening balance", "op bal", "balance", "opening amt", "ledger balance"],
  },
  {
    key: "opening_balance_type",
    label: "Balance Type (Dr/Cr)",
    required: false,
    description: "Dr (Receivable) or Cr (Payable)",
    aliases: ["dr/cr", "balance type", "drcr", "dr cr", "type of balance"],
  },
];

interface SkippedRow {
  row_index: number;
  row_data: Record<string, any>;
  reason: string;
}

interface ImportSummary {
  import_type: ImportType;
  total_rows: number;
  success_count: number;
  skipped_count: number;
  skipped_rows: SkippedRow[];
}

function ImportWizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, activeCompany, apiFetch } = useAuth();

  const [importType, setImportType] = useState<ImportType>("items");
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Step 2 State
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<Record<string, any>[]>([]);
  const [totalFileRows, setTotalFileRows] = useState<number>(0);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [commitLoading, setCommitLoading] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Step 3 State
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);

  // Check query params for initial type
  useEffect(() => {
    const typeParam = searchParams.get("type");
    if (typeParam === "parties" || typeParam === "vendors") {
      setImportType("parties");
    } else if (typeParam === "items") {
      setImportType("items");
    }
  }, [searchParams]);

  const targetFields = importType === "items" ? ITEM_FIELDS : PARTY_FIELDS;

  // Smart auto-matching helper
  const autoMapColumns = useCallback(
    (headers: string[], type: ImportType) => {
      const fields = type === "items" ? ITEM_FIELDS : PARTY_FIELDS;
      const mapping: Record<string, string> = {};

      const lowerHeaders = headers.map((h) => ({
        original: h,
        clean: h.toLowerCase().trim().replace(/[^a-z0-9]/g, ""),
      }));

      fields.forEach((field) => {
        // Find best match in headers
        let matchedHeader: string | null = null;

        for (const alias of field.aliases) {
          const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
          const exactMatch = lowerHeaders.find((h) => h.clean === cleanAlias);
          if (exactMatch) {
            matchedHeader = exactMatch.original;
            break;
          }
        }

        if (!matchedHeader) {
          for (const alias of field.aliases) {
            const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
            const partialMatch = lowerHeaders.find(
              (h) => h.clean.includes(cleanAlias) || cleanAlias.includes(h.clean),
            );
            if (partialMatch) {
              matchedHeader = partialMatch.original;
              break;
            }
          }
        }

        if (matchedHeader) {
          mapping[field.key] = matchedHeader;
        }
      });

      return mapping;
    },
    [],
  );

  // Handle File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setPreviewError(null);
    }
  };

  // Step 1: Upload & Preview
  const handleUploadAndPreview = async () => {
    if (!selectedFile) {
      setPreviewError("Please select a valid .xlsx or .csv file to proceed.");
      return;
    }

    if (!activeCompany) {
      setPreviewError("Please select an active business company first.");
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("import_type", importType);

      const res = await apiFetch("/api/import/preview", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setPreviewError(data.message || "Failed to parse preview from file.");
        setPreviewLoading(false);
        return;
      }

      setDetectedHeaders(data.headers || []);
      setSampleRows(data.sample_rows || []);
      setTotalFileRows(data.total_rows || (data.sample_rows ? data.sample_rows.length : 0));

      // Auto match columns
      const initialMapping = autoMapColumns(data.headers || [], importType);
      setColumnMapping(initialMapping);

      setStep(2);
    } catch (err: any) {
      setPreviewError(err.message || "An unexpected error occurred during preview.");
    } finally {
      setPreviewLoading(false);
    }
  };

  // Step 2: Commit Import
  const handleCommitImport = async () => {
    if (!selectedFile) {
      setCommitError("Missing original file.");
      return;
    }

    // Validate required fields are mapped
    const missingRequired = targetFields
      .filter((f) => f.required && (!columnMapping[f.key] || columnMapping[f.key].trim() === ""))
      .map((f) => f.label);

    if (missingRequired.length > 0) {
      setCommitError(
        `Please map the following required field(s) before importing: ${missingRequired.join(", ")}`,
      );
      return;
    }

    setCommitLoading(true);
    setCommitError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("import_type", importType);
      formData.append("column_mapping", JSON.stringify(columnMapping));

      const res = await apiFetch("/api/import/commit", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setCommitError(data.message || "Bulk import failed.");
        setCommitLoading(false);
        return;
      }

      setImportResult(data);
      setStep(3);
    } catch (err: any) {
      setCommitError(err.message || "Unexpected error committing import.");
    } finally {
      setCommitLoading(false);
    }
  };

  // Download Sample Template CSV
  const handleDownloadSample = () => {
    let csvContent = "";
    let filename = "";

    if (importType === "items") {
      filename = "sample_items_import_template.csv";
      csvContent =
        "Item Name,Item Code,HSN,GST%,Unit,Opening Stock,Reorder Level\n" +
        'Paracetamol 500mg,MED-001,300490,12,strip,100,20\n' +
        'Amoxicillin 250mg,MED-002,300410,12,strip,50,15\n' +
        'Azithromycin 500mg,MED-003,300420,12,tab,80,25\n' +
        'Cough Syrup 100ml,SYR-001,300490,18,bottle,30,10\n';
    } else {
      filename = "sample_parties_import_template.csv";
      csvContent =
        "Party Name,Type,Mobile,Email,Address,City,State,PIN Code,GSTIN,PAN,Drug License No,Drug License Expiry,Opening Balance,Balance Type\n" +
        'Apex Pharma Distributors,vendor,9876543210,apex@pharma.com,Plot 45 Industrial Area,Mumbai,Maharashtra,400001,27AABCA1111A1Z1,AABCA1111A,20B/21B-4567,2027-12-31,5000,cr\n' +
        'Cipla Healthcare Supply,vendor,9823012345,sales@cipla.com,Bandra Kurla Complex,Mumbai,Maharashtra,400051,27AABCC2222B1Z2,AABCC2222B,20B/21B-8901,2026-10-15,12000,cr\n' +
        'Apollo Clinic Chemist,customer,9988776655,care@apollo.com,Shop 3 Station Road,Pune,Maharashtra,411001,27AABCA3333C1Z3,AABCA3333C,,,0,dr\n';
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download Skipped Rows CSV
  const handleDownloadSkippedCsv = () => {
    if (!importResult || !importResult.skipped_rows || importResult.skipped_rows.length === 0) {
      return;
    }

    // Collect all original keys
    const firstRowData = importResult.skipped_rows[0].row_data || {};
    const originalKeys = Object.keys(firstRowData);
    const headers = ["Row_Number", "Skip_Reason", ...originalKeys];

    const escapeCsv = (str: any) => {
      if (str === null || str === undefined) return '""';
      const val = String(str).replace(/"/g, '""');
      return `"${val}"`;
    };

    let csvContent = headers.map(escapeCsv).join(",") + "\n";

    importResult.skipped_rows.forEach((item) => {
      const rowCols = [
        item.row_index,
        item.reason,
        ...originalKeys.map((k) => item.row_data?.[k] ?? ""),
      ];
      csvContent += rowCols.map(escapeCsv).join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `skipped_${importType}_import_errors.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Reset wizard
  const handleReset = () => {
    setSelectedFile(null);
    setDetectedHeaders([]);
    setSampleRows([]);
    setColumnMapping({});
    setImportResult(null);
    setPreviewError(null);
    setCommitError(null);
    setStep(1);
  };

  return (
    <AppLayout
      pageTitle="Bulk Data Import"
      pageSubtitle="Import items and vendor directories from Marg, Tally, Vyapar, Excel, or CSV"
      headerActions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadSample}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Sample {importType === "items" ? "Items" : "Parties"} Template</span>
          </button>
        </div>
      }
    >
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Wizard Progress Tracker */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            {/* Step 1 */}
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                  step === 1
                    ? "bg-blue-600 text-white shadow-sm ring-4 ring-blue-100"
                    : step > 1
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {step > 1 ? "✓" : "1"}
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">Upload Spreadsheet</div>
                <div className="text-[11px] text-slate-500">.xlsx, .xls or .csv</div>
              </div>
            </div>

            <div className="flex-1 h-0.5 mx-4 bg-slate-200">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: step === 1 ? "0%" : step === 2 ? "50%" : "100%" }}
              />
            </div>

            {/* Step 2 */}
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                  step === 2
                    ? "bg-blue-600 text-white shadow-sm ring-4 ring-blue-100"
                    : step > 2
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {step > 2 ? "✓" : "2"}
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">Map Columns & Verify</div>
                <div className="text-[11px] text-slate-500">Live 5-row sample preview</div>
              </div>
            </div>

            <div className="flex-1 h-0.5 mx-4 bg-slate-200">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: step < 3 ? "0%" : "100%" }}
              />
            </div>

            {/* Step 3 */}
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                  step === 3
                    ? "bg-blue-600 text-white shadow-sm ring-4 ring-blue-100"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                3
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">Import Results</div>
                <div className="text-[11px] text-slate-500">Summary & skipped rows</div>
              </div>
            </div>
          </div>
        </div>

        {/* STEP 1: Upload File & Select Type */}
        {step === 1 && (
          <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Step 1: Choose Import Target & File</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select what you are importing and upload your Marg or spreadsheet export
                </p>
              </div>

              {/* Import Type Segmented Control */}
              <div className="flex items-center bg-slate-200 p-0.5 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setImportType("items");
                    setSelectedFile(null);
                  }}
                  className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                    importType === "items"
                      ? "bg-white text-blue-700 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Items Catalog
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportType("parties");
                    setSelectedFile(null);
                  }}
                  className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                    importType === "parties"
                      ? "bg-white text-blue-700 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Parties & Vendors
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {previewError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs font-medium flex items-center gap-2">
                  <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{previewError}</span>
                </div>
              )}

              {/* Upload Dropzone */}
              <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-8 text-center transition-colors bg-slate-50/50 hover:bg-blue-50/20">
                <input
                  type="file"
                  id="import-file-input"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="import-file-input"
                  className="cursor-pointer flex flex-col items-center justify-center gap-3"
                >
                  <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shadow-xs">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-sm font-bold text-blue-600 hover:underline">
                      Click to upload
                    </span>{" "}
                    <span className="text-xs text-slate-600">or drag and drop your spreadsheet</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Supports Microsoft Excel (.xlsx, .xls) and Comma-Separated Values (.csv)
                  </p>
                </label>

                {selectedFile && (
                  <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-md text-xs font-semibold text-blue-900">
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>{selectedFile.name}</span>
                    <span className="text-slate-400">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                      }}
                      className="ml-1 text-slate-400 hover:text-red-600 text-sm font-bold leading-none"
                    >
                      &times;
                    </button>
                  </div>
                )}
              </div>

              {/* Guidelines & Field Reference */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="text-xs font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Required & Optional Columns for {importType === "items" ? "Items" : "Parties"}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
                  {targetFields.map((field) => (
                    <div
                      key={field.key}
                      className="p-2 bg-white border border-slate-200 rounded flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-semibold text-slate-900">
                          {field.label} {field.required && <span className="text-red-500">*</span>}
                        </span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                            field.required
                              ? "bg-red-50 text-red-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {field.required ? "Required" : "Optional"}
                        </span>
                      </div>
                      <span className="text-slate-500 text-[10px]">{field.description}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Next Step Button */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={!selectedFile || previewLoading}
                  onClick={handleUploadAndPreview}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold shadow-2xs transition-colors flex items-center gap-2 cursor-pointer"
                >
                  {previewLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Reading Headers...</span>
                    </>
                  ) : (
                    <>
                      <span>Continue to Column Mapping</span>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Map Columns & Live Sample Preview */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Step 2: Map File Columns to {importType === "items" ? "Item" : "Party"} Fields
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    File: <span className="font-semibold text-slate-700">{selectedFile?.name}</span>{" "}
                    ({totalFileRows} data rows detected)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs text-slate-600 hover:text-slate-900 font-semibold underline flex items-center gap-1 cursor-pointer"
                >
                  &larr; Re-upload File
                </button>
              </div>

              <div className="p-6 space-y-6">
                {commitError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs font-medium flex items-center gap-2">
                    <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{commitError}</span>
                  </div>
                )}

                {/* Column Mapping Selectors */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {targetFields.map((field) => {
                    const isMapped = Boolean(columnMapping[field.key]);
                    return (
                      <div
                        key={field.key}
                        className={`p-3.5 rounded-lg border transition-all ${
                          isMapped
                            ? "bg-blue-50/40 border-blue-200"
                            : field.required
                            ? "bg-red-50/30 border-red-200"
                            : "bg-slate-50/60 border-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-slate-900 flex items-center gap-1">
                            <span>{field.label}</span>
                            {field.required && <span className="text-red-500 font-bold">*</span>}
                          </label>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-semibold uppercase ${
                              isMapped
                                ? "bg-blue-100 text-blue-700"
                                : field.required
                                ? "bg-red-100 text-red-700"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {isMapped ? "Mapped" : field.required ? "Required" : "Optional"}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mb-2">{field.description}</p>
                        <select
                          value={columnMapping[field.key] || ""}
                          onChange={(e) =>
                            setColumnMapping({
                              ...columnMapping,
                              [field.key]: e.target.value,
                            })
                          }
                          className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs bg-white text-slate-900 font-medium focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer"
                        >
                          <option value="">-- Do not map / None --</option>
                          {detectedHeaders.map((header) => (
                            <option key={header} value={header}>
                              Column: {header}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>

                {/* Live Sample Preview Table */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      <span>Visual Sample Confirmation (First 5 Rows from Uploaded File)</span>
                    </h3>
                    <span className="text-[11px] text-slate-500">
                      Check that values line up before importing
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white shadow-2xs max-h-64">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-slate-100/80 sticky top-0 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-12 text-center">
                            Row #
                          </th>
                          {detectedHeaders.map((header) => {
                            // Find which target field maps to this header
                            const mappedField = targetFields.find(
                              (f) => columnMapping[f.key] === header,
                            );
                            return (
                              <th
                                key={header}
                                className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider border-l border-slate-200 whitespace-nowrap ${
                                  mappedField
                                    ? "bg-blue-100/70 text-blue-900"
                                    : "text-slate-600"
                                }`}
                              >
                                <div>{header}</div>
                                {mappedField && (
                                  <div className="text-[9px] text-blue-600 font-semibold normal-case">
                                    &rarr; {mappedField.label}
                                  </div>
                                )}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sampleRows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/60">
                            <td className="px-3 py-2 font-mono text-[11px] text-slate-400 text-center font-bold">
                              {idx + 2}
                            </td>
                            {detectedHeaders.map((header) => (
                              <td
                                key={header}
                                className="px-3 py-2 text-slate-800 border-l border-slate-100 whitespace-nowrap font-medium"
                              >
                                {String(row[header] ?? "") || <span className="text-slate-300 italic">empty</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Step 2 Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-4 py-2 border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    &larr; Back to Upload
                  </button>
                  <button
                    type="button"
                    disabled={commitLoading}
                    onClick={handleCommitImport}
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-md text-xs font-bold shadow-2xs transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    {commitLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Importing {totalFileRows} Records...</span>
                      </>
                    ) : (
                      <>
                        <span>Confirm & Execute Import</span>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Import Results Summary */}
        {step === 3 && importResult && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Scorecard Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Total Rows Processed
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1">
                  {importResult.total_rows}
                </div>
                <div className="text-xs text-slate-500 mt-1">From uploaded file</div>
              </div>

              <div className="bg-white border border-emerald-200 rounded-lg p-5 shadow-2xs">
                <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">
                  Successfully Created
                </div>
                <div className="text-2xl font-black text-emerald-700 mt-1">
                  {importResult.success_count}
                </div>
                <div className="text-xs text-emerald-600/80 mt-1">Saved to company database</div>
              </div>

              <div className="bg-white border border-amber-200 rounded-lg p-5 shadow-2xs">
                <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">
                  Skipped / Duplicates
                </div>
                <div className="text-2xl font-black text-amber-700 mt-1">
                  {importResult.skipped_count}
                </div>
                <div className="text-xs text-amber-600/80 mt-1">
                  {importResult.skipped_count > 0 ? "Requires review below" : "Zero errors"}
                </div>
              </div>
            </div>

            {/* Skipped Rows Section */}
            {importResult.skipped_count > 0 ? (
              <div className="bg-white border border-amber-200 rounded-lg shadow-2xs overflow-hidden">
                <div className="px-6 py-4 border-b border-amber-100 bg-amber-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>{importResult.skipped_count} Skipped Rows (Not Imported)</span>
                    </h3>
                    <p className="text-xs text-amber-700/80 mt-0.5">
                      These rows failed validation (e.g. duplicate SKU or missing required fields). You can download this list as CSV, fix the errors, and re-import only the skipped rows.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadSkippedCsv}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-bold shadow-2xs transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>Download Skipped Rows (CSV)</span>
                  </button>
                </div>

                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-20">
                          Excel Row
                        </th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-72">
                          Skip Reason
                        </th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Row Data Preview
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importResult.skipped_rows.map((skipped, idx) => (
                        <tr key={idx} className="hover:bg-amber-50/20">
                          <td className="px-4 py-2.5 font-mono text-[11px] font-bold text-slate-700">
                            Row {skipped.row_index}
                          </td>
                          <td className="px-4 py-2.5 text-red-600 font-semibold">
                            {skipped.reason}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 font-mono text-[11px] truncate max-w-md">
                            {JSON.stringify(skipped.row_data)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 text-center shadow-2xs">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2 font-bold text-xl">
                  ✓
                </div>
                <h3 className="text-sm font-bold text-emerald-900">
                  100% Import Complete! All records created cleanly.
                </h3>
                <p className="text-xs text-emerald-700 mt-1">
                  All {importResult.total_rows} rows from your file were verified and inserted with zero skipped records.
                </p>
              </div>
            )}

            {/* Next Steps & Navigation */}
            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                + Import Another File
              </button>

              <div className="flex items-center gap-3">
                {importType === "items" ? (
                  <Link
                    href="/inventory"
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold shadow-2xs transition-colors flex items-center gap-1.5"
                  >
                    <span>View Items & Catalog</span>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </Link>
                ) : (
                  <Link
                    href="/parties"
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold shadow-2xs transition-colors flex items-center gap-1.5"
                  >
                    <span>View Parties Directory</span>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default function ImportPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-xs font-semibold text-slate-500">Loading Import Wizard...</div>
        </div>
      }
    >
      <ImportWizardContent />
    </Suspense>
  );
}
