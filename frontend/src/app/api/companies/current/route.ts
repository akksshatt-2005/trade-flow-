import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const companyId =
      request.headers.get("x-company-id") ||
      request.headers.get("company-id");

    if (!authHeader) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (!companyId) {
      return NextResponse.json(
        { message: "Missing x-company-id header." },
        { status: 400 },
      );
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

    const { data, error } = await supabaseAdmin
      .from("user_companies")
      .select(`
        role,
        companies:company_id (
          id,
          name,
          gst_number,
          address
        )
      `)
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { message: "Access denied. You do not have access to this company." },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        context: {
          id: companyId,
          role: data.role,
          details: data.companies,
        },
      },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: err.message || "Internal server error." },
      { status: 500 },
    );
  }
}
