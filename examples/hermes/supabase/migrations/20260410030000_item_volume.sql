-- Volumen y peso unitario por item (para costeo y prorrateo por CBM)
ALTER TABLE order_items
  ADD COLUMN cbm_unit numeric,       -- m3 por unidad
  ADD COLUMN weight_unit_kg numeric; -- kg por unidad
