-- Costings: estimado vs real para cada item de un pedido.
-- `estimated` se llena en preliminary_costing (o antes con proforma).
-- `actual` se actualiza progresivamente con cada pago/factura real.

CREATE TABLE costings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies NOT NULL,
  order_id uuid REFERENCES orders NOT NULL,
  item_id uuid REFERENCES order_items,  -- NULL = costeo consolidado del pedido

  -- Moneda base del costeo y tipo de cambio USD→CLP al momento del estimate
  currency text NOT NULL DEFAULT 'USD',
  fx_rate numeric,                     -- USD→CLP usado para estimar

  -- Breakdown estimado (llenado en preliminary_costing o antes)
  estimated jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Breakdown real (actualizado con cada pago/factura)
  actual jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Campos de auditoría
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indices
CREATE INDEX idx_costings_order ON costings(order_id);
CREATE UNIQUE INDEX idx_costings_item_unique ON costings(item_id) WHERE item_id IS NOT NULL;
CREATE UNIQUE INDEX idx_costings_order_consolidated ON costings(order_id) WHERE item_id IS NULL;

-- RLS
ALTER TABLE costings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin costings" ON costings FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));
CREATE POLICY "Client read costings" ON costings FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));

-- updated_at trigger
CREATE OR REPLACE FUNCTION trg_costings_updated_at()
  RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_costings_updated_at
  BEFORE UPDATE ON costings
  FOR EACH ROW EXECUTE FUNCTION trg_costings_updated_at();

COMMENT ON TABLE costings IS 'Costeo estimado vs real por item. JSONB fields: {fob, freight, insurance, duties, iva, port, customs_agent, deconsolidation, documentation, storage, receiving, transport, samples, other, landed_total}';
