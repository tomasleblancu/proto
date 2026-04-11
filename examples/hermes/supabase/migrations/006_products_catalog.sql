-- Products catalog: base de productos de la empresa
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies NOT NULL,
  name text NOT NULL,
  description text,
  category text,
  material text,
  dimensions text,
  weight text,
  colors text[],
  certifications text[],
  packaging text,
  hs_code text,
  origin_country text,
  reference_urls text[],
  reference_brand text,
  customization text,
  regulations text,
  image_urls text[],
  notes text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Order items: line items linking orders to products
CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders NOT NULL,
  product_id uuid REFERENCES products NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric,
  currency text DEFAULT 'USD',
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_products_company ON products(company_id);
CREATE INDEX idx_products_active ON products(company_id) WHERE active = true;
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User reads own products" ON products FOR SELECT
  USING (company_id IN (SELECT get_user_company_ids()));
CREATE POLICY "Admin manages products" ON products FOR ALL
  USING (is_company_admin(company_id));

CREATE POLICY "User reads own order_items" ON order_items FOR SELECT
  USING (order_id IN (SELECT id FROM orders WHERE company_id IN (SELECT get_user_company_ids())));
CREATE POLICY "Admin manages order_items" ON order_items FOR ALL
  USING (order_id IN (SELECT id FROM orders WHERE is_company_admin(company_id)));

-- Update reorder_rules to reference products
ALTER TABLE reorder_rules ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products;
