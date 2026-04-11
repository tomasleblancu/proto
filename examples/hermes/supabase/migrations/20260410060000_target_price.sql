-- Precio de venta target por item — permite calcular margen en el costeo.
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS target_unit_price numeric,
  ADD COLUMN IF NOT EXISTS target_currency text DEFAULT 'CLP';
