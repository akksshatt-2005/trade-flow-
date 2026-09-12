import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import * as XLSX from "xlsx";
import { serializePartyAddress } from "@/lib/party-utils";

async function verifyAuthAndTenant(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const companyId = request.headers.get("x-company-id") || request.headers.get("company-id");

  if (!authHeader) {
    return { error: "Authentication token required.", status: 401 };
  }

  if (!companyId) {
    return { error: "Missing x-company-id header.", status: 400 };
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !authData?.user) {
    return { error: "Invalid or expired session token.", status: 401 };
  }

  const userId = authData.user.id;

  const { data: membership, error: memberError } = await supabaseAdmin
    .from("user_companies")
    .select("role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (memberError || !membership) {
    return {
      error: "Access denied. You do not have access to this company.",
      status: 403,
    };
  }

  return { userId, companyId, role: membership.role };
}

export async function POST(request: Request) {
  try {
    const auth = await verifyAuthAndTenant(request);
    if ("error" in auth) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }

    const { companyId } = auth;
    const contentType = request.headers.get("content-type") || "";

    let importType = "items";
    let columnMapping: Record<string, string> = {};
    let rows: Record<string, any>[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const typeField = formData.get("import_type") as string | null;
      const mappingField = formData.get("column_mapping") as string | null;

      if (typeField) importType = typeField;
      if (mappingField) {
        try {
          columnMapping = JSON.parse(mappingField);
        } catch {
          return NextResponse.json({ message: "Invalid JSON in column_mapping field." }, { status: 400 });
        }
      }

      if (file) {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });
        const firstSheetName = workbook.SheetNames?.[0];
        if (firstSheetName) {
          const worksheet = workbook.Sheets[firstSheetName];
          const rawObjects = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: "" });
          rows = rawObjects.filter((row) =>
            Object.values(row).some((val) => val !== null && val !== undefined && String(val).trim() !== ""),
          );
        }
      }
    } else {
      const body = await request.json();
      if (body.import_type) importType = body.import_type;
      if (body.column_mapping) columnMapping = body.column_mapping;
      if (body.rows && Array.isArray(body.rows)) {
        rows = body.rows;
      } else if (body.file_base64) {
        const buffer = Buffer.from(body.file_base64, "base64");
        const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });
        const firstSheetName = workbook.SheetNames?.[0];
        if (firstSheetName) {
          const worksheet = workbook.Sheets[firstSheetName];
          const rawObjects = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: "" });
          rows = rawObjects.filter((row) =>
            Object.values(row).some((val) => val !== null && val !== undefined && String(val).trim() !== ""),
          );
        }
      }
    }

    if (!columnMapping || Object.keys(columnMapping).length === 0) {
      return NextResponse.json({ message: "column_mapping is required." }, { status: 400 });
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ message: "No data rows provided to import." }, { status: 400 });
    }

    const skippedRows: Array<{ row_index: number; row_data: Record<string, any>; reason: string }> = [];
    let successCount = 0;

    if (importType === "items") {
      if (!columnMapping.name || !columnMapping.name.trim()) {
        return NextResponse.json(
          { message: 'Missing required column mapping for "Item Name" (name).' },
          { status: 400 },
        );
      }
      if (!columnMapping.sku || !columnMapping.sku.trim()) {
        return NextResponse.json(
          { message: 'Missing required column mapping for "Item Code / SKU" (sku).' },
          { status: 400 },
        );
      }

      // Fetch all existing SKUs for this company
      const { data: existingItems } = await supabaseAdmin
        .from("items")
        .select("sku")
        .eq("company_id", companyId);

      const existingSkus = new Set<string>();
      for (const item of existingItems || []) {
        if (item.sku) {
          existingSkus.add(item.sku.trim().toUpperCase());
        }
      }

      const batchSeenSkus = new Set<string>();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        const rawName = row[columnMapping.name];
        const rawSku = row[columnMapping.sku];
        const rawHsn = columnMapping.hsn_code ? row[columnMapping.hsn_code] : "";
        const rawGst = columnMapping.gst_rate ? row[columnMapping.gst_rate] : "0";
        const rawUnit = columnMapping.unit ? row[columnMapping.unit] : "pcs";
        const rawStock = columnMapping.opening_stock ? row[columnMapping.opening_stock] : "0";
        const rawThreshold = columnMapping.reorder_threshold ? row[columnMapping.reorder_threshold] : "0";

        const name = rawName !== undefined && rawName !== null ? String(rawName).trim() : "";
        const sku = rawSku !== undefined && rawSku !== null ? String(rawSku).trim() : "";

        if (!name) {
          skippedRows.push({
            row_index: rowNum,
            row_data: row,
            reason: `Row ${rowNum}: missing required item name`,
          });
          continue;
        }

        if (!sku) {
          skippedRows.push({
            row_index: rowNum,
            row_data: row,
            reason: `Row ${rowNum}: missing required SKU / Item Code`,
          });
          continue;
        }

        const skuNormalized = sku.toUpperCase();

        if (existingSkus.has(skuNormalized)) {
          skippedRows.push({
            row_index: rowNum,
            row_data: row,
            reason: `Row ${rowNum}: duplicate SKU '${sku}' already exists in this company`,
          });
          continue;
        }

        if (batchSeenSkus.has(skuNormalized)) {
          skippedRows.push({
            row_index: rowNum,
            row_data: row,
            reason: `Row ${rowNum}: duplicate SKU '${sku}' found multiple times in uploaded file`,
          });
          continue;
        }

        const gstParsed = Number(String(rawGst).replace(/[^0-9.]/g, "")) || 0;
        const stockParsed = Number(String(rawStock).replace(/[^0-9.]/g, "")) || 0;
        const thresholdParsed = Number(String(rawThreshold).replace(/[^0-9.]/g, "")) || 0;
        const unitParsed = rawUnit && String(rawUnit).trim() ? String(rawUnit).trim() : "pcs";
        const hsnParsed = rawHsn && String(rawHsn).trim() ? String(rawHsn).trim() : null;

        const insertPayload: any = {
          company_id: companyId,
          name: name,
          sku: sku,
          hsn_code: hsnParsed,
          gst_rate: gstParsed,
          unit: unitParsed,
          opening_stock: stockParsed,
          reorder_threshold: thresholdParsed,
        };

        let { data: insertedItem, error: insertError } = await supabaseAdmin
          .from("items")
          .insert(insertPayload)
          .select()
          .maybeSingle();

        if (insertError?.message?.includes("reorder_threshold")) {
          delete insertPayload.reorder_threshold;
          const retry = await supabaseAdmin
            .from("items")
            .insert(insertPayload)
            .select()
            .single();
          insertedItem = retry.data;
          insertError = retry.error;
        }

        if (insertError || !insertedItem) {
          skippedRows.push({
            row_index: rowNum,
            row_data: row,
            reason: `Row ${rowNum}: database error (${insertError?.message || "Insert failed"})`,
          });
          continue;
        }

        if (stockParsed > 0) {
          await supabaseAdmin.from("stock_ledger").insert({
            company_id: companyId,
            item_id: insertedItem.id,
            movement_type: "adjustment_in",
            quantity: stockParsed,
            reference_type: "opening_stock",
            reference_id: insertedItem.id,
          });
        }

        batchSeenSkus.add(skuNormalized);
        existingSkus.add(skuNormalized);
        successCount++;
      }
    } else if (importType === "parties") {
      if (!columnMapping.name || !columnMapping.name.trim()) {
        return NextResponse.json(
          { message: 'Missing required column mapping for "Party / Vendor Name" (name).' },
          { status: 400 },
        );
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        const rawName = row[columnMapping.name];
        const rawPhone = columnMapping.phone ? row[columnMapping.phone] : "";
        const rawEmail = columnMapping.email ? row[columnMapping.email] : "";
        const rawAddress = columnMapping.address ? row[columnMapping.address] : "";
        const rawCity = columnMapping.city ? row[columnMapping.city] : "";
        const rawState = columnMapping.state ? row[columnMapping.state] : "";
        const rawPincode = columnMapping.pincode ? row[columnMapping.pincode] : "";
        const rawGstin = columnMapping.gst_number ? row[columnMapping.gst_number] : "";
        const rawPan = columnMapping.pan ? row[columnMapping.pan] : "";
        const rawDlNumber = columnMapping.drug_license_number ? row[columnMapping.drug_license_number] : "";
        const rawDlExpiry = columnMapping.drug_license_expiry ? row[columnMapping.drug_license_expiry] : "";
        const rawOpeningBalance = columnMapping.opening_balance ? row[columnMapping.opening_balance] : "0";
        const rawOpeningBalanceType = columnMapping.opening_balance_type ? row[columnMapping.opening_balance_type] : "cr";
        const rawType = columnMapping.type ? row[columnMapping.type] : "";

        const name = rawName !== undefined && rawName !== null ? String(rawName).trim() : "";

        if (!name) {
          skippedRows.push({
            row_index: rowNum,
            row_data: row,
            reason: `Row ${rowNum}: missing required party name`,
          });
          continue;
        }

        let partyType: "customer" | "vendor" | "both" = "vendor";
        if (rawType) {
          const typeStr = String(rawType).trim().toLowerCase();
          if (typeStr.includes("customer") || typeStr.includes("buyer") || typeStr.includes("client")) {
            partyType = "customer";
          } else if (typeStr.includes("both")) {
            partyType = "both";
          } else {
            partyType = "vendor";
          }
        }

        const phone = rawPhone && String(rawPhone).trim() ? String(rawPhone).trim() : null;
        const email = rawEmail && String(rawEmail).trim() ? String(rawEmail).trim() : null;
        const address = rawAddress && String(rawAddress).trim() ? String(rawAddress).trim() : null;
        const city = rawCity && String(rawCity).trim() ? String(rawCity).trim() : null;
        const state = rawState && String(rawState).trim() ? String(rawState).trim() : null;
        const pincode = rawPincode && String(rawPincode).trim() ? String(rawPincode).trim() : null;
        const gstNumber = rawGstin && String(rawGstin).trim() ? String(rawGstin).trim().toUpperCase() : null;
        const pan = rawPan && String(rawPan).trim() ? String(rawPan).trim().toUpperCase() : null;
        const dlNumber = rawDlNumber && String(rawDlNumber).trim() ? String(rawDlNumber).trim() : null;
        const dlExpiry = rawDlExpiry && String(rawDlExpiry).trim() ? String(rawDlExpiry).trim() : null;
        const openingBal = Number(String(rawOpeningBalance).replace(/[^0-9.]/g, "")) || 0;
        const openingBalType: "dr" | "cr" = String(rawOpeningBalanceType).toLowerCase().includes("dr") ? "dr" : "cr";

        const finalAddress = serializePartyAddress({
          address,
          city,
          state,
          pincode,
          email,
          pan,
          drug_license_number: dlNumber,
          drug_license_expiry: dlExpiry,
          opening_balance: openingBal,
          opening_balance_type: openingBalType,
        });

        const partyPayload: any = {
          company_id: companyId,
          name: name,
          type: partyType,
          phone: phone,
          address: finalAddress,
          gst_number: gstNumber,
          email,
          city,
          state,
          pincode,
          pan,
          drug_license_number: dlNumber,
          drug_license_expiry: dlExpiry,
          opening_balance: openingBal,
          opening_balance_type: openingBalType,
        };

        let { error: insertError } = await supabaseAdmin.from("parties").insert(partyPayload);

        if (insertError && insertError.message?.includes("column")) {
          const basicPayload = {
            company_id: companyId,
            name: name,
            type: partyType,
            phone: phone,
            address: finalAddress,
            gst_number: gstNumber,
          };
          const retry = await supabaseAdmin.from("parties").insert(basicPayload);
          insertError = retry.error;
        }

        if (insertError) {
          skippedRows.push({
            row_index: rowNum,
            row_data: row,
            reason: `Row ${rowNum}: database error (${insertError.message})`,
          });
          continue;
        }

        successCount++;
      }
    } else {
      return NextResponse.json(
        { message: `Invalid import_type: ${importType}. Must be 'items' or 'parties'.` },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        import_type: importType,
        total_rows: rows.length,
        success_count: successCount,
        skipped_count: skippedRows.length,
        skipped_rows: skippedRows,
      },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: err.message || "Failed to commit import." },
      { status: 500 },
    );
  }
}
