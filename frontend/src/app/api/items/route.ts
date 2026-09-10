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
    return { error: "Invalid or expired session token.", status: 401 };
  }

  const userId = authData.user.id;

  // Verify access to company
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

    // Fetch items
    const { data: items, error: itemsError } = await supabaseAdmin
      .from("items")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (itemsError) {
      return NextResponse.json({ message: "Failed to fetch items." }, { status: 500 });
    }

    // Fetch all stock ledger entries for this company
    const { data: ledgerEntries } = await supabaseAdmin
      .from("stock_ledger")
      .select("item_id, movement_type, quantity")
      .eq("company_id", companyId);

    const ledgerMap = new Map<string, { movement_type: string; quantity: any }[]>();
    for (const entry of ledgerEntries || []) {
      if (!ledgerMap.has(entry.item_id)) {
        ledgerMap.set(entry.item_id, []);
      }
      ledgerMap.get(entry.item_id)!.push(entry);
    }

    const formatted = (items || []).map((item) => {
      const movements = ledgerMap.get(item.id) || [];
      const currentStock = calculateStock(movements);
      const threshold = Number(item.reorder_threshold) || 0;

      return {
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
      };
    });

    return NextResponse.json({ items: formatted }, { status: 200 });
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
    const { name, sku, hsn_code, gst_rate, unit, opening_stock, reorder_threshold } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ message: "Item name is required." }, { status: 400 });
    }

    // 1. Check duplicate SKU within the same company
    if (sku && typeof sku === "string" && sku.trim()) {
      const { data: existing } = await supabaseAdmin
        .from("items")
        .select("id")
        .eq("company_id", companyId)
        .eq("sku", sku.trim())
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          { message: `Item with SKU '${sku.trim()}' already exists in this company.` },
          { status: 409 },
        );
      }
    }

    const openingStock = Number(opening_stock) || 0;
    const reorderThreshold = Number(reorder_threshold) || 0;

    // 2. Insert item
    const insertPayload: any = {
      company_id: companyId,
      name: name.trim(),
      sku: sku?.trim() || null,
      hsn_code: hsn_code?.trim() || null,
      gst_rate: Number(gst_rate) || 0,
      unit: unit?.trim() || "pcs",
      opening_stock: openingStock,
      reorder_threshold: reorderThreshold,
    };

    let { data: item, error: itemError } = await supabaseAdmin
      .from("items")
      .insert(insertPayload)
      .select()
      .maybeSingle();

    if (itemError?.message?.includes("reorder_threshold")) {
      delete insertPayload.reorder_threshold;
      const retry = await supabaseAdmin
        .from("items")
        .insert(insertPayload)
        .select()
        .single();
      item = retry.data;
      itemError = retry.error;
    }

    if (itemError || !item) {
      if (itemError?.code === "23505" || itemError?.message?.includes("duplicate key")) {
        return NextResponse.json(
          { message: `Item with SKU '${sku}' already exists in this company.` },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { message: itemError?.message || "Failed to create item." },
        { status: 500 },
      );
    }

    // 3. Insert initial movement into stock_ledger if opening_stock > 0
    if (openingStock > 0) {
      await supabaseAdmin.from("stock_ledger").insert({
        company_id: companyId,
        item_id: item.id,
        movement_type: "adjustment_in",
        quantity: openingStock,
        reference_type: "opening_stock",
        reference_id: item.id,
      });
    }

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
          opening_stock: openingStock,
          reorder_threshold: reorderThreshold,
          current_stock: openingStock,
          is_low_stock: reorderThreshold > 0 && openingStock <= reorderThreshold,
          created_at: item.created_at,
          updated_at: item.updated_at,
        },
      },
      { status: 201 },
    );
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "Internal server error." }, { status: 500 });
  }
}
