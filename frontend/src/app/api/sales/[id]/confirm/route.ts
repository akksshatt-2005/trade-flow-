import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function calculateItemStock(movements: { movement_type: string; quantity: any }[]): number {
  let balance = 0;
  for (const m of movements) {
    const qty = Number(m.quantity) || 0;
    if (m.movement_type === "purchase_in" || m.movement_type === "adjustment_in") {
      balance += qty;
    } else if (m.movement_type === "sale_out" || m.movement_type === "adjustment_out") {
      balance -= qty;
    }
  }
  return Math.round(balance * 100) / 100;
}

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
      .from("sales_invoices")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();

    if (invoiceError || !invoice) {
      return NextResponse.json({ message: "Sales invoice not found." }, { status: 404 });
    }

    if (invoice.status !== "draft") {
      return NextResponse.json(
        { message: `Only draft sales invoices can be confirmed. Current status is '${invoice.status}'.` },
        { status: 400 },
      );
    }

    // Fetch lines
    const { data: lines } = await supabaseAdmin
      .from("sales_invoice_lines")
      .select("*")
      .eq("sales_invoice_id", id);

    // Group required quantities by item_id
    const requiredByItem = new Map<string, number>();
    for (const line of lines || []) {
      const currentReq = requiredByItem.get(line.item_id) || 0;
      requiredByItem.set(line.item_id, currentReq + Number(line.quantity));
    }

    // Atomic Stock Verification
    const shortages = [];
    for (const [itemId, requiredQty] of requiredByItem.entries()) {
      const { data: item } = await supabaseAdmin
        .from("items")
        .select("id, name, sku, unit")
        .eq("company_id", companyId)
        .eq("id", itemId)
        .single();

      const { data: movements } = await supabaseAdmin
        .from("stock_ledger")
        .select("movement_type, quantity")
        .eq("company_id", companyId)
        .eq("item_id", itemId);

      const availableStock = calculateItemStock(movements || []);

      if (availableStock < requiredQty) {
        shortages.push({
          item_id: itemId,
          item_name: item?.name || "Unknown Item",
          sku: item?.sku,
          unit: item?.unit || "pcs",
          available_stock: availableStock,
          required_quantity: requiredQty,
          shortage: Math.round((requiredQty - availableStock) * 100) / 100,
        });
      }
    }

    if (shortages.length > 0) {
      const shortageDetails = shortages
        .map(
          (s) =>
            `'${s.item_name}' (Available: ${s.available_stock} ${s.unit}, Required: ${s.required_quantity} ${s.unit}, Shortage: ${s.shortage} ${s.unit})`,
        )
        .join(", ");

      return NextResponse.json(
        {
          message: `Cannot confirm sales invoice due to insufficient stock for ${shortages.length} item(s): ${shortageDetails}`,
          shortages,
        },
        { status: 400 },
      );
    }

    // Write sale_out entries
    const ledgerEntries = (lines || []).map((line: any) => ({
      company_id: companyId,
      item_id: line.item_id,
      movement_type: "sale_out",
      quantity: Number(line.quantity),
      reference_type: "sales_invoice",
      reference_id: id,
    }));

    if (ledgerEntries.length > 0) {
      const { error: ledgerError } = await supabaseAdmin
        .from("stock_ledger")
        .insert(ledgerEntries);

      if (ledgerError) {
        return NextResponse.json(
          { message: "Failed to record outward stock movement in ledger." },
          { status: 500 },
        );
      }
    }

    // Update status to confirmed
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("sales_invoices")
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
        { message: "Failed to finalize sales invoice confirmation." },
        { status: 500 },
      );
    }

    return NextResponse.json({ invoice: updated }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "Internal server error." }, { status: 500 });
  }
}
