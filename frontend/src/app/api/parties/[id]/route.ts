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

    const { data: party, error } = await supabaseAdmin
      .from("parties")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();

    if (error || !party) {
      return NextResponse.json({ message: "Party not found in this company." }, { status: 404 });
    }

    return NextResponse.json({ party }, { status: 200 });
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

    // Verify existing party
    const { data: currentParty, error: findError } = await supabaseAdmin
      .from("parties")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();

    if (findError || !currentParty) {
      return NextResponse.json({ message: "Party not found in this company." }, { status: 404 });
    }

    // Check if type change is attempted and invoices exist
    if (body.type && body.type !== currentParty.type) {
      const { count: salesCount } = await supabaseAdmin
        .from("sales_invoices")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("party_id", id);

      const { count: purchaseCount } = await supabaseAdmin
        .from("purchase_invoices")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("party_id", id);

      if ((salesCount || 0) > 0 || (purchaseCount || 0) > 0) {
        return NextResponse.json(
          { message: "Cannot change party type because invoices already exist for this party." },
          { status: 400 },
        );
      }
    }

    const updatePayload: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) updatePayload.name = body.name.trim();
    if (body.type !== undefined) updatePayload.type = body.type;
    if (body.phone !== undefined) updatePayload.phone = body.phone?.trim() || null;
    if (body.address !== undefined) updatePayload.address = body.address?.trim() || null;
    if (body.gst_number !== undefined) updatePayload.gst_number = body.gst_number?.trim() || null;

    const { data: updated, error } = await supabaseAdmin
      .from("parties")
      .update(updatePayload)
      .eq("company_id", companyId)
      .eq("id", id)
      .select()
      .single();

    if (error || !updated) {
      return NextResponse.json({ message: "Failed to update party." }, { status: 500 });
    }

    return NextResponse.json({ party: updated }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "Internal server error." }, { status: 500 });
  }
}
