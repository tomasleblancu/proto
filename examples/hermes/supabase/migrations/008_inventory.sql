-- Inventory types per product
-- Each product has stock in 3 stages:
--   reserved: committed in an order but not yet shipped (sourcing/draft/po_sent/production)
--   in_transit: shipped but not yet received (shipped/in_transit/customs)
--   available: received and ready for sale (delivered)

CREATE TABLE inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products NOT NULL,
  company_id uuid REFERENCES companies NOT NULL,
  reserved integer NOT NULL DEFAULT 0,
  in_transit integer NOT NULL DEFAULT 0,
  available integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(product_id, company_id)
);

-- Inventory adjustments log (every +/- change is tracked)
CREATE TYPE adjustment_type AS ENUM (
  'manual',          -- manual correction
  'order_created',   -- reserved += qty when order created
  'order_shipped',   -- reserved -= qty, in_transit += qty
  'order_delivered', -- in_transit -= qty, available += qty
  'order_cancelled', -- reserved -= qty (return to pool)
  'sale',            -- available -= qty (sold)
  'return',          -- available += qty (customer return)
  'damage',          -- available -= qty (damaged/lost)
  'count'            -- physical count correction
);

CREATE TABLE inventory_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products NOT NULL,
  company_id uuid REFERENCES companies NOT NULL,
  adjustment_type adjustment_type NOT NULL,
  field text NOT NULL, -- 'reserved', 'in_transit', or 'available'
  quantity integer NOT NULL, -- positive = add, negative = subtract
  reason text,
  order_id uuid REFERENCES orders, -- linked order if applicable
  created_by text, -- user who made the adjustment
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_company ON inventory(company_id);
CREATE INDEX idx_adjustments_product ON inventory_adjustments(product_id);
CREATE INDEX idx_adjustments_company ON inventory_adjustments(company_id);
CREATE INDEX idx_adjustments_order ON inventory_adjustments(order_id);

-- RLS
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User reads own inventory" ON inventory FOR SELECT
  USING (company_id IN (SELECT get_user_company_ids()));
CREATE POLICY "Admin manages inventory" ON inventory FOR ALL
  USING (is_company_admin(company_id));

CREATE POLICY "User reads own adjustments" ON inventory_adjustments FOR SELECT
  USING (company_id IN (SELECT get_user_company_ids()));
CREATE POLICY "Admin manages adjustments" ON inventory_adjustments FOR ALL
  USING (is_company_admin(company_id));
