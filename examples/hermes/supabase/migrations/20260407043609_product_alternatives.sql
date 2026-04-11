CREATE TABLE product_alternatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products ON DELETE CASCADE,
  company_id uuid REFERENCES companies NOT NULL,
  supplier text NOT NULL,
  title text,
  url text,
  thumbnail text,
  price text,
  moq text,
  review_score numeric,
  review_count int,
  gold_supplier_years int,
  country text,
  source text DEFAULT 'alibaba',
  created_at timestamptz DEFAULT now(),
  UNIQUE(product_id, supplier, url)
);

CREATE INDEX idx_product_alternatives_product ON product_alternatives(product_id);
CREATE INDEX idx_product_alternatives_company ON product_alternatives(company_id);

ALTER TABLE product_alternatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members read alternatives" ON product_alternatives FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));

CREATE POLICY "Company members insert alternatives" ON product_alternatives FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));

CREATE POLICY "Company members delete alternatives" ON product_alternatives FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));
