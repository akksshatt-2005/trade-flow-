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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyAuthAndTenant(request);
    if ("error" in auth) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }

    const { companyId } = auth;
    const { id } = await params;

    const { data: inv, error } = await supabaseAdmin
      .from("sales_invoices")
      .select(`
        *,
        parties:party_id ( id, name, phone, gst_number, state )
      `)
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();

    if (error || !inv) {
      return NextResponse.json(
        { message: "Sales invoice not found in this company." },
        { status: 404 },
      );
    }

    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("state")
      .eq("id", companyId)
      .maybeSingle();

    const compState = company?.state?.trim().toLowerCase();
    const partyState = inv.parties?.state?.trim().toLowerCase();
    const isInterstate = Boolean(compState && partyState && compState !== partyState);

    const { data: lines } = await supabaseAdmin
      .from("sales_invoice_lines")
      .select(`
        *,
        items:item_id ( id, name, sku, unit )
      `)
      .eq("sales_invoice_id", id);

    const totalGst = Number(inv.gst_amount) || 0;
    const totalAmount = Number(inv.total_amount) || 0;
    const totalTaxable = Math.round((totalAmount - totalGst) * 100) / 100;

    const cgst = isInterstate ? 0 : Math.round((totalGst / 2) * 100) / 100;
    const sgst = isInterstate ? 0 : Math.round((totalGst / 2) * 100) / 100;
    const igst = isInterstate ? totalGst : 0;

    return NextResponse.json(
      {
        invoice: {
          id: inv.id,
          company_id: inv.company_id,
          party_id: inv.party_id,
          party: inv.parties,
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date,
          total_taxable_amount: totalTaxable,
          cgst_amount: cgst,
          sgst_amount: sgst,
          igst_amount: igst,
          gst_amount: totalGst,
          total_amount: totalAmount,
          is_interstate: isInterstate,
          status: inv.status,
          lines: (lines || []).map((l: any) => {
            const qty = Number(l.quantity);
            const rate = Number(l.rate);
            const lineTotal = Number(l.line_total);
            const taxable = Math.round(qty * rate * 100) / 100;
            const lineGst = Math.round((lineTotal - taxable) * 100) / 100;

            return {
              id: l.id,
              sales_invoice_id: l.sales_invoice_id,
              item_id: l.item_id,
              item: l.items,
              quantity: qty,
              rate: rate,
              gst_rate: Number(l.gst_rate),
              taxable_amount: taxable,
              cgst_amount: isInterstate ? 0 : Math.round((lineGst / 2) * 100) / 100,
              sgst_amount: isInterstate ? 0 : Math.round((lineGst / 2) * 100) / 100,
              igst_amount: isInterstate ? lineGst : 0,
              line_total: lineTotal,
            };
          }),
          created_at: inv.created_at,
          updated_at: inv.updated_at,
        },
      },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "Internal server error." }, { status: 500 });
  }
}
