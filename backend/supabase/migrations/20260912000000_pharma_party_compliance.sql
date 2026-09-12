-- ==============================================================================
-- Migration: Pharma Party Compliance Fields
-- Description: Adds pharma compliance fields (Drug License Number & Expiry Date),
--              contact details (email), address segmentation (city, pincode),
--              and financial ledger opening balance fields to parties.
-- ==============================================================================

ALTER TABLE parties ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS state VARCHAR(100);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS pincode VARCHAR(20);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS pan VARCHAR(20);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS drug_license_number VARCHAR(100);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS drug_license_expiry DATE;
ALTER TABLE parties ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE parties ADD COLUMN IF NOT EXISTS opening_balance_type VARCHAR(10) DEFAULT 'cr';

COMMENT ON COLUMN parties.drug_license_number IS 'Pharma wholesale/distributor drug license number (e.g. 20B/21B).';
COMMENT ON COLUMN parties.drug_license_expiry IS 'Expiration date of the drug license for compliance alerts.';
COMMENT ON COLUMN parties.pan IS 'Income Tax Permanent Account Number (PAN) of the party.';
COMMENT ON COLUMN parties.opening_balance IS 'Initial opening balance when onboarding party.';
COMMENT ON COLUMN parties.opening_balance_type IS 'Debit (dr) or Credit (cr) indicator for opening balance.';
