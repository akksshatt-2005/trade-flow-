-- ==============================================================================
-- Cash Account & Cash Ledger Migration
-- ==============================================================================
-- Description:
-- 1. Adds cash_opening_balance to companies table.
-- 2. Adds is_system_account flag to parties table.
-- 3. Adds walkin buyer details to sales_invoices and purchase_invoices.
-- 4. Ensures all existing companies have a default system 'Cash' party.
-- ==============================================================================

-- 1. Add cash_opening_balance to companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS cash_opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
COMMENT ON COLUMN companies.cash_opening_balance IS 'Initial cash balance for the company cash ledger';

-- 2. Add is_system_account to parties table
ALTER TABLE parties ADD COLUMN IF NOT EXISTS is_system_account BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN parties.is_system_account IS 'Indicates system-reserved accounts like Cash that cannot be deleted or have their type altered';

-- 3. Add walk-in details to sales_invoices
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS walkin_name VARCHAR(255);
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS walkin_phone VARCHAR(50);
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS walkin_address TEXT;
COMMENT ON COLUMN sales_invoices.walkin_name IS 'Optional walk-in buyer name for cash transactions';
COMMENT ON COLUMN sales_invoices.walkin_phone IS 'Optional walk-in buyer phone for cash transactions';
COMMENT ON COLUMN sales_invoices.walkin_address IS 'Optional walk-in buyer address for cash transactions';

-- 4. Add walk-in details to purchase_invoices
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS walkin_name VARCHAR(255);
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS walkin_phone VARCHAR(50);
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS walkin_address TEXT;
COMMENT ON COLUMN purchase_invoices.walkin_name IS 'Optional walk-in supplier name for cash transactions';
COMMENT ON COLUMN purchase_invoices.walkin_phone IS 'Optional walk-in supplier phone for cash transactions';
COMMENT ON COLUMN purchase_invoices.walkin_address IS 'Optional walk-in supplier address for cash transactions';

-- 5. Backfill: Ensure all existing companies have a system 'Cash' party
INSERT INTO parties (company_id, name, type, is_system_account)
SELECT c.id, 'Cash', 'both'::party_type, TRUE
FROM companies c
WHERE NOT EXISTS (
    SELECT 1 FROM parties p
    WHERE p.company_id = c.id AND (p.name = 'Cash' OR p.is_system_account = TRUE)
);

-- 6. Index for fast querying of cash transactions & system parties
CREATE INDEX IF NOT EXISTS idx_parties_system_account ON parties(company_id, is_system_account);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_party_status_date ON sales_invoices(company_id, party_id, status, invoice_date);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_party_status_date ON purchase_invoices(company_id, party_id, status, invoice_date);
