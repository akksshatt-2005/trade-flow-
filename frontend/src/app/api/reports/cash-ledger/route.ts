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

export async function GET(request: Request) {
  try {
    const auth = await verifyAuthAndTenant(request);
    if ("error" in auth) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }

    const { companyId } = auth;
    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get("from_date") || undefined;
    const toDate = searchParams.get("to_date") || undefined;

    // 1. Fetch Company Base Opening Balance
    const { data: company, error: compError } = await supabaseAdmin
      .from("companies")
      .select("cash_opening_balance")
      .eq("id", companyId)
      .maybeSingle();

    if (compError) {
      return NextResponse.json({ message: "Failed to retrieve company settings." }, { status: 500 });
    }

    const baseCashOpening = Number(company?.cash_opening_balance || 0);

    // 2. Fetch or create Cash party ID
    let { data: cashParty } = await supabaseAdmin
      .from("parties")
      .select("id")
      .eq("company_id", companyId)
      .or("is_system_account.eq.true,name.ilike.Cash")
      .maybeSingle();

    if (!cashParty) {
      const { data: newCash } = await supabaseAdmin
        .from("parties")
        .insert({
          company_id: companyId,
          name: "Cash",
          type: "both",
          is_system_account: true,
        })
        .select("id")
        .single();
      cashParty = newCash;
    }

    const cashPartyId = cashParty?.id;

    // 3. Query all confirmed sales invoices for the Cash party
    const { data: salesInvoices, error: salesError } = await supabaseAdmin
      .from("sales_invoices")
      .select("id, invoice_number, invoice_date, total_amount, walkin_name, walkin_phone, created_at")
      .eq("company_id", companyId)
      .eq("party_id", cashPartyId)
      .eq("status", "confirmed");

    if (salesError) {
      return NextResponse.json({ message: "Failed to query sales cash records." }, { status: 500 });
    }

    // 4. Query all confirmed purchase invoices for the Cash party
    const { data: purchaseInvoices, error: purchasesError } = await supabaseAdmin
      .from("purchase_invoices")
      .select("id, invoice_number, invoice_date, total_amount, walkin_name, walkin_phone, created_at")
      .eq("company_id", companyId)
      .eq("party_id", cashPartyId)
      .eq("status", "confirmed");

    if (purchasesError) {
      return NextResponse.json({ message: "Failed to query purchase cash records." }, { status: 500 });
    }

    // 5. Normalize transactions
    interface RawTx {
      id: string;
      date: string;
      type: "cash_in" | "cash_out";
      invoice_number: string;
      walkin_name: string | null;
      walkin_phone: string | null;
      amount: number;
      reference_type: "sales_invoice" | "purchase_invoice";
      reference_id: string;
      created_at: string;
    }

    const allTx: RawTx[] = [];

    for (const s of salesInvoices || []) {
      allTx.push({
        id: s.id,
        date: s.invoice_date,
        type: "cash_in",
        invoice_number: s.invoice_number,
        walkin_name: s.walkin_name || null,
        walkin_phone: s.walkin_phone || null,
        amount: Number(s.total_amount) || 0,
        reference_type: "sales_invoice",
        reference_id: s.id,
        created_at: s.created_at,
      });
    }

    for (const p of purchaseInvoices || []) {
      allTx.push({
        id: p.id,
        date: p.invoice_date,
        type: "cash_out",
        invoice_number: p.invoice_number,
        walkin_name: p.walkin_name || null,
        walkin_phone: p.walkin_phone || null,
        amount: Number(p.total_amount) || 0,
        reference_type: "purchase_invoice",
        reference_id: p.id,
        created_at: p.created_at,
      });
    }

    // 6. Chronological sorting
    allTx.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return a.created_at.localeCompare(b.created_at);
    });

    // 7. Calculate prior movements (if fromDate provided)
    let periodOpeningBalance = baseCashOpening;
    const activeTransactions: RawTx[] = [];

    for (const tx of allTx) {
      if (fromDate && tx.date < fromDate) {
        if (tx.type === "cash_in") {
          periodOpeningBalance += tx.amount;
        } else {
          periodOpeningBalance -= tx.amount;
        }
      } else if (!toDate || tx.date <= toDate) {
        activeTransactions.push(tx);
      }
    }

    // 8. Compute running balance and period entries
    let running = periodOpeningBalance;
    let totalCashIn = 0;
    let totalCashOut = 0;
    const entries = [];

    for (const tx of activeTransactions) {
      if (tx.type === "cash_in") {
        running += tx.amount;
        totalCashIn += tx.amount;
      } else {
        running -= tx.amount;
        totalCashOut += tx.amount;
      }

      entries.push({
        id: tx.id,
        date: tx.date,
        type: tx.type,
        invoice_number: tx.invoice_number,
        walkin_name: tx.walkin_name,
        walkin_phone: tx.walkin_phone,
        amount: Math.round(tx.amount * 100) / 100,
        running_balance: Math.round(running * 100) / 100,
        reference_type: tx.reference_type,
        reference_id: tx.reference_id,
        created_at: tx.created_at,
      });
    }

    const closingBalance = running;

    return NextResponse.json(
      {
        opening_balance: Math.round(periodOpeningBalance * 100) / 100,
        closing_balance: Math.round(closingBalance * 100) / 100,
        total_cash_in: Math.round(totalCashIn * 100) / 100,
        total_cash_out: Math.round(totalCashOut * 100) / 100,
        from_date: fromDate || null,
        to_date: toDate || null,
        entries_count: entries.length,
        entries,
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
