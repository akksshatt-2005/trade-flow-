import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CompaniesService } from '../companies/companies.service';

export interface CashLedgerEntry {
  id: string;
  date: string;
  type: 'cash_in' | 'cash_out';
  invoice_number: string;
  walkin_name: string | null;
  walkin_phone: string | null;
  amount: number;
  running_balance: number;
  reference_type: 'sales_invoice' | 'purchase_invoice';
  reference_id: string;
  created_at: string;
}

export interface CashLedgerReport {
  opening_balance: number;
  closing_balance: number;
  total_cash_in: number;
  total_cash_out: number;
  from_date: string | null;
  to_date: string | null;
  entries_count: number;
  entries: CashLedgerEntry[];
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly companiesService: CompaniesService,
  ) {}

  /**
   * Generates a chronologically sorted cash ledger report for a company,
   * calculating running balances and period opening balance adjustments.
   */
  async getCashLedger(
    companyId: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<CashLedgerReport> {
    const admin = this.supabaseService.getAdminClient();

    // 1. Fetch Company Base Opening Balance
    const { data: company, error: compError } = await admin
      .from('companies')
      .select('cash_opening_balance')
      .eq('id', companyId)
      .maybeSingle();

    if (compError) {
      this.logger.error(`Error fetching company cash opening balance: ${compError.message}`);
      throw new InternalServerErrorException('Failed to retrieve cash account settings.');
    }

    const baseCashOpening = Number(company?.cash_opening_balance || 0);

    // 2. Fetch or ensure system Cash party ID
    const cashPartyId = await this.companiesService.ensureSystemCashAccount(companyId);

    // 3. Query all confirmed sales invoices for the Cash party
    const { data: salesInvoices, error: salesError } = await admin
      .from('sales_invoices')
      .select('id, invoice_number, invoice_date, total_amount, walkin_name, walkin_phone, created_at')
      .eq('company_id', companyId)
      .eq('party_id', cashPartyId)
      .eq('status', 'confirmed');

    if (salesError) {
      this.logger.error(`Error querying cash sales for ledger: ${salesError.message}`);
      throw new InternalServerErrorException('Failed to query sales cash records.');
    }

    // 4. Query all confirmed purchase invoices for the Cash party
    const { data: purchaseInvoices, error: purchasesError } = await admin
      .from('purchase_invoices')
      .select('id, invoice_number, invoice_date, total_amount, walkin_name, walkin_phone, created_at')
      .eq('company_id', companyId)
      .eq('party_id', cashPartyId)
      .eq('status', 'confirmed');

    if (purchasesError) {
      this.logger.error(`Error querying cash purchases for ledger: ${purchasesError.message}`);
      throw new InternalServerErrorException('Failed to query purchase cash records.');
    }

    // 5. Normalize transactions
    interface RawTx {
      id: string;
      date: string;
      type: 'cash_in' | 'cash_out';
      invoice_number: string;
      walkin_name: string | null;
      walkin_phone: string | null;
      amount: number;
      reference_type: 'sales_invoice' | 'purchase_invoice';
      reference_id: string;
      created_at: string;
    }

    const allTx: RawTx[] = [];

    for (const s of salesInvoices || []) {
      allTx.push({
        id: s.id,
        date: s.invoice_date,
        type: 'cash_in',
        invoice_number: s.invoice_number,
        walkin_name: s.walkin_name || null,
        walkin_phone: s.walkin_phone || null,
        amount: Number(s.total_amount) || 0,
        reference_type: 'sales_invoice',
        reference_id: s.id,
        created_at: s.created_at,
      });
    }

    for (const p of purchaseInvoices || []) {
      allTx.push({
        id: p.id,
        date: p.invoice_date,
        type: 'cash_out',
        invoice_number: p.invoice_number,
        walkin_name: p.walkin_name || null,
        walkin_phone: p.walkin_phone || null,
        amount: Number(p.total_amount) || 0,
        reference_type: 'purchase_invoice',
        reference_id: p.id,
        created_at: p.created_at,
      });
    }

    // 6. Chronological sorting: date ascending, then created_at ascending
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
        if (tx.type === 'cash_in') {
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
    const entries: CashLedgerEntry[] = [];

    for (const tx of activeTransactions) {
      if (tx.type === 'cash_in') {
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

    return {
      opening_balance: Math.round(periodOpeningBalance * 100) / 100,
      closing_balance: Math.round(closingBalance * 100) / 100,
      total_cash_in: Math.round(totalCashIn * 100) / 100,
      total_cash_out: Math.round(totalCashOut * 100) / 100,
      from_date: fromDate || null,
      to_date: toDate || null,
      entries_count: entries.length,
      entries,
    };
  }
}
