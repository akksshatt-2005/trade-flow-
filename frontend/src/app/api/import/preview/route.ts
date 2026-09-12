import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import * as XLSX from "xlsx";

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

    const contentType = request.headers.get("content-type") || "";
    let importType = "items";
    let buffer: Buffer | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const typeField = formData.get("import_type") as string | null;

      if (typeField) {
        importType = typeField;
      }

      if (!file) {
        return NextResponse.json({ message: "No file uploaded." }, { status: 400 });
      }

      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      const body = await request.json();
      if (body.import_type) importType = body.import_type;
      if (body.file_base64) {
        buffer = Buffer.from(body.file_base64, "base64");
      }
    }

    if (!buffer || buffer.length === 0) {
      return NextResponse.json(
        { message: "A valid .xlsx, .xls, or .csv file is required." },
        { status: 400 },
      );
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });
    } catch {
      return NextResponse.json(
        { message: "Invalid or corrupt spreadsheet/CSV file." },
        { status: 400 },
      );
    }

    const firstSheetName = workbook.SheetNames?.[0];
    if (!firstSheetName) {
      return NextResponse.json(
        { message: "The uploaded file does not contain any sheets." },
        { status: 400 },
      );
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

    if (!rawRows || rawRows.length === 0) {
      return NextResponse.json(
        { message: "Uploaded file contains no data or headers." },
        { status: 400 },
      );
    }

    const rawHeaderRow = rawRows[0] || [];
    const headers: string[] = rawHeaderRow
      .map((col) => (col !== undefined && col !== null ? String(col).trim() : ""))
      .filter((col) => col.length > 0);

    if (headers.length === 0) {
      return NextResponse.json(
        { message: "Malformed file: No column headers detected in the first row." },
        { status: 400 },
      );
    }

    const rawObjects = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: "" });
    const rows = rawObjects.filter((row) =>
      Object.values(row).some((val) => val !== null && val !== undefined && String(val).trim() !== ""),
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { message: "Uploaded file contains no data rows." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        import_type: importType,
        headers,
        sample_rows: rows.slice(0, 5),
        total_rows: rows.length,
      },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: err.message || "Failed to parse preview." },
      { status: 500 },
    );
  }
}
