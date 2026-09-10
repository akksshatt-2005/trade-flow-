import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !authData?.user) {
      return NextResponse.json(
        { message: "Invalid session token." },
        { status: 401 },
      );
    }

    const userId = authData.user.id;
    const body = await request.json();
    const { name, gst_number, address, state } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { message: "Company name is required." },
        { status: 400 },
      );
    }

    // 1. Create company
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({
        name: name.trim(),
        gst_number: gst_number?.trim() || null,
        address: address?.trim() || null,
        state: state?.trim() || null,
      })
      .select()
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { message: "Failed to create company record." },
        { status: 500 },
      );
    }

    // 2. Link creator as owner in user_companies
    const { error: linkError } = await supabaseAdmin
      .from("user_companies")
      .insert({
        user_id: userId,
        company_id: company.id,
        role: "owner",
      });

    if (linkError) {
      await supabaseAdmin.from("companies").delete().eq("id", company.id).catch(() => null);
      return NextResponse.json(
        { message: "Failed to assign ownership permissions." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        company: {
          id: company.id,
          name: company.name,
          gst_number: company.gst_number,
          address: company.address,
          state: company.state,
          role: "owner",
          created_at: company.created_at,
        },
      },
      { status: 201 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: err.message || "Internal server error." },
      { status: 500 },
    );
  }
}
