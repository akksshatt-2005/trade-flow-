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

    const { data: party, error: partyError } = await supabaseAdmin
      .from("parties")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();

    if (partyError || !party) {
      return NextResponse.json({ message: "Party not found in this company." }, { status: 404 });
    }

    // Sales invoices aggregate
    const { data: salesInvoices } = await supabaseAdmin
      .from("sales_invoices")
      .select("total_amount")
      .eq("company_id", companyId)
      .eq("party_id", id);

    // Purchase invoices aggregate
    const { data: purchaseInvoices } = await supabaseAdmin
      .from("purchase_invoices")
      .select("total_amount")
      .eq("company_id", companyId)
      .eq("party_id", id);

    const salesCount = (salesInvoices || []).length;
    const totalSales = (salesInvoices || []).reduce(
      (sum, inv) => sum + (Number(inv.total_amount) || 0),
      0,
    );

    const purchaseCount = (purchaseInvoices || []).length;
    const totalPurchases = (purchaseInvoices || []).reduce(
      (sum, inv) => sum + (Number(inv.total_amount) || 0),
      0,
    );

    return NextResponse.json(
      {
        summary: {
          party,
          sales_invoices_count: salesCount,
          purchase_invoices_count: purchaseCount,
          total_sales_amount: Math.round(totalSales * 100) / 100,
          total_purchase_amount: Math.round(totalPurchases * 100) / 100,
          outstanding_balance: 0.0,
        },
      },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "Internal server error." }, { status: 500 });
  }
}
