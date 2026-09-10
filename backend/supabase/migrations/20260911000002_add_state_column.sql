-- ==============================================================================
-- Add State column to Companies and Parties
-- ==============================================================================
-- Description: Adds state field for automated GST intra-state (CGST+SGST) vs inter-state (IGST) tax calculation
-- ==============================================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS state VARCHAR(100);
COMMENT ON COLUMN companies.state IS 'Operating state of the company for GST intra/inter-state tax rules';

ALTER TABLE parties ADD COLUMN IF NOT EXISTS state VARCHAR(100);
COMMENT ON COLUMN parties.state IS 'Operating state of the party for GST intra/inter-state tax rules';
