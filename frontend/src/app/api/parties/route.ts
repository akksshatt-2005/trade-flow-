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

export async function GET(request: Request) {
  try {
    const auth = await verifyAuthAndTenant(request);
    if ("error" in auth) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }

    const { companyId } = auth;
    const { searchParams } = new URL(request.url);
    const filterType = searchParams.get("type");

    let query = supabaseAdmin
      .from("parties")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (filterType) {
      const lower = filterType.trim().toLowerCase();
      if (lower === "customer") {
        query = query.in("type", ["customer", "both"]);
      } else if (lower === "vendor") {
        query = query.in("type", ["vendor", "both"]);
      } else if (lower === "both") {
        query = query.eq("type", "both");
      }
    }

    const { data: parties, error } = await query;

    if (error) {
      return NextResponse.json({ message: "Failed to fetch parties." }, { status: 500 });
    }

    return NextResponse.json({ parties: (parties || []).map(formatParty) }, { status: 200 });
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
    const {
      name,
      type,
      phone,
      email,
      address,
      city,
      state,
      pincode,
      gst_number,
      pan,
      drug_license_number,
      drug_license_expiry,
      opening_balance,
      opening_balance_type,
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ message: "Party name is required." }, { status: 400 });
    }

    if (!type || !["customer", "vendor", "both"].includes(type)) {
      return NextResponse.json(
        { message: "Party type must be 'customer', 'vendor', or 'both'." },
        { status: 400 },
      );
    }

    if (phone && typeof phone === "string" && phone.trim()) {
      const phoneRegex = /^\+?[0-9\s\-()]{8,15}$/;
      if (!phoneRegex.test(phone.trim())) {
        return NextResponse.json(
          { message: "Phone number must be between 8 and 15 digits." },
          { status: 400 },
        );
      }
    }

    const finalAddress = serializePartyAddress({
      address,
      city,
      state,
      pincode,
      email,
      pan,
      drug_license_number,
      drug_license_expiry,
      opening_balance,
      opening_balance_type,
    });

    const insertPayload: any = {
      company_id: companyId,
      name: name.trim(),
      type,
      phone: phone?.trim() || null,
      address: finalAddress,
      gst_number: gst_number?.trim() || null,
      email: email?.trim() || null,
      city: city?.trim() || null,
      state: state?.trim() || null,
      pincode: pincode?.trim() || null,
      pan: pan?.trim()?.toUpperCase() || null,
      drug_license_number: drug_license_number?.trim() || null,
      drug_license_expiry: drug_license_expiry?.trim() || null,
      opening_balance: opening_balance !== undefined ? Number(opening_balance) : 0,
      opening_balance_type: opening_balance_type || "cr",
    };

    let { data: party, error } = await supabaseAdmin
      .from("parties")
      .insert(insertPayload)
      .select()
      .maybeSingle();

    if (error && error.message?.includes("column")) {
      const basicPayload = {
        company_id: companyId,
        name: name.trim(),
        type,
        phone: phone?.trim() || null,
        address: finalAddress,
        gst_number: gst_number?.trim() || null,
      };

      const retry = await supabaseAdmin
        .from("parties")
        .insert(basicPayload)
        .select()
        .single();

      party = retry.data;
      error = retry.error;
    }

    if (error || !party) {
      return NextResponse.json(
        { message: error?.message || "Failed to create party." },
        { status: 500 },
      );
    }

    return NextResponse.json({ party: formatParty(party) }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "Internal server error." }, { status: 500 });
  }
}
