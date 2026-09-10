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

    const { data: ledger, error } = await supabaseAdmin
      .from("stock_ledger")
      .select("*")
      .eq("company_id", companyId)
      .eq("item_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ message: "Failed to fetch ledger." }, { status: 500 });
    }

    const formatted = (ledger || []).map((entry) => ({
      id: entry.id,
      company_id: entry.company_id,
      item_id: entry.item_id,
      movement_type: entry.movement_type,
      quantity: Number(entry.quantity),
      reference_type: entry.reference_type,
      reference_id: entry.reference_id,
      created_at: entry.created_at,
    }));

    return NextResponse.json({ ledger: formatted }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "Internal server error." }, { status: 500 });
  }
}
