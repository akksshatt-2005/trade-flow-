import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { formatParty, serializePartyAddress } from "@/lib/party-utils";

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

    return NextResponse.json({ party: formatParty(party) }, { status: 200 });
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
    const { data: currentPartyRaw, error: findError } = await supabaseAdmin
      .from("parties")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();

    if (findError || !currentPartyRaw) {
      return NextResponse.json({ message: "Party not found in this company." }, { status: 404 });
    }

    const currentParty = formatParty(currentPartyRaw);

    // Guard: System Cash account protection
    const isSystemCash = Boolean(currentParty.is_system_account) || currentParty.name.toLowerCase() === "cash";
    if (isSystemCash) {
      if (body.name && body.name.trim().toLowerCase() !== currentParty.name.toLowerCase()) {
        return NextResponse.json(
          { message: "Cannot change the name of the system Cash account." },
          { status: 400 },
        );
      }
      if (body.type && body.type !== currentParty.type) {
        return NextResponse.json(
          { message: "Cannot change the party type of the system Cash account." },
          { status: 400 },
        );
      }
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

    const mergedDto = {
      address: body.address !== undefined ? body.address : currentParty.address,
      city: body.city !== undefined ? body.city : currentParty.city,
      state: body.state !== undefined ? body.state : currentParty.state,
      pincode: body.pincode !== undefined ? body.pincode : currentParty.pincode,
      email: body.email !== undefined ? body.email : currentParty.email,
      pan: body.pan !== undefined ? body.pan : currentParty.pan,
      drug_license_number:
        body.drug_license_number !== undefined
          ? body.drug_license_number
          : currentParty.drug_license_number,
      drug_license_expiry:
        body.drug_license_expiry !== undefined
          ? body.drug_license_expiry
          : currentParty.drug_license_expiry,
      opening_balance:
        body.opening_balance !== undefined ? body.opening_balance : currentParty.opening_balance,
      opening_balance_type:
        body.opening_balance_type !== undefined
          ? body.opening_balance_type
          : currentParty.opening_balance_type,
    };

    const finalAddress = serializePartyAddress(mergedDto);

    const updatePayload: any = {
      updated_at: new Date().toISOString(),
      address: finalAddress,
    };

    if (body.name !== undefined) updatePayload.name = body.name.trim();
    if (body.type !== undefined) updatePayload.type = body.type;
    if (body.phone !== undefined) updatePayload.phone = body.phone?.trim() || null;
    if (body.gst_number !== undefined) updatePayload.gst_number = body.gst_number?.trim() || null;

    if (body.email !== undefined) updatePayload.email = body.email?.trim() || null;
    if (body.city !== undefined) updatePayload.city = body.city?.trim() || null;
    if (body.state !== undefined) updatePayload.state = body.state?.trim() || null;
    if (body.pincode !== undefined) updatePayload.pincode = body.pincode?.trim() || null;
    if (body.pan !== undefined) updatePayload.pan = body.pan?.trim()?.toUpperCase() || null;
    if (body.drug_license_number !== undefined) {
      updatePayload.drug_license_number = body.drug_license_number?.trim() || null;
    }
    if (body.drug_license_expiry !== undefined) {
      updatePayload.drug_license_expiry = body.drug_license_expiry?.trim() || null;
    }
    if (body.opening_balance !== undefined) {
      updatePayload.opening_balance = Number(body.opening_balance);
    }
    if (body.opening_balance_type !== undefined) {
      updatePayload.opening_balance_type = body.opening_balance_type;
    }

    let { data: updated, error } = await supabaseAdmin
      .from("parties")
      .update(updatePayload)
      .eq("company_id", companyId)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error && error.message?.includes("column")) {
      const basicPayload: any = {
        updated_at: new Date().toISOString(),
        address: finalAddress,
      };
      if (body.name !== undefined) basicPayload.name = body.name.trim();
      if (body.type !== undefined) basicPayload.type = body.type;
      if (body.phone !== undefined) basicPayload.phone = body.phone?.trim() || null;
      if (body.gst_number !== undefined) basicPayload.gst_number = body.gst_number?.trim() || null;

      const retry = await supabaseAdmin
        .from("parties")
        .update(basicPayload)
        .eq("company_id", companyId)
        .eq("id", id)
        .select()
        .single();

      updated = retry.data;
      error = retry.error;
    }

    if (error || !updated) {
      return NextResponse.json({ message: "Failed to update party." }, { status: 500 });
    }

    return NextResponse.json({ party: formatParty(updated) }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "Internal server error." }, { status: 500 });
  }
}

export async function DELETE(
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

    const { data: party, error: findError } = await supabaseAdmin
      .from("parties")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();

    if (findError || !party) {
      return NextResponse.json({ message: "Party not found in this company." }, { status: 404 });
    }

    if (party.is_system_account || party.name.toLowerCase() === "cash") {
      return NextResponse.json(
        { message: "Cannot delete the system Cash account." },
        { status: 400 },
      );
    }

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
        { message: "Cannot delete party with existing invoice history." },
        { status: 400 },
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("parties")
      .delete()
      .eq("company_id", companyId)
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json({ message: "Failed to delete party." }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Party deleted successfully." }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "Internal server error." }, { status: 500 });
  }
}
