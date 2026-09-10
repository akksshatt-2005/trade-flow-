-- ==============================================================================
-- Add Reorder Threshold to Items
-- ==============================================================================
-- Description: Adds optional low-stock reorder threshold to the items table
-- ==============================================================================

ALTER TABLE items ADD COLUMN IF NOT EXISTS reorder_threshold NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
COMMENT ON COLUMN items.reorder_threshold IS 'Minimum stock level threshold for triggering low-stock alerts';
