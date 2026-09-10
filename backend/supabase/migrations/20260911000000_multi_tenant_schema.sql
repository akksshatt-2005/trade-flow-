-- ==============================================================================
-- Multi-Tenant Billing and Inventory System Schema
-- ==============================================================================
-- Architecture: Option (a) - Supabase Auth (auth.users) as Single Source of Truth
-- Description: Sets up the multi-tenant architecture where one login user
--              can belong to or own multiple companies with fully isolated data.
-- ==============================================================================

-- Enable UUID and cryptographic extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. Custom Enum Types
-- ==============================================================================

DO $$ BEGIN
    CREATE TYPE user_company_role AS ENUM ('owner', 'accountant', 'salesperson');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE party_type AS ENUM ('customer', 'vendor', 'both');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE stock_movement_type AS ENUM ('purchase_in', 'sale_out', 'adjustment_in', 'adjustment_out');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE invoice_status AS ENUM ('draft', 'confirmed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- 2. Tables Definition
-- ==============================================================================

-- Table 1: users (Public profile / mirror table linked to auth.users)
-- Purpose: Mirrors Supabase auth.users for joins, tenant mappings, and display.
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE users IS 'Public user profile table mapped 1:1 with Supabase auth.users. Password credentials are exclusively managed by auth.users.';

-- Table 2: companies
-- Purpose: Tenant entity representing a distinct company or medicine shop.
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    gst_number VARCHAR(50),
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE companies IS 'Tenant entities (e.g. separate pharmacies/shops) providing complete tenant boundary.';

-- Table 3: user_companies
-- Purpose: Multi-tenant membership link table assigning roles to users per company.
CREATE TABLE IF NOT EXISTS user_companies (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    role user_company_role NOT NULL DEFAULT 'owner',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, company_id)
);
COMMENT ON TABLE user_companies IS 'Bridge table mapping users to companies with granular tenant roles.';

-- Table 4: items
-- Purpose: Product/Medicine catalog isolated per company with unique SKU per company.
CREATE TABLE IF NOT EXISTS items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    hsn_code VARCHAR(50),
    gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    unit VARCHAR(50) NOT NULL DEFAULT 'pcs',
    opening_stock NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_items_company_sku UNIQUE (company_id, sku)
);
COMMENT ON TABLE items IS 'Company-isolated product/medicine catalog. SKUs are strictly unique per company.';

-- Table 5: parties
-- Purpose: Customer and vendor directory isolated per company.
CREATE TABLE IF NOT EXISTS parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type party_type NOT NULL DEFAULT 'customer',
    phone VARCHAR(50),
    address TEXT,
    gst_number VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE parties IS 'Customer and vendor registry isolated per company.';

-- Table 6: stock_ledger
-- Purpose: Immutable append-only transaction ledger for inventory movements.
CREATE TABLE IF NOT EXISTS stock_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    movement_type stock_movement_type NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL,
    reference_type VARCHAR(50) NOT NULL,
    reference_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE stock_ledger IS 'Append-only inventory audit ledger. Strictly immutable (UPDATE and DELETE forbidden via database trigger).';

-- Table 7: purchase_invoices
-- Purpose: Header records for inward purchase invoices from suppliers/vendors.
CREATE TABLE IF NOT EXISTS purchase_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(100) NOT NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    gst_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    status invoice_status NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_purchase_invoices_company_number UNIQUE (company_id, invoice_number)
);
COMMENT ON TABLE purchase_invoices IS 'Inward vendor bills header records isolated per company.';

-- Table 8: purchase_invoice_lines
-- Purpose: Line items detailing medicines, quantity, rates, and taxes on purchase invoices.
CREATE TABLE IF NOT EXISTS purchase_invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    quantity NUMERIC(12, 2) NOT NULL,
    rate NUMERIC(12, 2) NOT NULL,
    gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    line_total NUMERIC(14, 2) NOT NULL
);
COMMENT ON TABLE purchase_invoice_lines IS 'Line items belonging to inward purchase invoices.';

-- Table 9: sales_invoices
-- Purpose: Header records for outward sales invoices / bills to customers.
CREATE TABLE IF NOT EXISTS sales_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(100) NOT NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    gst_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    status invoice_status NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_sales_invoices_company_number UNIQUE (company_id, invoice_number)
);
COMMENT ON TABLE sales_invoices IS 'Outward customer billing invoices header records isolated per company.';

-- Table 10: sales_invoice_lines
-- Purpose: Line items detailing medicines, quantity, rates, and taxes on sales invoices.
CREATE TABLE IF NOT EXISTS sales_invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    quantity NUMERIC(12, 2) NOT NULL,
    rate NUMERIC(12, 2) NOT NULL,
    gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    line_total NUMERIC(14, 2) NOT NULL
);
COMMENT ON TABLE sales_invoice_lines IS 'Line items belonging to outward sales invoices.';

-- ==============================================================================
-- 3. Database-Level Immutability Enforcement for Stock Ledger
-- ==============================================================================

CREATE OR REPLACE FUNCTION prevent_stock_ledger_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Stock ledger is an append-only audit table. UPDATE and DELETE operations are strictly forbidden on table stock_ledger.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_ledger_prevent_update_delete ON stock_ledger;
CREATE TRIGGER trg_stock_ledger_prevent_update_delete
BEFORE UPDATE OR DELETE ON stock_ledger
FOR EACH ROW
EXECUTE FUNCTION prevent_stock_ledger_modification();

-- ==============================================================================
-- 4. Performance & Tenant-Isolation Indexes
-- ==============================================================================

-- User Companies
CREATE INDEX IF NOT EXISTS idx_user_companies_company_id ON user_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_user_id ON user_companies(user_id);

-- Items
CREATE INDEX IF NOT EXISTS idx_items_company_id ON items(company_id);
CREATE INDEX IF NOT EXISTS idx_items_company_name ON items(company_id, name);

-- Parties
CREATE INDEX IF NOT EXISTS idx_parties_company_id ON parties(company_id);
CREATE INDEX IF NOT EXISTS idx_parties_company_type ON parties(company_id, type);

-- Stock Ledger
CREATE INDEX IF NOT EXISTS idx_stock_ledger_company_id ON stock_ledger(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_item_id ON stock_ledger(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_company_item ON stock_ledger(company_id, item_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_created_at ON stock_ledger(created_at);

-- Purchase Invoices & Lines
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_company_id ON purchase_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_party_id ON purchase_invoices(party_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_company_date ON purchase_invoices(company_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_lines_invoice_id ON purchase_invoice_lines(purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_lines_item_id ON purchase_invoice_lines(item_id);

-- Sales Invoices & Lines
CREATE INDEX IF NOT EXISTS idx_sales_invoices_company_id ON sales_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_party_id ON sales_invoices(party_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_company_date ON sales_invoices(company_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_lines_invoice_id ON sales_invoice_lines(sales_invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_lines_item_id ON sales_invoice_lines(item_id);
