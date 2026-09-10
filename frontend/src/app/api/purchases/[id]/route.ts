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
      .from("purchase_invoices")
      .select(`
        *,
        parties:party_id ( id, name, phone, gst_number )
      `)
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();

    if (error || !inv) {
      return NextResponse.json(
        { message: "Purchase invoice not found in this company." },
        { status: 404 },
      );
    }

    const { data: lines } = await supabaseAdmin
      .from("purchase_invoice_lines")
      .select(`
        *,
        items:item_id ( id, name, sku, unit )
      `)
      .eq("purchase_invoice_id", id);

    return NextResponse.json(
      {
        invoice: {
          id: inv.id,
          company_id: inv.company_id,
          party_id: inv.party_id,
          party: inv.parties,
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date,
          total_amount: Number(inv.total_amount),
          gst_amount: Number(inv.gst_amount),
          status: inv.status,
          lines: (lines || []).map((l: any) => ({
            id: l.id,
            purchase_invoice_id: l.purchase_invoice_id,
            item_id: l.item_id,
            item: l.items,
            quantity: Number(l.quantity),
            rate: Number(l.rate),
            gst_rate: Number(l.gst_rate),
            line_total: Number(l.line_total),
          })),
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
