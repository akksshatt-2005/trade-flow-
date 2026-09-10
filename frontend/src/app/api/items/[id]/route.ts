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

    const { data: item, error: itemError } = await supabaseAdmin
      .from("items")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();

    if (itemError || !item) {
      return NextResponse.json({ message: "Item not found." }, { status: 404 });
    }

    const { data: movements } = await supabaseAdmin
      .from("stock_ledger")
      .select("movement_type, quantity")
      .eq("company_id", companyId)
      .eq("item_id", id);

    const currentStock = calculateStock(movements || []);
    const threshold = Number(item.reorder_threshold) || 0;

    return NextResponse.json(
      {
        item: {
          id: item.id,
          company_id: item.company_id,
          name: item.name,
          sku: item.sku,
          hsn_code: item.hsn_code,
          gst_rate: Number(item.gst_rate) || 0,
          unit: item.unit,
          opening_stock: Number(item.opening_stock) || 0,
          reorder_threshold: threshold,
          current_stock: currentStock,
          is_low_stock: threshold > 0 && currentStock <= threshold,
          created_at: item.created_at,
          updated_at: item.updated_at,
        },
      },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "Internal server error." }, { status: 500 });
  }
}

export async function PATCH(
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

    if (body.opening_stock !== undefined) {
      return NextResponse.json(
        {
          message:
            "Opening stock cannot be edited after creation. Use /items/:id/adjust-stock to record stock adjustments.",
        },
        { status: 400 },
      );
    }

    const updatePayload: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) updatePayload.name = body.name.trim();
    if (body.hsn_code !== undefined) updatePayload.hsn_code = body.hsn_code?.trim() || null;
    if (body.gst_rate !== undefined) updatePayload.gst_rate = Number(body.gst_rate);
    if (body.unit !== undefined) updatePayload.unit = body.unit?.trim() || "pcs";
    if (body.reorder_threshold !== undefined) {
      updatePayload.reorder_threshold = Number(body.reorder_threshold);
    }

    let { data: updated, error } = await supabaseAdmin
      .from("items")
      .update(updatePayload)
      .eq("company_id", companyId)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error?.message?.includes("reorder_threshold")) {
      delete updatePayload.reorder_threshold;
      const retry = await supabaseAdmin
        .from("items")
        .update(updatePayload)
        .eq("company_id", companyId)
        .eq("id", id)
        .select()
        .single();
      updated = retry.data;
      error = retry.error;
    }

    if (error || !updated) {
      return NextResponse.json({ message: "Failed to update item." }, { status: 500 });
    }

    const { data: movements } = await supabaseAdmin
      .from("stock_ledger")
      .select("movement_type, quantity")
      .eq("company_id", companyId)
      .eq("item_id", id);

    const currentStock = calculateStock(movements || []);
    const threshold = Number(updated.reorder_threshold) || 0;

    return NextResponse.json(
      {
        item: {
          id: updated.id,
          company_id: updated.company_id,
          name: updated.name,
          sku: updated.sku,
          hsn_code: updated.hsn_code,
          gst_rate: Number(updated.gst_rate) || 0,
          unit: updated.unit,
          opening_stock: Number(updated.opening_stock) || 0,
          reorder_threshold: threshold,
          current_stock: currentStock,
          is_low_stock: threshold > 0 && currentStock <= threshold,
          created_at: updated.created_at,
          updated_at: updated.updated_at,
        },
      },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "Internal server error." }, { status: 500 });
  }
}
