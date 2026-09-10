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

export async function POST(
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

    // Verify draft status
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("purchase_invoices")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();

    if (invoiceError || !invoice) {
      return NextResponse.json({ message: "Purchase invoice not found." }, { status: 404 });
    }

    if (invoice.status !== "draft") {
      return NextResponse.json(
        { message: `Only draft purchase invoices can be confirmed. Current status is '${invoice.status}'.` },
        { status: 400 },
      );
    }

    // Fetch lines
    const { data: lines } = await supabaseAdmin
      .from("purchase_invoice_lines")
      .select("*")
      .eq("purchase_invoice_id", id);

    // Write stock_ledger entries
    const ledgerEntries = (lines || []).map((line: any) => ({
      company_id: companyId,
      item_id: line.item_id,
      movement_type: "purchase_in",
      quantity: Number(line.quantity),
      reference_type: "purchase_invoice",
      reference_id: id,
    }));

    if (ledgerEntries.length > 0) {
      const { error: ledgerError } = await supabaseAdmin
        .from("stock_ledger")
        .insert(ledgerEntries);

      if (ledgerError) {
        return NextResponse.json(
          { message: "Failed to record inward stock in ledger." },
          { status: 500 },
        );
      }
    }

    // Update status to confirmed
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("purchase_invoices")
      .update({
        status: "confirmed",
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { message: "Failed to update invoice status to confirmed." },
        { status: 500 },
      );
    }

    return NextResponse.json({ invoice: updated }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "Internal server error." }, { status: 500 });
  }
}
