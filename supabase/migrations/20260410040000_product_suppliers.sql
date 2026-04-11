-- Product ↔ Supplier: un producto puede tener múltiples proveedores.
-- Al crear un order_item se elige product_id + supplier_id de esta tabla.

CREATE TABLE product_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies ON DELETE CASCADE,
  unit_price numeric,
  currency text DEFAULT 'USD',
  moq integer,
  lead_time_days integer,
  is_preferred boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, supplier_id)
);

CREATE INDEX idx_product_suppliers_product ON product_suppliers(product_id);
CREATE INDEX idx_product_suppliers_supplier ON product_suppliers(supplier_id);
CREATE INDEX idx_product_suppliers_company ON product_suppliers(company_id);

ALTER TABLE product_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin product_suppliers" ON product_suppliers FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));
CREATE POLICY "Client read product_suppliers" ON product_suppliers FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));
