import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

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
    return { error: "Invalid session token.", status: 401 };
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

export async function GET(request: Request) {
  try {
    const auth = await verifyAuthAndTenant(request);
    if ("error" in auth) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }

    const { companyId } = auth;

    const { data: invoices, error } = await supabaseAdmin
      .from("purchase_invoices")
      .select(`
        *,
        parties:party_id ( id, name, phone, gst_number )
      `)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ message: "Failed to fetch purchases." }, { status: 500 });
    }

    const formatted = (invoices || []).map((inv: any) => ({
      id: inv.id,
      company_id: inv.company_id,
      party_id: inv.party_id,
      party: inv.parties,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      total_amount: Number(inv.total_amount),
      gst_amount: Number(inv.gst_amount),
      status: inv.status,
      created_at: inv.created_at,
      updated_at: inv.updated_at,
    }));

    return NextResponse.json({ invoices: formatted }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "Internal server error." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyAuthAndTenant(request);
    if ("error" in auth) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }

    const { companyId } = auth;
    const body = await request.json();
    const { party_id, invoice_number, invoice_date, lines } = body;

    if (!party_id || !invoice_number || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { message: "Vendor, invoice number, and at least one line item are required." },
        { status: 400 },
      );
    }

    // Verify vendor party
    const { data: party, error: partyError } = await supabaseAdmin
      .from("parties")
      .select("id, name, type")
      .eq("company_id", companyId)
      .eq("id", party_id)
      .maybeSingle();

    if (partyError || !party) {
      return NextResponse.json({ message: "Selected vendor not found." }, { status: 400 });
    }

    if (party.type !== "vendor" && party.type !== "both") {
      return NextResponse.json(
        { message: `Selected party '${party.name}' is not a vendor.` },
        { status: 400 },
      );
    }

    // Uniqueness
    const { data: existing } = await supabaseAdmin
      .from("purchase_invoices")
      .select("id")
      .eq("company_id", companyId)
      .eq("invoice_number", invoice_number.trim())
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { message: `Purchase invoice with number '${invoice_number}' already exists in this company.` },
        { status: 409 },
      );
    }

    let totalGst = 0;
    let totalAmount = 0;
    const computedLines = [];

    for (const line of lines) {
      const { data: item } = await supabaseAdmin
        .from("items")
        .select("id, name, unit")
        .eq("company_id", companyId)
        .eq("id", line.item_id)
        .maybeSingle();

      if (!item) {
        return NextResponse.json(
          { message: `Item ID '${line.item_id}' not found in this company.` },
          { status: 400 },
        );
      }

      const qty = Number(line.quantity);
      const rate = Number(line.rate);
      const gstRate = Number(line.gst_rate ?? 0);

      const taxable = Math.round(qty * rate * 100) / 100;
      const gst = Math.round(taxable * (gstRate / 100) * 100) / 100;
      const lineTotal = Math.round((taxable + gst) * 100) / 100;

      totalGst += gst;
      totalAmount += lineTotal;

      computedLines.push({
        item_id: item.id,
        quantity: qty,
        rate: rate,
        gst_rate: gstRate,
        line_total: lineTotal,
      });
    }

    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("purchase_invoices")
      .insert({
        company_id: companyId,
        party_id,
        invoice_number: invoice_number.trim(),
        invoice_date: invoice_date || new Date().toISOString().split("T")[0],
        total_amount: Math.round(totalAmount * 100) / 100,
        gst_amount: Math.round(totalGst * 100) / 100,
        status: "draft",
      })
      .select()
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { message: invoiceError?.message || "Failed to create purchase invoice." },
        { status: 500 },
      );
    }

    const linesToInsert = computedLines.map((l) => ({
      purchase_invoice_id: invoice.id,
      item_id: l.item_id,
      quantity: l.quantity,
      rate: l.rate,
      gst_rate: l.gst_rate,
      line_total: l.line_total,
    }));

    await supabaseAdmin.from("purchase_invoice_lines").insert(linesToInsert);

    return NextResponse.json({ invoice: { ...invoice, lines: linesToInsert } }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "Internal server error." }, { status: 500 });
  }
}
