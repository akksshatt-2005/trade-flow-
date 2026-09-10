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

const GST_STATE_CODES: Record<string, string> = {
  '01': 'jammu and kashmir', '02': 'himachal pradesh', '03': 'punjab', '04': 'chandigarh',
  '05': 'uttarakhand', '06': 'haryana', '07': 'delhi', '08': 'rajasthan', '09': 'uttar pradesh',
  '10': 'bihar', '11': 'sikkim', '12': 'arunachal pradesh', '13': 'nagaland', '14': 'manipur',
  '15': 'mizoram', '16': 'tripura', '17': 'meghalaya', '18': 'assam', '19': 'west bengal',
  '20': 'jharkhand', '21': 'odisha', '22': 'chhattisgarh', '23': 'madhya pradesh', '24': 'gujarat',
  '27': 'maharashtra', '29': 'karnataka', '30': 'goa', '32': 'kerala', '33': 'tamil nadu',
  '36': 'telangana', '37': 'andhra pradesh',
};

const KNOWN_STATES = [
  'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh', 'goa', 'gujarat',
  'haryana', 'himachal pradesh', 'jharkhand', 'karnataka', 'kerala', 'madhya pradesh',
  'maharashtra', 'manipur', 'meghalaya', 'mizoram', 'nagaland', 'odisha', 'punjab',
  'rajasthan', 'sikkim', 'tamil nadu', 'telangana', 'tripura', 'uttar pradesh', 'uttarakhand',
  'west bengal', 'delhi', 'chandigarh', 'jammu & kashmir', 'ladakh', 'puducherry',
];

function resolveState(entity?: { gst_number?: string | null; address?: string | null; state?: string | null } | null): string {
  if (!entity) return '';
  if (entity.state && entity.state.trim()) return entity.state.trim().toLowerCase();
  if (entity.gst_number && entity.gst_number.trim().length >= 2) {
    const code = entity.gst_number.trim().substring(0, 2);
    if (GST_STATE_CODES[code]) return GST_STATE_CODES[code];
  }
  if (entity.address && entity.address.trim()) {
    const addrLower = entity.address.trim().toLowerCase();
    for (const st of KNOWN_STATES) {
      if (addrLower.includes(st)) return st;
    }
    return addrLower;
  }
  return '';
}

export async function GET(request: Request) {
  try {
    const auth = await verifyAuthAndTenant(request);
    if ("error" in auth) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }

    const { companyId } = auth;

    const { data: invoices, error } = await supabaseAdmin
      .from("sales_invoices")
      .select(`
        *,
        parties:party_id ( id, name, phone, address, gst_number )
      `)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ message: "Failed to fetch sales invoices." }, { status: 500 });
    }

    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("address, gst_number")
      .eq("id", companyId)
      .maybeSingle();

    const compState = resolveState(company);

    const formatted = (invoices || []).map((inv: any) => {
      const partyState = resolveState(inv.parties);
      const isInterstate = Boolean(compState && partyState && compState !== partyState);
      const totalGst = Number(inv.gst_amount) || 0;
      const totalAmount = Number(inv.total_amount) || 0;
      const totalTaxable = Math.round((totalAmount - totalGst) * 100) / 100;

      const cgst = isInterstate ? 0 : Math.round((totalGst / 2) * 100) / 100;
      const sgst = isInterstate ? 0 : Math.round((totalGst / 2) * 100) / 100;
      const igst = isInterstate ? totalGst : 0;

      return {
        id: inv.id,
        company_id: inv.company_id,
        party_id: inv.party_id,
        party: {
          ...inv.parties,
          state: partyState,
        },
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        total_taxable_amount: totalTaxable,
        cgst_amount: cgst,
        sgst_amount: sgst,
        igst_amount: igst,
        gst_amount: totalGst,
        total_amount: totalAmount,
        is_interstate: isInterstate,
        status: inv.status,
        created_at: inv.created_at,
        updated_at: inv.updated_at,
      };
    });

    return NextResponse.json({ invoices: formatted }, { status: 200 });
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
    const { party_id, invoice_number, invoice_date, lines } = body;

    if (!party_id || !invoice_number || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { message: "Customer, invoice number, and at least one line item are required." },
        { status: 400 },
      );
    }

    // Verify customer party
    const { data: party, error: partyError } = await supabaseAdmin
      .from("parties")
      .select("id, name, type, address, gst_number")
      .eq("company_id", companyId)
      .eq("id", party_id)
      .maybeSingle();

    if (partyError || !party) {
      return NextResponse.json({ message: "Selected customer not found." }, { status: 400 });
    }

    if (party.type !== "customer" && party.type !== "both") {
      return NextResponse.json(
        { message: `Selected party '${party.name}' has type '${party.type}'. Sales invoices can only be created for customers.` },
        { status: 400 },
      );
    }

    // Check invoice_number uniqueness for company
    const { data: existingInv } = await supabaseAdmin
      .from("sales_invoices")
      .select("id")
      .eq("company_id", companyId)
      .eq("invoice_number", invoice_number.trim())
      .maybeSingle();

    if (existingInv) {
      return NextResponse.json(
        { message: `Sales invoice with number '${invoice_number}' already exists in this company.` },
        { status: 409 },
      );
    }

    // Fetch company state
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("address, gst_number")
      .eq("id", companyId)
      .maybeSingle();

    const compState = resolveState(company);
    const partyState = resolveState(party);
    const isInterstate = Boolean(compState && partyState && compState !== partyState);
    let totalGst = 0;
    let totalAmount = 0;
    const computedLines = [];

    for (const line of lines) {
      const { data: item } = await supabaseAdmin
        .from("items")
        .select("id, name, unit")
        .eq("company_id", companyId)
        .eq("id", line.item_id)
        .maybeSingle();

      if (!item) {
        return NextResponse.json(
          { message: `Item ID '${line.item_id}' not found in this company.` },
          { status: 400 },
        );
      }

      const qty = Number(line.quantity);
      const rate = Number(line.rate);
      const gstRate = Number(line.gst_rate ?? 0);

      const taxable = Math.round(qty * rate * 100) / 100;
      const gst = Math.round(taxable * (gstRate / 100) * 100) / 100;
      const lineTotal = Math.round((taxable + gst) * 100) / 100;

      totalGst += gst;
      totalAmount += lineTotal;

      computedLines.push({
        item_id: item.id,
        quantity: qty,
        rate: rate,
        gst_rate: gstRate,
        line_total: lineTotal,
      });
    }

    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("sales_invoices")
      .insert({
        company_id: companyId,
        party_id,
        invoice_number: invoice_number.trim(),
        invoice_date: invoice_date || new Date().toISOString().split("T")[0],
        total_amount: Math.round(totalAmount * 100) / 100,
        gst_amount: Math.round(totalGst * 100) / 100,
        status: "draft",
      })
      .select()
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { message: invoiceError?.message || "Failed to create sales invoice." },
        { status: 500 },
      );
    }

    const linesToInsert = computedLines.map((l) => ({
      sales_invoice_id: invoice.id,
      item_id: l.item_id,
      quantity: l.quantity,
      rate: l.rate,
      gst_rate: l.gst_rate,
      line_total: l.line_total,
    }));

    await supabaseAdmin.from("sales_invoice_lines").insert(linesToInsert);

    return NextResponse.json({ invoice: { ...invoice, lines: linesToInsert } }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "Internal server error." }, { status: 500 });
  }
}
