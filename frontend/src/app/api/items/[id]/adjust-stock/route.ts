import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function calculateStock(movements: { movement_type: string; quantity: any }[]): number {
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
    const body = await request.json();
    const { adjustment_type, quantity, reason } = body;

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      return NextResponse.json(
        { message: "Adjustment quantity must be greater than zero." },
        { status: 400 },
      );
    }

    if (!reason || typeof reason !== "string" || !reason.trim()) {
      return NextResponse.json(
        { message: "Reason is required for manual stock adjustments." },
        { status: 400 },
      );
    }

    let movementType: "adjustment_in" | "adjustment_out" = "adjustment_in";
    if (adjustment_type === "adjustment_out" || adjustment_type === "out") {
      movementType = "adjustment_out";
    }

    // Verify item exists
    const { data: item, error: itemError } = await supabaseAdmin
      .from("items")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();

    if (itemError || !item) {
      return NextResponse.json({ message: "Item not found in this company." }, { status: 404 });
    }

    // Calculate current stock from ledger
    const { data: movements } = await supabaseAdmin
      .from("stock_ledger")
      .select("movement_type, quantity")
      .eq("company_id", companyId)
      .eq("item_id", id);

    const currentStock = calculateStock(movements || []);

    // Strict Negative Stock Guard
    if (movementType === "adjustment_out") {
      if (currentStock - qty < 0) {
        return NextResponse.json(
          {
            message: `Cannot adjust stock below zero. Current stock is ${currentStock} ${item.unit}, requested reduction is ${qty} ${item.unit}.`,
          },
          { status: 400 },
        );
      }
    }

    // Append to immutable stock_ledger
    const { data: movement, error } = await supabaseAdmin
      .from("stock_ledger")
      .insert({
        company_id: companyId,
        item_id: id,
        movement_type: movementType,
        quantity: qty,
        reference_type: reason.trim(),
        reference_id: null,
      })
      .select()
      .single();

    if (error || !movement) {
      return NextResponse.json(
        { message: error?.message || "Failed to record stock adjustment." },
        { status: 500 },
      );
    }

    const newStock =
      movementType === "adjustment_in" ? currentStock + qty : currentStock - qty;

    return NextResponse.json(
      {
        success: true,
        new_stock: Math.round(newStock * 100) / 100,
        movement: {
          id: movement.id,
          company_id: movement.company_id,
          item_id: movement.item_id,
          movement_type: movement.movement_type,
          quantity: Number(movement.quantity),
          reference_type: movement.reference_type,
          reference_id: movement.reference_id,
          created_at: movement.created_at,
        },
      },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "Internal server error." }, { status: 500 });
  }
}
