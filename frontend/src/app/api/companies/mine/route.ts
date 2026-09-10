import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
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

    const { data, error } = await supabaseAdmin
      .from("user_companies")
      .select(`
        role,
        created_at,
        companies:company_id (
          id,
          name,
          gst_number,
          address,
          created_at
        )
      `)
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json(
        { message: "Failed to fetch companies." },
        { status: 500 },
      );
    }

    const formatted = (data || [])
      .filter((row: any) => row.companies !== null)
      .map((row: any) => ({
        id: row.companies.id,
        name: row.companies.name,
        gst_number: row.companies.gst_number,
        address: row.companies.address,
        role: row.role,
        created_at: row.companies.created_at,
      }));

    return NextResponse.json({ companies: formatted }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { message: err.message || "Internal server error." },
      { status: 500 },
    );
  }
}
