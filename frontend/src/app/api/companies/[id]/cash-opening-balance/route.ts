import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

async function verifyAuthAndTenant(request: Request, companyIdParam?: string) {
  const authHeader = request.headers.get("Authorization");
  const companyId = companyIdParam || request.headers.get("x-company-id") || request.headers.get("company-id");

  if (!authHeader) {
    return { error: "Authentication token required.", status: 401 };
  }

  if (!companyId) {
    return { error: "Missing company ID.", status: 400 };
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: companyId } = await params;
    const auth = await verifyAuthAndTenant(request, companyId);
    if ("error" in auth) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const { cash_opening_balance } = body;

    const balanceNum = Number(cash_opening_balance);
    if (isNaN(balanceNum) || balanceNum < 0) {
      return NextResponse.json(
        { message: "Cash opening balance must be a non-negative number." },
        { status: 400 },
      );
    }

    // 1. Find the Cash party ID
    const { data: cashParty } = await supabaseAdmin
      .from("parties")
      .select("id")
      .eq("company_id", companyId)
      .or("is_system_account.eq.true,name.ilike.Cash")
      .maybeSingle();

    if (cashParty) {
      // 2. Check for confirmed cash sales
      const { count: salesCount } = await supabaseAdmin
        .from("sales_invoices")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("party_id", cashParty.id)
        .eq("status", "confirmed");

      // 3. Check for confirmed cash purchases
      const { count: purchasesCount } = await supabaseAdmin
        .from("purchase_invoices")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("party_id", cashParty.id)
        .eq("status", "confirmed");

      const totalCashTx = (salesCount || 0) + (purchasesCount || 0);
      if (totalCashTx > 0) {
        return NextResponse.json(
          {
            message: `Cannot update cash opening balance after ${totalCashTx} confirmed cash transaction(s) have been recorded.`,
          },
          { status: 400 },
        );
      }
    }

    // 4. Update company cash_opening_balance
    const { error: updateError } = await supabaseAdmin
      .from("companies")
      .update({
        cash_opening_balance: Math.round(balanceNum * 100) / 100,
        updated_at: new Date().toISOString(),
      })
      .eq("id", companyId);

    if (updateError) {
      return NextResponse.json(
        { message: "Failed to update cash opening balance." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        company_id: companyId,
        cash_opening_balance: Math.round(balanceNum * 100) / 100,
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
